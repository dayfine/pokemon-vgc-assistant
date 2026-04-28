/**
 * Hand-curated plausible-stat distributions per species, used by the M4.5
 * outcome integrator. Per `dev/plans/03-priors-design.md` §M4.5 each
 * species maps to a list of `(weight, bucket)` pairs whose weights sum to
 * exactly 1.0; the `bucket` resolves to a concrete stat line via the
 * `REPRESENTATIVE_SPREADS` table from `spreads.ts`.
 *
 * The distribution is deliberately *coarser* than the kit-level item
 * distribution emitted by `expand`. The intuition is that an opp species'
 * stat profile has only three or four meaningful modes (bulky vs.
 * offensive, physical vs. special) regardless of which item it's running.
 * Choice Specs Incineroar and Choice Band Incineroar both index the
 * "offensive-physical" stat profile from this table — the *kit* differs,
 * the *stat profile* does not.
 *
 * Coverage scope (M4.5 acceptance: ≥10 species):
 *   - 5 M4-simple fixture species (Incineroar, Whimsicott, Sneasler,
 *     Archaludon, Garchomp) — required so the threshold-probability layer
 *     overlaps the kit-expansion test set.
 *   - 5 additional top-usage M-A legal species (Rillaboom, Amoonguss,
 *     Dragonite, Tyranitar, Annihilape) — all are non-Restricted, non-Paradox,
 *     non-Legendary, non-Treasure-of-Ruin per
 *     `dev/research/champions-2026-04-26.md`. Tornadus was originally
 *     included but removed: Forces of Nature are Legendary and M-A bans
 *     all Legendaries.
 *
 * Adding a species: drop a new entry below, run the
 * `stat-distributions.test.ts` `it.each(speciesList)` weight-sum guard,
 * and verify the species is M-A-legal.
 *
 * The weights are *prior beliefs*, not measured frequencies — Pikalytics'
 * AI endpoints don't expose spread/nature/Tera so we can't fit these from
 * data. M7 may infer them from item-popularity distributions; for now they
 * encode the maintainer's read of the format.
 */

import type { StatBucketWeight } from './types.js';

/**
 * Per-species `StatBucketWeight[]`. Weights sum to 1.0 within ±1e-9 (test).
 *
 * Buckets used:
 *   - `bulky-physical`     — 252 HP / 252 Def / 4 SpD, Impish.
 *   - `bulky-special`      — 252 HP / 4 Def / 252 SpD, Careful.
 *   - `offensive-physical` — 4 HP / 252 Atk / 252 Spe, Adamant.
 *   - `offensive-special`  — 4 HP / 252 SpA / 252 Spe, Modest.
 *   - `speed-control`      — 252 HP / 4 Def / 252 Spe, Timid.
 */
export const STAT_DISTRIBUTIONS: Readonly<Record<string, readonly StatBucketWeight[]>> = {
  // M4-simple fixture species
  Incineroar: [
    // Heavily skewed bulky-physical: AV / Sitrus / Rocky Helmet are the
    // standard items, Adamant offensive sets are a minority.
    { weight: 0.7, bucket: 'bulky-physical' },
    { weight: 0.2, bucket: 'offensive-physical' },
    { weight: 0.1, bucket: 'bulky-special' },
  ],
  Whimsicott: [
    // Prankster utility set dominates: HP/Spe with Focus Sash; some Choice
    // Specs sets exist but are rare in M-A.
    { weight: 0.85, bucket: 'speed-control' },
    { weight: 0.15, bucket: 'offensive-special' },
  ],
  Sneasler: [
    // Unburden + Focus Sash / Grassy Seed all index offensive-physical.
    // A small bulky-physical tail covers Sash-stallers / non-Unburden sets.
    { weight: 0.85, bucket: 'offensive-physical' },
    { weight: 0.15, bucket: 'bulky-physical' },
  ],
  Archaludon: [
    // Mixed wall — Stamina sets lean bulky-special (Electro Shot + Body
    // Press), but a measurable share of bulky-physical / offensive-special
    // exists.
    { weight: 0.55, bucket: 'bulky-special' },
    { weight: 0.3, bucket: 'bulky-physical' },
    { weight: 0.15, bucket: 'offensive-special' },
  ],
  Garchomp: [
    // Life Orb / Choice Band offensive-physical is the canonical M-A set.
    // Yache / Loaded Dice fall under offensive-physical too.
    { weight: 0.8, bucket: 'offensive-physical' },
    { weight: 0.2, bucket: 'bulky-physical' },
  ],

  // Additional M-A top-usage species (non-Restricted, non-Paradox)
  Rillaboom: [
    // Choice Band Wood Hammer is iconic; AV / Sitrus pivot sets exist but
    // are minority in M-A.
    { weight: 0.7, bucket: 'offensive-physical' },
    { weight: 0.3, bucket: 'bulky-physical' },
  ],
  Amoonguss: [
    // Pure Spore-style support — Sitrus / Rocky Helmet / Covert Cloak.
    // Bulky-special edges out bulky-physical because Bold-/Calm-natured
    // Amoonguss is the M-A standard.
    { weight: 0.6, bucket: 'bulky-special' },
    { weight: 0.4, bucket: 'bulky-physical' },
  ],
  Dragonite: [
    // Multiscale + Choice Band / Loaded Dice / Lum offensive sets dominate;
    // a small share of bulky-physical (Roost / Heal Bell) tail.
    { weight: 0.75, bucket: 'offensive-physical' },
    { weight: 0.15, bucket: 'bulky-physical' },
    { weight: 0.1, bucket: 'offensive-special' },
  ],
  Tyranitar: [
    // Sand Stream support → AV bulky-special and offensive-physical Choice
    // Band sets; some bulky-physical (Chople / Yache) tail.
    { weight: 0.45, bucket: 'offensive-physical' },
    { weight: 0.4, bucket: 'bulky-special' },
    { weight: 0.15, bucket: 'bulky-physical' },
  ],
  Annihilape: [
    // Defiant + AV pivot sets vs. Choice Scarf offensive sets. AV bias.
    { weight: 0.6, bucket: 'bulky-physical' },
    { weight: 0.4, bucket: 'offensive-physical' },
  ],
};

/**
 * The set of species `STAT_DISTRIBUTIONS` knows about. Useful for callers
 * that want to gate "do we have a distribution for this species?" without
 * pulling in Object.keys repeatedly.
 */
export const SPECIES_WITH_DISTRIBUTION: readonly string[] = Object.keys(STAT_DISTRIBUTIONS);
