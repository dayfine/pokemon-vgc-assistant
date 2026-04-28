import type { Field } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface';
import { matrix } from './matrix.js';
import type { OppKitOption, OutcomeProbabilityFn } from './matrix.js';
import { score } from './score.js';
import type { Score, ScoreWeights } from './score.js';
import { speedTiers } from './speed.js';
import type { SideSpeedModifiers, SpeedInput } from './speed.js';
import type { Pokemon, Side, TeamSet } from './types.js';

/**
 * One ranked entry in `recommendBP`'s output: the picked 4-mon combo and
 * the score it earned. The combo preserves the input order of `myTeam`
 * — picks aren't permuted, so `combo[0]` is the earliest-listed pick in
 * `myTeam`. That keeps test assertions simple ("the bring is the first 4
 * mons" maps to the first element of `myTeam`).
 */
export interface RankedPick {
  readonly combo: TeamSet;
  readonly score: Score;
}

export interface RankedPicks {
  readonly picks: readonly RankedPick[];
}

export interface RecommendBpOptions {
  /**
   * Field state shared by both directions of the matrix. Defaults to
   * `undefined`, which the calc layer treats as a singles, no-weather, no-
   * terrain field. Callers running VGC scenarios should pass
   * `new Field({ gameType: 'Doubles' })` (and any active terrain/weather).
   */
  readonly field?: Field;
  /**
   * Per-side speed modifiers (Tailwind, Trick Room). Per-mon mods (boost,
   * paralysis, scarf override) are not yet exposed at this layer — pass
   * the speed ranking directly via the lower-level `score` API if needed.
   */
  readonly sideSpeedModifiers?: { [K in Side]?: SideSpeedModifiers };
  /**
   * How many picks to return. Defaults to 3 per `dev/plans/01-mvp.md` §M3.
   * The function still scores all C(6,4) = 15 combos; this only trims the
   * returned array.
   */
  readonly topK?: number;
  /**
   * Optional per-opp-slot kit candidates. When provided, the matrix
   * iterates over them and `score` consumes weighted KitCell payloads.
   * Length must match `oppTeam`. Omit for the M3 backwards-compat path:
   * each cell collapses to a single weight-1 KitCell built from the
   * concrete opp Pokémon.
   */
  readonly oppKits?: ReadonlyArray<readonly OppKitOption[]>;
  /**
   * Optional outcome-probability function. Forwarded to `matrix`. See
   * `OutcomeProbabilityFn` for the dep-direction rationale.
   */
  readonly outcomeProbability?: OutcomeProbabilityFn;
}

const DEFAULT_TOP_K = 3;
const DEFAULT_BRING_SIZE = 4;

/**
 * Enumerate all k-subsets of `team` preserving input order. For C(6,4) this
 * is 15 combos; the recursion is fine even at k=4. Implemented inline (no
 * combinatorics dependency) to keep `engine` zero-dep beyond `@smogon/calc`.
 */
function combinations<T>(team: readonly T[], k: number): T[][] {
  const result: T[][] = [];
  const buf: T[] = [];
  function recur(start: number, remaining: number): void {
    if (remaining === 0) {
      result.push(buf.slice());
      return;
    }
    // The earliest start for the next slot must leave room for the
    // `remaining - 1` slots after it. Equivalent: i + remaining <= length.
    const limit = team.length - remaining;
    for (let i = start; i <= limit; i++) {
      const item = team[i];
      if (item === undefined) continue;
      buf.push(item);
      recur(i + 1, remaining - 1);
      buf.pop();
    }
  }
  recur(0, k);
  return result;
}

/**
 * Recommend the top-k 4-of-6 brings against an opponent's 6.
 *
 * Pure: takes data in, returns data out. Internally calls `matrix`,
 * `speedTiers`, and `score` — those are also pure, so the whole chain is
 * deterministic given the inputs.
 *
 * Ordering is stable: ties on `score.total` resolve by the combos'
 * generation order (earlier = higher), which matches the natural reading
 * of `myTeam` left-to-right. v1 doesn't claim a meaningful tiebreaker;
 * tests assert *strict* ordering between distinct totals only.
 *
 * Open-sheet equivalent: callers who already know opp's full kits pass
 * concrete `Pokemon`s in `oppTeam` and omit `oppKits`. Closed-sheet
 * callers (only species available) build `oppKits` from priors and pass
 * representative `Pokemon`s in `oppTeam` — see `recommendBPFromSpecies`.
 */
export function recommendBP(
  gen: Generation,
  myTeam: TeamSet,
  oppTeam: TeamSet,
  weights: ScoreWeights,
  options: RecommendBpOptions = {},
): RankedPicks {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const m = matrix(gen, myTeam, oppTeam, {
    ...(options.field !== undefined ? { field: options.field } : {}),
    ...(options.oppKits !== undefined ? { oppKits: options.oppKits } : {}),
    ...(options.outcomeProbability !== undefined
      ? { outcomeProbability: options.outcomeProbability }
      : {}),
  });
  const speedInputs: SpeedInput[] = [
    ...myTeam.map((p): SpeedInput => ({ pokemon: p, side: 'my' })),
    ...oppTeam.map((p): SpeedInput => ({ pokemon: p, side: 'opp' })),
  ];
  const speed = speedTiers(speedInputs, options.sideSpeedModifiers ?? {});

  const combos = combinations(myTeam, DEFAULT_BRING_SIZE);
  const ranked: RankedPick[] = combos.map((combo) => ({
    combo,
    score: score(combo, oppTeam, m, speed, weights),
  }));

  // Stable sort: vitest, V8, Node all guarantee stable Array.sort. Equal
  // totals keep their generation order (earlier indexes come first).
  ranked.sort((a, b) => b.score.total - a.score.total);

  return { picks: ranked.slice(0, topK) };
}

/**
 * One opp slot's kit-candidate distribution, as `recommendBPFromSpecies`
 * consumes it. The `pokemon` is the representative `Pokemon` to use for
 * speed/role lookups (the highest-weight kit makes a fine choice); the
 * `kits` enumerate the full distribution for the matrix layer.
 *
 * Why a separate type and not just `OppKitOption[]`: the species-input
 * path also needs *one canonical Pokémon per opp slot* for the speed
 * ranking, which lives in `oppTeam` and isn't re-derivable from kit
 * options alone (each kit option's `pokemon` is built for damage calc;
 * the speed layer picks one).
 */
export interface OppSlotPriors {
  readonly representative: Pokemon;
  readonly kits: readonly OppKitOption[];
}

export interface RecommendBpFromSpeciesOptions {
  readonly field?: Field;
  readonly sideSpeedModifiers?: { [K in Side]?: SideSpeedModifiers };
  readonly topK?: number;
  /**
   * Optional outcome-probability function — see `OutcomeProbabilityFn`.
   * Closed-sheet callers wire `priors.outcomeProbability(...)` here at
   * the CLI/web layer.
   */
  readonly outcomeProbability?: OutcomeProbabilityFn;
}

/**
 * Closed-sheet entry point: caller passes opp species + priors instead
 * of fully-built opp `Pokemon`s. The function reduces to `recommendBP`
 * after picking each opp slot's `representative` for speed-ranking and
 * threading `kits` into the matrix.
 *
 * Why a separate entry point and not a polymorphic overload of
 * `recommendBP`: explicit typing of the closed-sheet shape keeps M3's
 * concrete-`Pokemon` ergonomics pristine for tests / open-sheet callers,
 * and avoids `unknown`-style narrowing inside the function body.
 */
export function recommendBPFromSpecies(
  gen: Generation,
  myTeam: TeamSet,
  oppSlots: readonly OppSlotPriors[],
  weights: ScoreWeights,
  options: RecommendBpFromSpeciesOptions = {},
): RankedPicks {
  const oppTeam = oppSlots.map((s) => s.representative);
  const oppKits = oppSlots.map((s) => s.kits);
  return recommendBP(gen, myTeam, oppTeam, weights, {
    ...(options.field !== undefined ? { field: options.field } : {}),
    ...(options.sideSpeedModifiers !== undefined
      ? { sideSpeedModifiers: options.sideSpeedModifiers }
      : {}),
    ...(options.topK !== undefined ? { topK: options.topK } : {}),
    ...(options.outcomeProbability !== undefined
      ? { outcomeProbability: options.outcomeProbability }
      : {}),
    oppKits,
  });
}
