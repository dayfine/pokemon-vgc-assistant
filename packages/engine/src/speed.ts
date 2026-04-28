import type { Pokemon, Side, StatStage } from './types.js';

/**
 * Side-level modifiers that apply to every Pokémon on that side.
 * Composed with per-Pokémon modifiers to produce an effective speed.
 */
export interface SideSpeedModifiers {
  /** Tailwind doubles speed for 4 turns. */
  readonly tailwind?: boolean;
  /**
   * Trick Room reverses the action order globally — the *slower* Pokémon
   * moves first. Modeled here as a side flag because Trick Room affects
   * everyone on the field; we toggle it on whichever side(s) you mark and
   * it flips the final ranking direction.
   */
  readonly trickRoom?: boolean;
}

/**
 * Per-Pokémon speed modifiers — boosts, status, and the speed-relevant
 * subset of items/abilities not already baked into `pokemon.stats.spe`.
 *
 * `pokemon.stats.spe` already incorporates IVs/EVs/nature, so we only add
 * modifiers the calc layer doesn't apply automatically when no calculate()
 * call is made.
 */
export interface MonSpeedModifiers {
  /** Speed stat-stage boost. */
  readonly boost?: StatStage;
  /** Paralysis halves speed in Gen 7+. */
  readonly paralyzed?: boolean;
  /**
   * Force-apply a Choice Scarf 1.5× multiplier even if the Pokémon's item
   * field is not literally "Choice Scarf" (e.g. when probing a hypothetical
   * scarfed set). If unset, the scarf bonus applies iff `pokemon.item ===
   * "Choice Scarf"`.
   */
  readonly choiceScarf?: boolean;
}

export interface SpeedEntry {
  readonly pokemon: Pokemon;
  readonly side: Side;
  /** Final speed value used for ordering, after every modifier. */
  readonly effective: number;
  /** Base computed speed (`pokemon.stats.spe`) before this layer's modifiers. */
  readonly base: number;
}

export interface SpeedInput {
  readonly pokemon: Pokemon;
  readonly side: Side;
  readonly mods?: MonSpeedModifiers;
}

export interface SpeedRanking {
  /** Entries ordered by who moves *first* under the active field state. */
  readonly entries: readonly SpeedEntry[];
  /** True iff Trick Room flipped the ordering. Surfaced for report clarity. */
  readonly trickRoom: boolean;
}

/**
 * Pokémon stat-stage multiplier. The standard formula:
 *   positive stage n → (2 + n) / 2
 *   negative stage n → 2 / (2 + |n|)
 * Both branches reduce to 1 at stage 0.
 */
function stageMultiplier(boost: StatStage): number {
  return boost >= 0 ? (2 + boost) / 2 : 2 / (2 - boost);
}

/**
 * Compute the effective speed of a single Pokémon under the given
 * per-mon and side-level modifiers. Exported so the matrix layer can
 * pre-compute `KitCell.effectiveSpeed` from each opp kit candidate's
 * `Pokemon` (item / ability / spread already baked in) using the same
 * arithmetic the global `speedTiers` ranking uses.
 *
 * `mods.choiceScarf` defaults to `pokemon.item === 'Choice Scarf'`, so
 * passing a kit's `Pokemon` straight in is enough to pick up scarf
 * branches — no extra plumbing needed at the call site.
 */
export function effectiveSpeed(
  pokemon: Pokemon,
  mods: MonSpeedModifiers,
  side: SideSpeedModifiers,
): number {
  let v = pokemon.stats.spe;
  v *= stageMultiplier(mods.boost ?? 0);
  if (side.tailwind) v *= 2;
  const scarf = mods.choiceScarf ?? pokemon.item === 'Choice Scarf';
  if (scarf) v *= 1.5;
  if (mods.paralyzed) v *= 0.5;
  return Math.floor(v);
}

/**
 * Rank Pokémon by who moves first under a field state.
 *
 * The function is intentionally side-aware: Tailwind / Trick Room are
 * side-scoped (you can have Tailwind up on only one side). Mons act in the
 * same priority bracket; in-bracket order is by effective speed (or its
 * inverse under Trick Room).
 *
 * Speed ties produce a stable sort: the input order wins, mirroring how
 * `Array.prototype.sort` behaves in modern V8. We do not model the random
 * speed-tie coin flip — surface ties to the report layer instead.
 */
export function speedTiers(
  inputs: readonly SpeedInput[],
  sideMods: { [K in Side]?: SideSpeedModifiers } = {},
): SpeedRanking {
  const my = sideMods.my ?? {};
  const opp = sideMods.opp ?? {};

  const entries: SpeedEntry[] = inputs.map((inp) => {
    const sideForEntry = inp.side === 'my' ? my : opp;
    const mods = inp.mods ?? {};
    return {
      pokemon: inp.pokemon,
      side: inp.side,
      base: inp.pokemon.stats.spe,
      effective: effectiveSpeed(inp.pokemon, mods, sideForEntry),
    };
  });

  // Trick Room flips the ranking when active on either side. (In real play
  // it is global; modeling per-side is a convenience for what-if reports.)
  const trickRoom = Boolean(my.trickRoom || opp.trickRoom);

  entries.sort((a, b) => (trickRoom ? a.effective - b.effective : b.effective - a.effective));

  return { entries, trickRoom };
}
