import type { Field, Move, Pokemon } from '@smogon/calc';

export type { Pokemon, Move, Field };

export type Item = string;

export type TeamSet = readonly Pokemon[];

/** Which side of the field a Pokémon is on, from the user's perspective. */
export type Side = 'my' | 'opp';

/** Pokémon stat-stage value. Stages outside [-6, +6] do not exist in-game. */
export type StatStage = -6 | -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DamageRange {
  min: number;
  max: number;
  koChance: number | undefined;
  notation: string;
}

/**
 * Real-valued probability that a (move, attacker_kit, defender_kit, field)
 * tuple lands the named outcome. `pOhko ∈ [0, 1]`, `pTwoHko ∈ [0, 1]`,
 * `pTwoHko ≥ pOhko` by construction (a 1HKO is also a 2HKO).
 *
 * Engine owns this *data shape* — not a runtime import — so the matrix
 * layer stays consumable both with and without `@pva/priors`. The priors
 * package's `OutcomeProbability` is structurally identical (verified in
 * `packages/priors/src/types.ts`); callers that already have a priors
 * value pass it straight in.
 *
 * For concrete-kit inputs (the M3 backwards-compat path), the matrix
 * derives `OutcomeProbability` deterministically from the calc result —
 * `pOhko = 1` when the matchup is `koChance: 1 && notation includes
 * "OHKO"`, else `0`. That preserves M3's binary behaviour as a special
 * case of the real-valued model.
 */
export interface OutcomeProbability {
  readonly pOhko: number;
  readonly pTwoHko: number;
}

export interface Matchup {
  readonly attacker: Pokemon;
  readonly defender: Pokemon;
  readonly move: Move;
  readonly damage: DamageRange;
  /**
   * Outcome probability under the (attacker_kit, defender_kit, move, field)
   * tuple this matchup belongs to. Optional for backwards-compatibility
   * with synthetic-matrix tests that hand-build matchups without the
   * probability layer; when absent, scoring derives a binary indicator
   * from `damage.koChance` / `damage.notation` (the M3 path).
   */
  readonly outcome?: OutcomeProbability;
}

/**
 * Lightweight identifier for a kit candidate carried inside a `KitCell`.
 * Engine doesn't need the full `KitCandidate` shape from `@pva/priors`
 * (item / ability / moves / nature / EVs / bucket / weight) — the matrix
 * payload only uses identity for breakdown text and dedup. The descriptor
 * fields are the load-bearing subset; the package boundary stays clean.
 */
export interface KitDescriptor {
  readonly species: string;
  readonly item: string;
  readonly ability: string;
  readonly moves: readonly string[];
}

/**
 * One opp-kit branch of a (attacker, defender) matrix cell. `weight`
 * sums to 1.0 (within ±1e-9) across the `KitCell[]` for that cell. The
 * `matchups` array holds the per-move calc results computed under the
 * concrete kit chosen for this candidate.
 *
 * On the `opp` side, the kit dimension is the *opp attacker* kit (which
 * moves does opp throw, with which item / ability / spread).
 *
 * On the `my` side, the kit dimension is the *opp defender* kit (which
 * spread / ability does the opp present when my attacker hits them). My
 * mons themselves are concrete (`my` team is fully typed input), so the
 * uncertainty axis is symmetric: it's always the *opp* who is unknown
 * under closed-sheet input.
 *
 * `effectiveSpeed` is the opp-side kit's speed under the matrix's active
 * `sideMods` (Trick Room / Tailwind / Choice Scarf via the kit's `item`).
 * It carries per-kit speed deltas (Choice Scarf branches, ability-driven
 * multipliers when those land) into the score layer, so
 * `score.pickedOutspeedOpp` can weight by kit cell instead of collapsing
 * to one effective speed per opp slot. The math reuses the same
 * `effectiveSpeed` helper `speed.ts` uses for the global ranking.
 */
export interface KitCell {
  readonly weight: number;
  readonly kit: KitDescriptor;
  readonly matchups: readonly Matchup[];
  readonly effectiveSpeed: number;
}
