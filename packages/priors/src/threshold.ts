/**
 * Threshold solver for the M4.5 probability layer.
 *
 * For a fixed (attacker_kit, defender_kit, move, field) the calc is monotone
 * in the attacker's offensive stat: bigger Atk/SpA → bigger damage range →
 * "stronger" KO outcome. So there exists a threshold T such that any
 * attacker with offensive stat ≥ T guarantees the targeted outcome (1HKO
 * for `T1`, 2HKO for `T2`). We binary-search over a conservative stat range
 * and return both thresholds in one pass.
 *
 * Why this lives in `priors/`, not `engine/`:
 *   - Per `qc-structural-authority.md` §A2, `priors → engine` is a
 *     types-only edge; runtime imports are a structural finding.
 *   - The threshold solver mutates a Pokemon's `rawStats` between calc
 *     calls — that's below the level of the existing `engine.calc` wrapper,
 *     which expects a fully-built `Pokemon` per call.
 *   - The wrapper around `@smogon/calc.calculate` is ~10 lines; duplicating
 *     it here keeps the rule intact and avoids dragging engine into priors'
 *     runtime closure. If the duplication grows, lift to a shared util.
 *
 * Acceptance: ~9 calc calls per (kit, kit, move, field) is fine — we'll
 * cache the result via `cache.ts`. Premature to optimise toward the
 * closed-form solution.
 */

import { Pokemon, calculate } from '@smogon/calc';
import type { Field, Move } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface.js';
import type { KitCandidate, ThresholdResult } from './types.js';

/**
 * Stat-search range for level-50 doubles. The lower bound (50) covers
 * minimum-investment / hindering-nature cases; the upper bound (250) sits
 * above any single-target attacker we expect under +0 boost in M-A. Stages
 * past +0 are the calc's job (boosts are an attacker-state input), not the
 * threshold solver's — the solver isolates the *raw* stat axis.
 */
const STAT_MIN = 50;
const STAT_MAX = 250;

/**
 * Which raw-stat key drives a move's damage output? Physical contact /
 * non-contact moves both index `atk`; special moves index `spa`. The calc
 * itself reads these via mechanics/util.js (e.g. `attacker.rawStats.atk`),
 * so overriding the raw stat is the cheapest way to evaluate damage at a
 * candidate stat without rebuilding a Pokemon per iteration.
 */
function offensiveStatKey(move: Move): 'atk' | 'spa' | undefined {
  if (move.category === 'Physical') return 'atk';
  if (move.category === 'Special') return 'spa';
  return undefined;
}

/**
 * Pokémon-Showdown style id helper. Mirrors `expand.ts` so kit-string ↔
 * `@smogon/calc` data lookups normalise the same way.
 */
function toID(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Build a calc-ready `Pokemon` from a `KitCandidate`. Item / ability /
 * moves / nature / EVs flow through verbatim; level is fixed at 50 (VGC
 * default; the format-rotation hook can lift this later).
 *
 * `evs` is filtered to defined keys before passing in; the calc's
 * `Pokemon` constructor coerces missing keys to 0 (gen ≥ 3) which matches
 * Showdown's behaviour.
 */
function buildPokemon(gen: Generation, kit: KitCandidate): Pokemon {
  const evs: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>> = {};
  for (const key of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
    const v = kit.evs[key];
    if (typeof v === 'number') evs[key] = v;
  }
  return new Pokemon(gen, kit.species, {
    level: 50,
    item: kit.item as never,
    ability: kit.ability as never,
    moves: kit.moves as never,
    nature: kit.nature as never,
    evs,
  });
}

/**
 * Damage-only calc helper. Mirrors `engine.calc` but returns the (min, max,
 * koChance, notation) tuple inline — kept minimal so the threshold loop's
 * inner body is one allocation and one `calculate()` call.
 *
 * Zero-damage matchups (e.g. Normal-type move into Ghost) short-circuit to
 * a clean "no damage" result, identical to `engine/src/calc.ts`.
 */
function damageOf(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field?: Field,
): { min: number; max: number; koChance: number | undefined; notation: string } {
  const result = calculate(gen, attacker, defender, move, field);
  const [min, max] = result.range();
  if (max === 0) return { min: 0, max: 0, koChance: 0, notation: 'no damage' };
  const ko = result.kochance();
  return { min, max, koChance: ko.chance, notation: ko.text };
}

/**
 * "Does damage at offensive stat S guarantee a 1HKO?" — the calc's
 * `koChance: 1` plus a `notation` containing "OHKO" matches the existing
 * `score.hasGuaranteedOhko` predicate in engine/src/score.ts. Using the
 * same predicate keeps T1 monotone with the engine's downstream "did we
 * 1HKO this?" check.
 */
function isOhko(result: { koChance: number | undefined; notation: string }): boolean {
  return result.koChance === 1 && result.notation.includes('OHKO');
}

/**
 * "Does damage at offensive stat S all-but-guarantee a 2HKO?" The cleanest
 * signal `@smogon/calc` exposes without simulating turn 2 is `koChance >=
 * 0.5` paired with a notation that names a 1HKO or 2HKO outcome — the
 * 2HKO notation includes "2HKO" verbatim, the OHKO case includes "OHKO".
 *
 * We deliberately use `koChance >= 0.5` rather than the strict `=== 1`
 * used for T1: a 2HKO with 50% probability is the threshold a competitive
 * player treats as "going to 2HKO most of the time" and is what the
 * downstream `score` should reward. The choice is documented in the
 * design doc §M4.5.
 */
function isTwoHko(result: { koChance: number | undefined; notation: string }): boolean {
  if (result.koChance === undefined) return false;
  if (result.koChance < 0.5) return false;
  return result.notation.includes('OHKO') || result.notation.includes('2HKO');
}

/**
 * Binary-search the smallest integer S ∈ [lo, hi] for which `predicate(S)`
 * holds, given monotonicity in S. Returns `Number.POSITIVE_INFINITY` if
 * no S in range satisfies the predicate.
 *
 * `evaluate(S)` is a single calc call; the search performs at most
 * ⌈log2(hi - lo + 1)⌉ ≈ 8–9 evaluations for the default [50, 250] window.
 */
function findSmallestSatisfying(lo: number, hi: number, predicate: (s: number) => boolean): number {
  // Confirm the predicate is satisfiable at the upper bound first; if the
  // attacker can't OHKO at S = hi it can't at any plausible S either.
  if (!predicate(hi)) return Number.POSITIVE_INFINITY;

  // If even the lowest stat satisfies, threshold is the floor.
  if (predicate(lo)) return lo;

  // Invariant: predicate(hi) === true, predicate(lo) === false. Shrink to
  // the smallest hi where the predicate still holds.
  let l = lo;
  let h = hi;
  while (l + 1 < h) {
    const mid = (l + h) >> 1;
    if (predicate(mid)) h = mid;
    else l = mid;
  }
  return h;
}

export interface ThresholdSolverOptions {
  /**
   * Override the search range. Defaults to [50, 250] (level-50 raw-stat
   * range covering min-investment to max-investment + boosts). Tests can
   * narrow this for hand-computed comparisons; production should leave it
   * at the default.
   */
  readonly statMin?: number;
  readonly statMax?: number;
}

/**
 * Compute T1, T2 for (attacker_kit, defender_kit, move, field).
 *
 * The solver builds both Pokémon once, runs binary search varying the
 * attacker's offensive `rawStats` slot in place between calc calls, and
 * returns the two thresholds. Status moves (no offensive stat) return
 * `{ t1: Infinity, t2: Infinity }` — `score` reads infinity as "no
 * pressure" rather than as a valid threshold.
 *
 * Pure: the only side effect is on the locally-allocated `Pokemon`
 * instance, which is discarded on return. No fs / net / process.
 */
export function solveThreshold(
  gen: Generation,
  attackerKit: KitCandidate,
  defenderKit: KitCandidate,
  move: Move,
  field?: Field,
  options: ThresholdSolverOptions = {},
): ThresholdResult {
  const statKey = offensiveStatKey(move);
  if (statKey === undefined) {
    return { t1: Number.POSITIVE_INFINITY, t2: Number.POSITIVE_INFINITY };
  }

  // Build both Pokémon in a guarded block: `@smogon/calc.Pokemon` throws
  // on species names it can't resolve to a base-stats record (the
  // gen9champions mod isn't wired yet, so a name typo or a Champions-only
  // species the vanilla Gen 9 dex doesn't ship surfaces here). Bail with
  // infinity rather than letting the throw propagate up through matrix
  // construction.
  let attacker: Pokemon;
  let defender: Pokemon;
  try {
    attacker = buildPokemon(gen, attackerKit);
    defender = buildPokemon(gen, defenderKit);
  } catch {
    return { t1: Number.POSITIVE_INFINITY, t2: Number.POSITIVE_INFINITY };
  }

  const lo = options.statMin ?? STAT_MIN;
  const hi = options.statMax ?? STAT_MAX;

  // Belt-and-braces: even when construction succeeds, `rawStats[statKey]`
  // can be undefined / NaN if the species' base-stats record is incomplete.
  if (typeof attacker.rawStats[statKey] !== 'number') {
    return { t1: Number.POSITIVE_INFINITY, t2: Number.POSITIVE_INFINITY };
  }

  const evaluate = (s: number): { koChance: number | undefined; notation: string } => {
    // Mutate raw + computed stat in place; calc reads `rawStats[atk|spa]`
    // directly (mechanics/util.js getModifiedStat) and `stats` is its
    // boost-applied mirror. Setting both keeps the boost path consistent
    // even though tests pin boost = 0.
    attacker.rawStats[statKey] = s;
    attacker.stats[statKey] = s;
    return damageOf(gen, attacker, defender, move, field);
  };

  const t1 = findSmallestSatisfying(lo, hi, (s) => isOhko(evaluate(s)));
  const t2 = findSmallestSatisfying(lo, hi, (s) => isTwoHko(evaluate(s)));

  return { t1, t2 };
}

/**
 * Internal helpers exposed for unit tests. Not exported from `index.ts`;
 * importing this object outside the priors package is a structural
 * finding via the test/ vs src/ boundary.
 */
export const __testing = {
  STAT_MIN,
  STAT_MAX,
  findSmallestSatisfying,
  isOhko,
  isTwoHko,
  offensiveStatKey,
  toID,
};
