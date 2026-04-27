import type { MatchupMatrix, MatrixSide } from './matrix.js';
import type { SpeedRanking } from './speed.js';
import type { Matchup, Pokemon, Side, TeamSet } from './types.js';

/**
 * Weights applied by `score`. Engine owns the *type*; the *values* live in
 * `pva.config.ts` at the repo root, per `qc-behavioral-authority.md`
 * §Scoring. Engine never reads `pva.config.ts` itself — the caller (CLI,
 * tests, web) loads config and passes weights in.
 *
 * The scoring function is a transparent weighted sum:
 *
 *   score = ohkoThreats     * pickedKoOpp
 *         + speedControl    * pickedOutspeedOpp
 *         + defensiveAnswers * pickedSurvivesOpp
 *         - ohkoTaken       * oppKoPicked
 *         - roleGap         * unfilledRoles
 *
 * Sign is encoded in the formula above; weights are non-negative.
 */
export interface ScoreWeights {
  /** Per-opp-mon credit for having a guaranteed-OHKO answer in the bring. */
  readonly ohkoThreats: number;
  /** Per-opp-mon credit for outspeeding under base field state. */
  readonly speedControl: number;
  /**
   * Per-opp-mon credit for having a defensive answer — a picked mon that
   * survives every move the opp mon can throw at it.
   */
  readonly defensiveAnswers: number;
  /** Per-picked-mon penalty for being one-shot by some opp mon. */
  readonly ohkoTaken: number;
  /**
   * Penalty per *unfilled role* in the bring. v1 roles are coarse:
   * `physicalAttacker`, `specialAttacker`, `speedControl`. A bring missing
   * any of these eats one `roleGap` worth of penalty per missing role.
   */
  readonly roleGap: number;
}

/**
 * Coarse v1 role taxonomy. Drives the role-gap penalty term: a bring with
 * no Physical attacker, no Special attacker, or no Speed-control piece is
 * lopsided regardless of its calc numbers, and the eyeball test rejects it.
 */
export type Role = 'physicalAttacker' | 'specialAttacker' | 'speedControl';

const ALL_ROLES: readonly Role[] = ['physicalAttacker', 'specialAttacker', 'speedControl'];

/**
 * Heuristics for "which role does this mon serve". v1 is intentionally
 * coarse — engine has no priors, no usage data. Refinement comes in M4.
 */
const SPEED_CONTROL_MOVES: ReadonlySet<string> = new Set([
  'Tailwind',
  'Trick Room',
  'Icy Wind',
  'Electroweb',
  'Bulldoze',
  'Thunder Wave',
  'Glare',
  'Sticky Web',
  'After You',
]);

/** Movecategory predicate. Status moves don't count toward attacker roles. */
function isPhysicalAttackingMove(matchup: Matchup): boolean {
  return matchup.move.category === 'Physical';
}

function isSpecialAttackingMove(matchup: Matchup): boolean {
  return matchup.move.category === 'Special';
}

function hasSpeedControlMove(p: Pokemon): boolean {
  for (const m of p.moves) {
    if (m && SPEED_CONTROL_MOVES.has(m)) return true;
  }
  return false;
}

/**
 * Per-mon role classification. A mon may fill multiple roles (e.g. a
 * mixed attacker also bringing Tailwind). The role-gap term cares only
 * about *coverage* of the bring as a set, so we union the per-mon roles.
 */
function rolesFor(mon: Pokemon, attackerCells: readonly (readonly Matchup[])[]): ReadonlySet<Role> {
  const roles = new Set<Role>();
  if (hasSpeedControlMove(mon)) roles.add('speedControl');
  // Look at every move on this attacker against any defender. If any
  // physical move shows up in the matchup grid, the mon is a physical
  // attacker by virtue of carrying one. Same for special.
  for (const cell of attackerCells) {
    for (const m of cell) {
      if (isPhysicalAttackingMove(m)) roles.add('physicalAttacker');
      if (isSpecialAttackingMove(m)) roles.add('specialAttacker');
    }
  }
  return roles;
}

function roleGapCount(combo: TeamSet, mySide: MatrixSide): number {
  const covered = new Set<Role>();
  for (let i = 0; i < combo.length; i++) {
    const mon = combo[i];
    if (!mon) continue;
    const idx = mySide.attackers.indexOf(mon);
    // The combo is a subset of myTeam; the matrix's `my` side enumerates
    // myTeam in order. If the mon isn't in mySide, it can't be classified
    // by attacks (priors / extra teams aren't in scope for M3). Skip.
    const cells = idx >= 0 ? (mySide.cells[idx] ?? []) : [];
    for (const r of rolesFor(mon, cells)) covered.add(r);
  }
  return ALL_ROLES.filter((r) => !covered.has(r)).length;
}

/**
 * Does *any* move on attacker `attackerIdx` against defender `defenderIdx`
 * register a guaranteed OHKO? `koChance: 1` plus a `notation` containing
 * "OHKO" is the calc layer's signal — we use both to avoid mis-classifying
 * 2HKO/3HKO ranges that happen to roll `koChance: 1` for the multi-hit.
 */
function hasGuaranteedOhko(side: MatrixSide, attackerIdx: number, defenderIdx: number): boolean {
  const cell = side.cells[attackerIdx]?.[defenderIdx];
  if (!cell) return false;
  for (const m of cell) {
    if (m.damage.koChance === 1 && m.damage.notation.includes('OHKO')) return true;
  }
  return false;
}

/**
 * Survives every move the attacker can throw. A "defensive answer" in v1
 * means: even the attacker's best move never guarantees an OHKO. This is
 * symmetric with `hasGuaranteedOhko` from the other side.
 */
function survivesAllMoves(side: MatrixSide, attackerIdx: number, defenderIdx: number): boolean {
  const cell = side.cells[attackerIdx]?.[defenderIdx];
  if (!cell) return true; // no moves recorded → nothing can KO
  for (const m of cell) {
    if (m.damage.koChance === 1 && m.damage.notation.includes('OHKO')) return false;
  }
  return true;
}

/**
 * The number of opp mons for which the bring contains a guaranteed-OHKO
 * answer. Each opp mon counts at most once — having two answers to the
 * same threat doesn't double-count.
 */
function pickedKoOpp(combo: TeamSet, mySide: MatrixSide): number {
  let count = 0;
  for (let d = 0; d < mySide.defenders.length; d++) {
    let answered = false;
    for (const mon of combo) {
      const idx = mySide.attackers.indexOf(mon);
      if (idx < 0) continue;
      if (hasGuaranteedOhko(mySide, idx, d)) {
        answered = true;
        break;
      }
    }
    if (answered) count += 1;
  }
  return count;
}

/**
 * The number of picked mons that some opp mon guarantees an OHKO on. Each
 * picked mon counts at most once; if two opp threats both 1HKO the same
 * pick, that's still one penalty point.
 */
function oppKoPicked(combo: TeamSet, oppSide: MatrixSide): number {
  let count = 0;
  for (const mon of combo) {
    const dIdx = oppSide.defenders.indexOf(mon);
    if (dIdx < 0) continue;
    let killed = false;
    for (let a = 0; a < oppSide.attackers.length; a++) {
      if (hasGuaranteedOhko(oppSide, a, dIdx)) {
        killed = true;
        break;
      }
    }
    if (killed) count += 1;
  }
  return count;
}

/**
 * The number of opp mons that *some* picked mon survives every attack
 * from. An opp threat with no defensive answer in the bring contributes
 * 0; a threat that even one pick walls contributes 1.
 */
function pickedSurvivesOpp(combo: TeamSet, oppSide: MatrixSide): number {
  let count = 0;
  for (let a = 0; a < oppSide.attackers.length; a++) {
    let walled = false;
    for (const mon of combo) {
      const dIdx = oppSide.defenders.indexOf(mon);
      if (dIdx < 0) continue;
      if (survivesAllMoves(oppSide, a, dIdx)) {
        walled = true;
        break;
      }
    }
    if (walled) count += 1;
  }
  return count;
}

/**
 * The number of opp mons the bring outspeeds at base field state. We use
 * the speed ranking the caller passed in (Trick Room / Tailwind / scarves
 * baked into `effective` already). For each opp mon, count it if *some*
 * pick has higher effective speed.
 */
function pickedOutspeedOpp(
  combo: TeamSet,
  oppMons: TeamSet,
  speed: SpeedRanking,
  side: Side,
): number {
  // Find the smallest "rank" (= position in `speed.entries`) any pick has.
  const myRanks = new Set<number>();
  for (let i = 0; i < speed.entries.length; i++) {
    const e = speed.entries[i];
    if (!e) continue;
    if (e.side === side && combo.includes(e.pokemon)) myRanks.add(i);
  }
  if (myRanks.size === 0) return 0;
  let count = 0;
  for (const opp of oppMons) {
    let oppRank = -1;
    for (let i = 0; i < speed.entries.length; i++) {
      const e = speed.entries[i];
      if (!e) continue;
      if (e.pokemon === opp && e.side !== side) {
        oppRank = i;
        break;
      }
    }
    if (oppRank < 0) continue;
    // Outspeeds = appears earlier in the entries array (lower index =
    // moves first). Counts if *any* pick is faster than this opp mon.
    let beaten = false;
    for (const r of myRanks) {
      if (r < oppRank) {
        beaten = true;
        break;
      }
    }
    if (beaten) count += 1;
  }
  return count;
}

export interface ScoreBreakdown {
  readonly pickedKoOpp: number;
  readonly oppKoPicked: number;
  readonly pickedSurvivesOpp: number;
  readonly pickedOutspeedOpp: number;
  readonly unfilledRoles: number;
}

export interface Score {
  readonly total: number;
  readonly breakdown: ScoreBreakdown;
}

/**
 * Score a 4-mon bring against an opponent's 6-mon team, given the matrix
 * and speed ranking the caller has already computed. The matrix's `my`
 * side must be keyed by `myTeam` (the full 6); `combo` is a subset of
 * `myTeam`. The matrix's `opp` side must be keyed by `oppTeam`.
 *
 * Pure: identical inputs give identical outputs. `weights` is a parameter
 * — engine never reads `pva.config.ts`.
 */
export function score(
  combo: TeamSet,
  oppTeam: TeamSet,
  matchup: MatchupMatrix,
  speed: SpeedRanking,
  weights: ScoreWeights,
): Score {
  const breakdown: ScoreBreakdown = {
    pickedKoOpp: pickedKoOpp(combo, matchup.my),
    oppKoPicked: oppKoPicked(combo, matchup.opp),
    pickedSurvivesOpp: pickedSurvivesOpp(combo, matchup.opp),
    pickedOutspeedOpp: pickedOutspeedOpp(combo, oppTeam, speed, 'my'),
    unfilledRoles: roleGapCount(combo, matchup.my),
  };
  const total =
    weights.ohkoThreats * breakdown.pickedKoOpp +
    weights.speedControl * breakdown.pickedOutspeedOpp +
    weights.defensiveAnswers * breakdown.pickedSurvivesOpp -
    weights.ohkoTaken * breakdown.oppKoPicked -
    weights.roleGap * breakdown.unfilledRoles;
  return { total, breakdown };
}
