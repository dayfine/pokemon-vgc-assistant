/**
 * Hand-curated representative spreads per item-role bucket, plus a static
 * legal-abilities table for the species we currently emit kit candidates
 * for. Both tables are intentionally narrow scope: M4-simple ships ~5
 * fixture species, and we extend incrementally.
 *
 * Why a static legal-abilities table? `@smogon/calc`'s species record only
 * exposes `abilities[0]` (the primary), not the full list of legal
 * abilities, and `@pkmn/dex` does not yet ship the `gen9champions` mod.
 * `engine/src/data.ts` has the same problem and falls back to vanilla
 * Gen 9 data; this module mirrors that pattern with an explicit per-species
 * allow-list to enforce the qc-behavioral "every kit field is legal in the
 * active format" rule. Replace with a `@pkmn/dex` gen9champions lookup
 * when the mod ships.
 *
 * The bucket-→-spread table follows the design doc:
 *   - bulky-physical:    252 HP / 252 Def / 4 SpD,  neutral
 *   - bulky-special:     252 HP /   4 Def / 252 SpD, neutral
 *   - offensive-physical:  4 HP / 252 Atk / 252 Spe, +Atk
 *   - offensive-special:   4 HP / 252 SpA / 252 Spe, +SpA
 *   - speed-control:     252 HP /   4 Def / 252 Spe, +Spe
 *
 * Champions uses Stat Points (SP), not EVs — the `evs` field here is the
 * EV-equivalent stopgap per `dev/plans/03-priors-design.md` §"Open
 * question 1". M3.5 / M4.5 will swap in proper SP math.
 */

import type { RepresentativeSpread, StatBucket } from './types.js';

/** Bucket → representative spread + nature. Keyed via the StatBucket union
 *  so adding a bucket without a spread is a TypeScript error. */
export const REPRESENTATIVE_SPREADS: Readonly<Record<StatBucket, RepresentativeSpread>> = {
  'bulky-physical': {
    bucket: 'bulky-physical',
    nature: 'Impish',
    evs: { hp: 252, def: 252, spd: 4 },
  },
  'bulky-special': {
    bucket: 'bulky-special',
    nature: 'Careful',
    evs: { hp: 252, def: 4, spd: 252 },
  },
  'offensive-physical': {
    bucket: 'offensive-physical',
    nature: 'Adamant',
    evs: { hp: 4, atk: 252, spe: 252 },
  },
  'offensive-special': {
    bucket: 'offensive-special',
    nature: 'Modest',
    evs: { hp: 4, spa: 252, spe: 252 },
  },
  'speed-control': {
    bucket: 'speed-control',
    nature: 'Timid',
    evs: { hp: 252, def: 4, spe: 252 },
  },
};

/**
 * Heuristic: which bucket does an item imply, given the species' offensive
 * lean? "Offensive lean" is determined by base-stat sign (Atk > SpA → physical)
 * and is computed in `expand.ts` from `@smogon/calc`'s species data.
 *
 * Each entry maps an exact item name (matched verbatim against Pikalytics'
 * `Common Items` rows) to either a fixed bucket or a "use the species lean"
 * sentinel. The list is small and intentionally explicit — adding a new
 * item that should bucket-influence kit construction is a deliberate edit.
 */
export type BucketHint = StatBucket | 'lean-offensive' | 'lean-bulky';

export const ITEM_BUCKET_HINTS: Readonly<Record<string, BucketHint>> = {
  // Pure-offensive items — bucket is always offensive on the species lean.
  'Choice Band': 'offensive-physical',
  'Choice Specs': 'offensive-special',
  'Choice Scarf': 'lean-offensive',
  'Life Orb': 'lean-offensive',
  'Expert Belt': 'lean-offensive',
  'Focus Sash': 'lean-offensive',
  'Power Herb': 'lean-offensive',
  'Throat Spray': 'offensive-special',
  // Bulky / pivot items.
  'Assault Vest': 'bulky-special',
  'Sitrus Berry': 'lean-bulky',
  'Rocky Helmet': 'bulky-physical',
  Leftovers: 'lean-bulky',
  'Clear Amulet': 'lean-bulky',
  // Berry-resists default to bulky on the resisted axis; coarsely bulky-physical.
  'Shuca Berry': 'bulky-physical',
  'Chople Berry': 'bulky-physical',
  'Figy Berry': 'lean-bulky',
  'Aguav Berry': 'lean-bulky',
  // Setup-enabling / situational items default to offensive.
  'White Herb': 'lean-offensive',
  'Mirror Herb': 'lean-offensive',
  'Weakness Policy': 'lean-offensive',
  'Psychic Seed': 'lean-bulky',
  'Covert Cloak': 'lean-bulky',
  'Mental Herb': 'lean-bulky',
};

/**
 * Static legal-abilities table per species, scoped to the M4-simple fixture
 * coverage (see test/fixtures/pikalytics/). Each entry is the canonical
 * abilities a competitive set may run in `gen9championsvgc2026regma`,
 * cross-referenced against the Showdown data files and the Pikalytics
 * Featured Teams sections of the same fixtures.
 *
 * Pikalytics' raw "Common Abilities" data leaks abilities the species
 * cannot legally have (e.g. Whimsicott showing "Trace 0.343%"). Filtering
 * the parser output through this allow-list is what keeps the qc-behavioral
 * "every KitCandidate field is legal" rule satisfied.
 *
 * Extending coverage to a new species is one entry's worth of work — add
 * the species and its legal abilities; adding without verifying against
 * Showdown data is a behavioral finding.
 */
export const LEGAL_ABILITIES: Readonly<Record<string, readonly string[]>> = {
  Incineroar: ['Blaze', 'Intimidate'],
  Whimsicott: ['Prankster', 'Infiltrator', 'Chlorophyll'],
  Sneasler: ['Pressure', 'Unburden', 'Poison Touch'],
  Archaludon: ['Stamina', 'Sturdy'],
  Garchomp: ['Rough Skin', 'Sand Veil'],
};
