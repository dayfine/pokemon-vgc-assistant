/**
 * `expand`: species → `KitCandidate[]`.
 *
 * Implements the M4-simple algorithm from `dev/plans/03-priors-design.md`:
 *
 *   1. Parse Pikalytics response (passed in by the caller, sourced via
 *      `sources/pikalytics.ts` + `cache.ts`).
 *   2. Pull the top-K legal items above the probability floor (default
 *      K=3, floor=5%). "Legal" means the item exists in the active
 *      generation's items index — illegal items are silently dropped
 *      rather than raising, so a noisy upstream feed doesn't fail the
 *      caller.
 *   3. For each surviving item, pick the species' most-popular
 *      *legal* ability and the top-4 *legal* moves.
 *   4. Bucket the (item, species lean) pair into a representative spread.
 *   5. Normalise weights across the surviving candidates so they sum to
 *      1.0. Probability mass below the floor is *truncated*, not
 *      redistributed proportionally.
 *
 * Open-sheet path: when `sheetMode === 'open'` and a known kit is supplied,
 * the function bypasses Pikalytics entirely and emits a single-element
 * `KitCandidate[]` with weight 1.0. Same code path, narrower distribution
 * — per qc-behavioral §"Closed-sheet vs open-sheet".
 *
 * Tera is left `undefined` for M-A (no-Tera). The KitCandidate shape keeps
 * `tera` optional for forward compatibility with future formats.
 */

import type { Generation } from '@smogon/calc/dist/data/interface.js';
import type { SheetMode } from './sources/pikalytics.js';
import { ITEM_BUCKET_HINTS, LEGAL_ABILITIES, REPRESENTATIVE_SPREADS } from './spreads.js';
import type { BucketHint } from './spreads.js';
import type { KitCandidate, PikalyticsSpeciesData, StatBucket } from './types.js';

export interface ExpandOptions {
  /** Top-K item buckets to keep. Default 3 per design doc. */
  readonly topItems?: number;
  /**
   * Probability floor in [0, 100] (Pikalytics' raw scale). Items below
   * this percent are truncated. Default 5%.
   */
  readonly probabilityFloor?: number;
}

export interface ExpandClosed {
  readonly sheetMode: 'closed';
  readonly data: PikalyticsSpeciesData;
}

/**
 * Open-sheet input: caller already knows the full kit (vision M5 will
 * extract this from a tournament team-preview screenshot). The kit
 * collapses to a single-element `KitCandidate[]` with weight 1.0.
 */
export interface ExpandOpen {
  readonly sheetMode: 'open';
  readonly species: string;
  readonly knownKit: KnownKit;
}

export interface KnownKit {
  readonly item: string;
  readonly ability: string;
  readonly moves: readonly string[];
  readonly tera?: string;
}

const DEFAULT_TOP_ITEMS = 3;
const DEFAULT_FLOOR = 5;
const MOVES_PER_KIT = 4;

/** Toupper-stripped Pokémon-Showdown style id for ability/item/move names. */
function toID(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Item exists in the active gen's index. Champions adds Mega Stones for the
 *  Champions-exclusive Megas; we fall back to vanilla Gen 9 here mirroring
 *  `engine/src/data.ts`'s placeholder. Legality fidelity improves when
 *  `@pkmn/dex` ships the gen9champions mod. */
function isLegalItem(gen: Generation, name: string): boolean {
  return gen.items.get(toID(name) as never) !== undefined;
}

/** Move exists in the active gen's index. Same caveat as `isLegalItem`. */
function isLegalMove(gen: Generation, name: string): boolean {
  return gen.moves.get(toID(name) as never) !== undefined;
}

/**
 * Resolve a hint to a concrete bucket given the species' offensive lean.
 * Lean rule: physical if base Atk > base SpA, else special. Speed-control
 * leans special by default — the table doesn't currently expose any
 * "lean-speed-control" entries, so the fallthrough is hypothetical.
 */
function resolveBucket(hint: BucketHint, lean: 'physical' | 'special'): StatBucket {
  if (hint === 'lean-offensive') {
    return lean === 'physical' ? 'offensive-physical' : 'offensive-special';
  }
  if (hint === 'lean-bulky') {
    return lean === 'physical' ? 'bulky-physical' : 'bulky-special';
  }
  return hint;
}

/** Get `(physical, special)` lean from `@smogon/calc` species base stats. */
function speciesLean(gen: Generation, species: string): 'physical' | 'special' {
  const sp = gen.species.get(toID(species) as never);
  if (!sp) return 'physical';
  return sp.baseStats.atk >= sp.baseStats.spa ? 'physical' : 'special';
}

/**
 * Pick the highest-percent ability from the parsed list that the species
 * is actually allowed to run. Falls back to the species' primary ability
 * when nothing in the parsed list passes the legality filter — Pikalytics'
 * "Common Abilities" data is heavily contaminated for some species (e.g.
 * Whimsicott), so a fallback keeps `expand` from emitting an `ability: ''`
 * candidate.
 */
function pickLegalAbility(gen: Generation, species: string, parsed: PikalyticsSpeciesData): string {
  const legal = LEGAL_ABILITIES[species];
  if (legal !== undefined) {
    for (const a of parsed.abilities) {
      if (legal.includes(a.name)) return a.name;
    }
    // Fallback: first allow-listed ability for the species.
    if (legal[0] !== undefined) return legal[0];
  }
  // No allow-list entry → use Pikalytics' top legal-in-gen ability if any,
  // else the species' calc-data primary.
  for (const a of parsed.abilities) {
    if (gen.abilities.get(toID(a.name) as never) !== undefined) return a.name;
  }
  const sp = gen.species.get(toID(species) as never);
  return sp?.abilities?.[0] ?? '';
}

/**
 * Build a 4-move set. Moves are taken in Pikalytics-popularity order,
 * keeping the first 4 that pass the gen-legality filter. Pikalytics
 * publishes 10 candidates which is plenty of headroom; we don't model
 * move correlation in M4-simple (per design doc non-goals).
 */
function pickMoves(gen: Generation, parsed: PikalyticsSpeciesData): readonly string[] {
  const out: string[] = [];
  for (const m of parsed.moves) {
    if (out.length >= MOVES_PER_KIT) break;
    if (!isLegalMove(gen, m.name)) continue;
    if (out.includes(m.name)) continue;
    out.push(m.name);
  }
  return out;
}

/**
 * Closed-sheet expansion: turn a parsed Pikalytics response into a list
 * of weighted kit candidates.
 *
 * Edge cases:
 *  - Zero items survive the floor → return [] (caller should fall back).
 *  - All items collapse to the same bucket → still emit one candidate per
 *    item, since downstream may want to weight by item identity (Choice
 *    Specs vs. Life Orb is the same bucket but different damage).
 */
function expandClosed(
  gen: Generation,
  data: PikalyticsSpeciesData,
  options: ExpandOptions,
): KitCandidate[] {
  const topItems = options.topItems ?? DEFAULT_TOP_ITEMS;
  const floor = options.probabilityFloor ?? DEFAULT_FLOOR;

  const eligible = data.items
    .filter((i) => i.percent >= floor && isLegalItem(gen, i.name))
    .slice(0, topItems);
  if (eligible.length === 0) return [];

  const lean = speciesLean(gen, data.species);
  const ability = pickLegalAbility(gen, data.species, data);
  const moves = pickMoves(gen, data);

  // Normalise weights across the *retained* candidates only — explicit
  // truncation, no redistribution of the long tail. Sum first, then divide.
  let totalPercent = 0;
  for (const i of eligible) totalPercent += i.percent;
  const candidates: KitCandidate[] = [];
  for (const item of eligible) {
    const hint = ITEM_BUCKET_HINTS[item.name];
    const bucket = resolveBucket(hint ?? 'lean-offensive', lean);
    const spread = REPRESENTATIVE_SPREADS[bucket];
    const weight = item.percent / totalPercent;
    candidates.push({
      species: data.species,
      item: item.name,
      ability,
      moves,
      nature: spread.nature,
      evs: spread.evs,
      weight,
      bucket,
    });
  }
  // Floating-point summation rarely lands at exactly 1.0; pin the last
  // candidate to absorb the rounding error. ±1e-9 invariant requires this.
  if (candidates.length > 0) {
    let sum = 0;
    for (let i = 0; i < candidates.length - 1; i++) sum += candidates[i]?.weight ?? 0;
    const last = candidates[candidates.length - 1];
    if (last !== undefined) {
      const repaired: KitCandidate = { ...last, weight: 1 - sum };
      candidates[candidates.length - 1] = repaired;
    }
  }
  return candidates;
}

/**
 * Open-sheet expansion: collapse to a single known kit. Same return type
 * as the closed-sheet path, single-element. `sheetMode: 'open'` is
 * shared-code-path per qc-behavioral §"Closed-sheet vs open-sheet".
 */
function expandOpen(input: ExpandOpen): KitCandidate[] {
  // Open-sheet kits land with a fixed bucket (offensive-physical) and the
  // open-sheet caller-supplied EV/nature would normally come from vision;
  // M4 v1 doesn't expose those, so we attach the offensive-physical
  // representative spread as a placeholder. The bucket-/spread-driven
  // pipeline shouldn't gate open-sheet's calc behaviour because the calc
  // wrapper accepts custom spreads when the caller has them.
  const bucket: StatBucket = 'offensive-physical';
  const spread = REPRESENTATIVE_SPREADS[bucket];
  return [
    {
      species: input.species,
      item: input.knownKit.item,
      ability: input.knownKit.ability,
      moves: input.knownKit.moves,
      nature: spread.nature,
      evs: spread.evs,
      ...(input.knownKit.tera !== undefined ? { tera: input.knownKit.tera } : {}),
      weight: 1.0,
      bucket,
    },
  ];
}

/**
 * Public entry point. The closed/open sheetMode discrimination is on the
 * input type; both paths share the return type and downstream consumers
 * don't fork on `sheetMode`.
 */
export function expand(
  gen: Generation,
  input: ExpandClosed | ExpandOpen,
  options: ExpandOptions = {},
): KitCandidate[] {
  if (input.sheetMode === 'open') return expandOpen(input);
  return expandClosed(gen, input.data, options);
}

/** Convenience: re-export the sheetMode union for callers that build inputs. */
export type { SheetMode };
