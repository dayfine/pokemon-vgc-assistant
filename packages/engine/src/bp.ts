import type { Field } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface';
import { matrix } from './matrix.js';
import { score } from './score.js';
import type { Score, ScoreWeights } from './score.js';
import { speedTiers } from './speed.js';
import type { SideSpeedModifiers, SpeedInput } from './speed.js';
import type { Side, TeamSet } from './types.js';

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
 */
export function recommendBP(
  gen: Generation,
  myTeam: TeamSet,
  oppTeam: TeamSet,
  weights: ScoreWeights,
  options: RecommendBpOptions = {},
): RankedPicks {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const m =
    options.field === undefined
      ? matrix(gen, myTeam, oppTeam)
      : matrix(gen, myTeam, oppTeam, { field: options.field });
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
