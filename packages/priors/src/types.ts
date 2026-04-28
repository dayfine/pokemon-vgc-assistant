/**
 * Public types for the `@pva/priors` package. These are the data shapes the
 * engine and downstream consumers see when they ask "what is opp species X
 * likely running?"
 *
 * The package mirrors `@pva/engine`'s convention of exporting only data-shape
 * interfaces from `types.ts`; functions live in their own modules.
 *
 * Per `dev/plans/03-priors-design.md` §M4, M4-simple emits a flat
 * `KitCandidate[]` per species, item-bucketed. Spread / nature / Tera are
 * absent from Pikalytics' AI endpoints, so each kit gets a hand-curated
 * representative spread keyed off its item bucket (see `spreads.ts`).
 */

/**
 * One row from a Pikalytics "Common Items / Abilities / Moves" section.
 * `percent` is in [0, 100] — Pikalytics serves the human-facing percent,
 * not a [0, 1] probability, so we preserve that scale through the parser
 * and convert to weights only inside `expand`.
 */
export interface ItemPrior {
  readonly name: string;
  readonly percent: number;
}

export interface AbilityPrior {
  readonly name: string;
  readonly percent: number;
}

export interface MovePrior {
  readonly name: string;
  readonly percent: number;
}

/**
 * Parsed shape of a single Pikalytics `/ai/pokedex/<format>/<species>`
 * Markdown response. Mirrors the section structure of the response —
 * Quick Info, Common Items, Common Abilities, Common Moves. Sections
 * the AI endpoints don't expose (spreads, nature, Tera, sample size)
 * are explicitly absent rather than nullable: future fields land as
 * additive optionals.
 */
export interface PikalyticsSpeciesData {
  readonly species: string;
  readonly format: string;
  readonly dataDate: string;
  readonly items: readonly ItemPrior[];
  readonly abilities: readonly AbilityPrior[];
  readonly moves: readonly MovePrior[];
}

/**
 * Coarse role bucket assigned to a (species, item) pair, used to look up the
 * representative spread in `spreads.ts`. The five buckets are the M4 design
 * doc's enumerated set; adding more without updating the spread table is a
 * type error.
 */
export type StatBucket =
  | 'bulky-physical'
  | 'bulky-special'
  | 'offensive-physical'
  | 'offensive-special'
  | 'speed-control';

/**
 * EV spread + nature for a representative role. The shape matches what
 * `@smogon/calc`'s `Pokemon` constructor expects (`evs` partial map,
 * `nature` as a string). Champions uses SP rather than EVs; per
 * `dev/plans/03-priors-design.md` §"Open question 1" we ship M4-simple
 * with EV-equivalent spreads and accept the precision loss for now.
 */
export interface RepresentativeSpread {
  readonly bucket: StatBucket;
  readonly nature: string;
  readonly evs: Readonly<Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>>;
}

/**
 * One concrete kit candidate for an opp species. The engine's `Pokemon`
 * constructor takes (species, { item, ability, moves, nature, evs }) — the
 * same fields plus a `weight` and the `bucket` that produced the spread.
 *
 * `weight` is a probability in [0, 1]. Per the M4 design, the sum of
 * weights across the `KitCandidate[]` returned by `expand` is exactly 1.0
 * within ±1e-9 — probability mass that fell below the inclusion threshold
 * is *truncated*, not redistributed. Tera is left `undefined` for M-A
 * (no-Tera).
 */
export interface KitCandidate {
  readonly species: string;
  readonly item: string;
  readonly ability: string;
  readonly moves: readonly string[];
  readonly nature: string;
  readonly evs: Readonly<Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>>;
  readonly tera?: string;
  readonly weight: number;
  readonly bucket: StatBucket;
}
