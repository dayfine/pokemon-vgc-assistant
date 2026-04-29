/**
 * Showdown-Champions data accessors backed by the vendored snapshot at
 * `packages/showdown-data/snapshot/`.
 *
 * Originally lived under `packages/recommender/test/helpers/` for the
 * M6.5.3 facts data gate. Lifted to a workspace package so vision's
 * tests (and any future consumers) can validate against the same
 * authoritative data without duplicating the loader logic.
 *
 * Merge semantics:
 *
 * - **Learnsets**: the Champions mod fully replaces a species' learnset
 *   when present; otherwise base gen-9 applies. (Verified empirically:
 *   `gen9champions/learnsets.ts` carries no `inherit: true` flags as of
 *   the pinned SHA — every species in the mod overlay defines its full
 *   move pool.)
 * - **Items**: mod entries with `inherit: true` defer to base for any
 *   field not explicitly overridden. Items present only in the mod
 *   (Champions-exclusive Mega Stones) live in `gen9champions/items.ts`.
 * - **Pokedex**: no mod overlay — Champions inherits the base pokedex
 *   unmodified.
 *
 * Gen-9 legality: a move is "learnable in gen 9" if at least one source
 * code in the move's array starts with `'9'` (e.g. `'9L21'`, `'9M'`,
 * `'9T'`, `'9E'`). The presence of the key alone is insufficient —
 * older-gen-only moves still appear in the data.
 */

import { Items as BaseItemsRaw } from '../snapshot/base/items.js';
import { Learnsets as BaseLearnsetsRaw } from '../snapshot/base/learnsets.js';
import { Pokedex as BasePokedexRaw } from '../snapshot/base/pokedex.js';
import { Items as ModItemsRaw } from '../snapshot/gen9champions/items.js';
import { Learnsets as ModLearnsetsRaw } from '../snapshot/gen9champions/learnsets.js';

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
  /**
   * Set on alt-form entries (e.g. `indeedeef.baseSpecies = 'Indeedee'`,
   * `salamencemega.baseSpecies = 'Salamence'`). Showdown's learnset
   * data is mostly stored on the base form; alt-forms inherit. We
   * fall back to the base form when a move isn't listed on the
   * alt-form's own learnset.
   */
  readonly baseSpecies?: string;
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
 *
 * Alt-form inheritance: Showdown stores most moves on the base
 * species (e.g. `indeedee` carries Expanding Force; `indeedeef`'s
 * own learnset is sparse). When the alt-form's learnset doesn't
 * list the move, we fall back to the base species via the
 * `baseSpecies` field on the alt-form's pokedex entry. Same logic
 * covers Mega forms (`salamencemega.baseSpecies = 'Salamence'`),
 * regional forms (`ninetalesalola.baseSpecies = 'Ninetales'`),
 * etc.
 */
export function speciesLearnsMoveGen9(speciesName: string, moveName: string): boolean {
  const moveId = toID(moveName);
  for (const formId of expandFormChain(toID(speciesName))) {
    const learnset = modLearnsets[formId]?.learnset ?? baseLearnsets[formId]?.learnset;
    const sources = learnset?.[moveId];
    if (sources?.some((src) => src.startsWith('9'))) return true;
  }
  return false;
}

/**
 * Returns the species ID followed by its base-species ID (if any).
 * Lets callers walk both alt-form and base entries without coupling
 * to the form-naming convention.
 */
function expandFormChain(speciesId: string): readonly string[] {
  const entry = basePokedex[speciesId];
  if (!entry?.baseSpecies) return [speciesId];
  const baseId = toID(entry.baseSpecies);
  return baseId === speciesId ? [speciesId] : [speciesId, baseId];
}

/**
 * Returns true if the species' pokedex entry lists the ability in any
 * slot (0 / 1 / H / S). Comparison is canonicalized via `toID` so the
 * caller can pass display names (`'Good as Gold'`).
 *
 * **Form-aware.** Walks the species's full form family (e.g. `Salamence`
 * + `Salamence-Mega`, `Charizard` + `Charizard-Mega-X` +
 * `Charizard-Mega-Y`, `Ninetales` + `Ninetales-Alola`). Each form
 * carries its own abilities — Mega Salamence has Aerilate, base has
 * Intimidate/Moxie. Open-sheet displays sometimes show the Mega
 * ability, sometimes the base; we accept either as a valid claim
 * for the species.
 */
export function speciesHasAbility(speciesName: string, abilityName: string): boolean {
  const target = toID(abilityName);
  for (const formId of expandFormFamily(toID(speciesName))) {
    const entry = basePokedex[formId];
    if (!entry) continue;
    const slots = [entry.abilities[0], entry.abilities[1], entry.abilities.H, entry.abilities.S];
    if (slots.some((a) => a !== undefined && toID(a) === target)) return true;
  }
  return false;
}

/**
 * Cached map: base species ID → full form-family IDs (including the
 * base itself and any alt-forms whose `baseSpecies` points back to
 * the base). Built lazily on first access.
 */
let formFamilyCache: Map<string, readonly string[]> | undefined;

function getFormFamilyMap(): Map<string, readonly string[]> {
  if (formFamilyCache !== undefined) return formFamilyCache;
  const map = new Map<string, string[]>();
  for (const [id, entry] of Object.entries(basePokedex)) {
    if (!entry) continue;
    const baseId = entry.baseSpecies ? toID(entry.baseSpecies) : id;
    let family = map.get(baseId);
    if (family === undefined) {
      family = [];
      map.set(baseId, family);
    }
    family.push(id);
  }
  formFamilyCache = map;
  return map;
}

/**
 * Returns the species ID and every alt-form ID that points back to it
 * via `baseSpecies`. For an alt-form input, walks up to the base then
 * back down to the full family.
 */
function expandFormFamily(speciesId: string): readonly string[] {
  const entry = basePokedex[speciesId];
  const baseId = entry?.baseSpecies ? toID(entry.baseSpecies) : speciesId;
  const family = getFormFamilyMap().get(baseId);
  if (family === undefined) return [speciesId];
  return family;
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

/**
 * Returns true if the species exists in the pokedex. Useful for vision
 * extraction validation: "does this name correspond to a known mon?"
 * Doesn't check format-legality — that's a separate concern.
 */
export function speciesExists(speciesName: string): boolean {
  return basePokedex[toID(speciesName)] !== undefined;
}
