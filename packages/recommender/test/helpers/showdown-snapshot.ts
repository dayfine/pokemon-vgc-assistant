/**
 * Showdown-Champions data accessors backed by the vendored snapshot at
 * `data/showdown-snapshot/`. Test-only — used by the M6.5.3 facts data
 * gate to verify every machine-checkable claim in `facts.ts` against
 * authoritative Showdown data.
 *
 * Merge semantics:
 *
 * - **Learnsets**: the Champions mod fully replaces a species' learnset
 *   when present; otherwise base gen-9 applies. (Verified empirically:
 *   `champions/learnsets.ts` carries no `inherit: true` flags as of the
 *   pinned SHA — every species in the mod overlay defines its full
 *   move pool.)
 * - **Items**: mod entries with `inherit: true` defer to base for any
 *   field not explicitly overridden. Items present only in the mod
 *   (Champions-exclusive Mega Stones) live in `champions/items.ts`.
 * - **Pokedex**: no mod overlay — Champions inherits the base pokedex
 *   unmodified.
 *
 * Gen-9 legality: a move is "learnable in gen 9" if at least one source
 * code in the move's array starts with `'9'` (e.g. `'9L21'`, `'9M'`,
 * `'9T'`, `'9E'`). The presence of the key alone is insufficient —
 * older-gen-only moves still appear in the data.
 */

import { Items as BaseItemsRaw } from '../../../../data/showdown-snapshot/base/items';
import { Learnsets as BaseLearnsetsRaw } from '../../../../data/showdown-snapshot/base/learnsets';
import { Pokedex as BasePokedexRaw } from '../../../../data/showdown-snapshot/base/pokedex';
import { Items as ModItemsRaw } from '../../../../data/showdown-snapshot/champions/items';
import { Learnsets as ModLearnsetsRaw } from '../../../../data/showdown-snapshot/champions/learnsets';

interface LearnsetEntry {
  readonly learnset?: { readonly [moveId: string]: readonly string[] | undefined };
}
interface DexEntry {
  readonly num: number;
  readonly name: string;
  readonly types: readonly string[];
  readonly abilities: {
    readonly 0: string;
    readonly 1?: string;
    readonly H?: string;
    readonly S?: string;
  };
}
interface ItemEntry {
  readonly name?: string;
  /**
   * Showdown stores Mega Stone triggers as `{ baseSpecies: megaSpecies }`,
   * e.g. `{ Salamence: 'Salamence-Mega' }`. Multi-form Megas (Charizardite X
   * vs Y) keep separate items; the object shape is preserved for forward
   * compatibility with stones that target multiple base forms.
   */
  readonly megaStone?: { readonly [baseSpecies: string]: string };
  readonly isNonstandard?: string;
  readonly inherit?: boolean;
}

type LearnsetTable = { readonly [speciesId: string]: LearnsetEntry | undefined };
type DexTable = { readonly [speciesId: string]: DexEntry | undefined };
type ItemTable = { readonly [itemId: string]: ItemEntry | undefined };

const baseLearnsets = BaseLearnsetsRaw as LearnsetTable;
const modLearnsets = ModLearnsetsRaw as LearnsetTable;
const basePokedex = BasePokedexRaw as DexTable;
const baseItems = BaseItemsRaw as ItemTable;
const modItems = ModItemsRaw as ItemTable;

/**
 * Showdown-canonical ID — lowercase alphanumeric. Matches Showdown's
 * own `toID` from `sim/utils.ts`. `'Indeedee-F'` → `'indeedeef'`,
 * `'Kommo-o'` → `'kommoo'`, `'Mr. Mime'` → `'mrmime'`.
 */
export function toID(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Returns true if the species learns the move under gen-9 rules
 * (Champions inherits gen-9 base mechanics). Mod overlay takes
 * precedence over base; at least one source must start with `'9'`.
 */
export function speciesLearnsMoveGen9(speciesName: string, moveName: string): boolean {
  const speciesId = toID(speciesName);
  const moveId = toID(moveName);
  const learnset = modLearnsets[speciesId]?.learnset ?? baseLearnsets[speciesId]?.learnset;
  if (!learnset) return false;
  const sources = learnset[moveId];
  if (!sources) return false;
  return sources.some((src) => src.startsWith('9'));
}

/**
 * Returns true if the species' pokedex entry lists the ability in any
 * slot (0 / 1 / H / S). Comparison is canonicalized via `toID` so the
 * caller can pass display names (`'Good as Gold'`).
 */
export function speciesHasAbility(speciesName: string, abilityName: string): boolean {
  const entry = basePokedex[toID(speciesName)];
  if (!entry) return false;
  const target = toID(abilityName);
  const slots = [entry.abilities[0], entry.abilities[1], entry.abilities.H, entry.abilities.S];
  return slots.some((a) => a !== undefined && toID(a) === target);
}

/**
 * Returns true if the item is recognized in either the mod overlay or
 * the base item table. Mod-only entries (Champions Mega Stones) and
 * base entries both count.
 */
export function itemExists(itemName: string): boolean {
  const id = toID(itemName);
  return modItems[id] !== undefined || baseItems[id] !== undefined;
}

/**
 * Returns the base-form species names a Mega Stone triggers, or an empty
 * array if the item isn't a Mega Stone. Most stones target a single base
 * (`['Salamence']` for Salamencite); the array shape supports stones
 * that map to multiple bases. Mod entry takes precedence over base.
 */
export function megaStoneTriggers(itemName: string): readonly string[] {
  const id = toID(itemName);
  const trigger = modItems[id]?.megaStone ?? baseItems[id]?.megaStone;
  return trigger ? Object.keys(trigger) : [];
}

/**
 * Returns the species' pokedex entry, or undefined for unknown names.
 * Use this when a check needs more than one accessor's worth of data.
 */
export function speciesEntry(speciesName: string): DexEntry | undefined {
  return basePokedex[toID(speciesName)];
}
