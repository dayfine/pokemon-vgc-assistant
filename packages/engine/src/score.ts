import type { MatchupMatrix, MatrixSide } from './matrix.js';
import type { SpeedRanking } from './speed.js';
import type { KitCell, Matchup, Pokemon, Side, TeamSet } from './types.js';

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
 *
 * As of the M3.5 matrix-payload swap, `pickedKoOpp`, `oppKoPicked`, and
 * `pickedSurvivesOpp` are *expected counts* — sums of `weight × P(...)`
 * across opp-kit candidates. Real-valued in [0, n_opp]. The breakdown
 * fields stay typed `number`; M3's integer behaviour is recovered when
 * the matrix has a single weight-1 KitCell per (a, d) pair (the
 * concrete-kit input path).
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
 * Iterate every `Matchup` in a (a, d) cell across all kit candidates.
 * Roles look at *what move categories the attacker can throw*, which is
 * a property of the attacker's kit; we union across all kits because
 * "can the bring's attacker hit physically under *some* plausible kit"
 * is the conservative read of role coverage. (For my-side attacker,
 * attacker's kit is concrete and there is exactly one kit cell.)
 */
function* allMatchupsInCell(cell: readonly KitCell[]): Generator<Matchup> {
  for (const kc of cell) {
    for (const m of kc.matchups) yield m;
  }
}

/**
 * Per-mon role classification. A mon may fill multiple roles (e.g. a
 * mixed attacker also bringing Tailwind). The role-gap term cares only
 * about *coverage* of the bring as a set, so we union the per-mon roles.
 */
function rolesFor(mon: Pokemon, attackerCells: readonly (readonly KitCell[])[]): ReadonlySet<Role> {
  const roles = new Set<Role>();
  if (hasSpeedControlMove(mon)) roles.add('speedControl');
  // Look at every move on this attacker against any defender. If any
  // physical move shows up in the matchup grid, the mon is a physical
  // attacker by virtue of carrying one. Same for special.
  for (const cell of attackerCells) {
    for (const m of allMatchupsInCell(cell)) {
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
 * P(this matchup OHKOs the defender). When the `Matchup` carries an
 * `outcome` payload (matrix attached one — either via injected
 * `outcomeProbability` or the deterministic fallback), use that. Else
 * fall back to the M3 binary indicator `koChance: 1 && OHKO`.
 *
 * The deterministic fallback exists so synthetic-matrix tests in
 * `score.test.ts` (which build `Matchup` objects without the new shape)
 * keep passing.
 */
function pOhkoOf(m: Matchup): number {
  if (m.outcome !== undefined) return m.outcome.pOhko;
  return m.damage.koChance === 1 && m.damage.notation.includes('OHKO') ? 1 : 0;
}

/**
 * Across one (a, d) cell, the probability that *some move* on this kit
 * yields an OHKO. `max` over moves is the right aggregator: we only need
 * one move to land. The kit cell's `weight` is applied by the caller.
 */
function maxPOhkoInKitCell(kc: KitCell): number {
  let best = 0;
  for (const m of kc.matchups) {
    const p = pOhkoOf(m);
    if (p > best) best = p;
  }
  return best;
}

/**
 * Across one (a, d) cell, the probability that *no move* OHKOs. Mirror
 * of `maxPOhkoInKitCell` for the "survives" question.
 */
function pSurvivesAllInKitCell(kc: KitCell): number {
  // P(survive) = 1 - max P(OHKO via any move). Same independence assumption
  // as the offense direction: we treat the move axis as "best move wins"
  // rather than as joint probabilities across moves.
  return 1 - maxPOhkoInKitCell(kc);
}

/**
 * Expected number of opp slots the bring contains a guaranteed-OHKO answer
 * for. Per opp slot d:
 *
 *   E[answer to slot d] = Σ kit_cell.weight × indicator(some pick OHKOs this kit)
 *
 * "indicator(some pick OHKOs this kit)" is `max over picks of pOhko`. With
 * concrete-kit input (single weight-1 KitCell, binary pOhko ∈ {0,1}),
 * this reduces to the M3 integer count — every assertion in the M3
 * scenario tests still passes.
 */
function pickedKoOpp(combo: TeamSet, mySide: MatrixSide): number {
  let total = 0;
  for (let d = 0; d < mySide.defenders.length; d++) {
    // For each (pick, opp_kit) pair we get a P(pick OHKOs this kit). Across
    // picks, we want max (any pick suffices). Across kits, weighted sum.
    // Compute "for this opp slot d, what's the expected indicator that the
    // bring answers it".
    // We have to fold the "pick over multiple picks" inside the kit-cell
    // axis, since different picks may dominate under different kits.
    // Concretely: per-kit max over picks; then weighted sum across kits.
    // But the my-side cell's KitCell axis varies by *opp defender kit*, so
    // we align by kit-cell index across picks (which all share the same
    // opp defender at slot d).
    const numKits = mySide.cells[0]?.[d]?.length ?? 0;
    if (numKits === 0) continue;
    // Per kit index k, find the max pOhko over picks. The cell is
    // mySide.cells[a][d][k] for each pick attacker index a.
    let weightedSum = 0;
    let weightSum = 0;
    for (let k = 0; k < numKits; k++) {
      let bestP = 0;
      let kitWeight = 0;
      for (const mon of combo) {
        const a = mySide.attackers.indexOf(mon);
        if (a < 0) continue;
        const kc = mySide.cells[a]?.[d]?.[k];
        if (!kc) continue;
        // Kit weight is determined by opp-kit identity, so any pick's view
        // of kit k yields the same weight; capture it once.
        if (kitWeight === 0) kitWeight = kc.weight;
        const p = maxPOhkoInKitCell(kc);
        if (p > bestP) bestP = p;
      }
      weightedSum += kitWeight * bestP;
      weightSum += kitWeight;
    }
    // Guard against the (theoretical) case where weightSum drifts slightly
    // off 1.0 due to floating-point — normalise to keep the per-slot
    // expected count in [0, 1]. When all kit weights sum to exactly 1.0
    // (the design-doc invariant), this is a no-op.
    if (weightSum > 0 && Math.abs(weightSum - 1) < 1e-6) {
      total += weightedSum;
    } else if (weightSum > 0) {
      total += weightedSum / weightSum;
    }
  }
  return total;
}

/**
 * Expected number of picked mons that *some* opp mon (under any plausible
 * attacker kit) guarantees an OHKO on. For each picked mon d, weighted-sum
 * across opp attacker kits of (max over opp slots of P(this opp OHKOs the
 * pick under this kit)).
 */
function oppKoPicked(combo: TeamSet, oppSide: MatrixSide): number {
  let total = 0;
  for (const mon of combo) {
    const dIdx = oppSide.defenders.indexOf(mon);
    if (dIdx < 0) continue;
    // For each opp attacker slot a, we have a KitCell[] indexing opp
    // attacker kit k. The probability slot `a` OHKOs the pick under kit
    // k is `maxPOhkoInKitCell(oppSide.cells[a][dIdx][k])`. Across kits at
    // slot a, weighted sum gives P(slot a OHKOs the pick). We want the
    // probability that *any* opp slot OHKOs the pick — but slots are not
    // mutually exclusive (multiple slots can independently OHKO). Use
    // `max across slots` as the conservative-and-bounded estimator: the
    // pick is "answered KO'd" if *some* slot OHKOs it. Sums and marginal
    // independence aren't justified at this layer; max keeps the metric
    // in [0, 1] per pick.
    let bestSlotP = 0;
    for (let a = 0; a < oppSide.attackers.length; a++) {
      const cell = oppSide.cells[a]?.[dIdx];
      if (!cell || cell.length === 0) continue;
      let slotP = 0;
      let weightSum = 0;
      for (const kc of cell) {
        slotP += kc.weight * maxPOhkoInKitCell(kc);
        weightSum += kc.weight;
      }
      const normSlotP = weightSum > 0 ? slotP / Math.max(weightSum, 1) : 0;
      if (normSlotP > bestSlotP) bestSlotP = normSlotP;
    }
    total += bestSlotP;
  }
  return total;
}

/**
 * Expected number of opp slots that *some* pick walls (= survives every
 * move the opp's most plausible kit threatens). Mirror of `pickedKoOpp`,
 * just on the survival axis.
 */
function pickedSurvivesOpp(combo: TeamSet, oppSide: MatrixSide): number {
  let total = 0;
  for (let a = 0; a < oppSide.attackers.length; a++) {
    // For each opp attacker slot a, compute P(some pick walls slot a),
    // weighted across opp kit candidates at slot a.
    const numKits = oppSide.cells[a]?.[0]?.length ?? 0;
    if (numKits === 0) continue;
    let weightedSum = 0;
    let weightSum = 0;
    for (let k = 0; k < numKits; k++) {
      let bestSurv = 0;
      let kitWeight = 0;
      for (const mon of combo) {
        const dIdx = oppSide.defenders.indexOf(mon);
        if (dIdx < 0) continue;
        const kc = oppSide.cells[a]?.[dIdx]?.[k];
        if (!kc) continue;
        if (kitWeight === 0) kitWeight = kc.weight;
        const p = pSurvivesAllInKitCell(kc);
        if (p > bestSurv) bestSurv = p;
      }
      weightedSum += kitWeight * bestSurv;
      weightSum += kitWeight;
    }
    if (weightSum > 0 && Math.abs(weightSum - 1) < 1e-6) {
      total += weightedSum;
    } else if (weightSum > 0) {
      total += weightedSum / weightSum;
    }
  }
  return total;
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
