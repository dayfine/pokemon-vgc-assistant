import type { Format } from '@pva/engine';
import {
  itemExists,
  speciesExists,
  speciesHasAbility,
  speciesLearnsMoveGen9,
} from '@pva/showdown-data';
import {
  type ExtractedKit,
  type ExtractedMon,
  type ExtractedTeamPreview,
  ExtractionError,
} from './types.js';

/**
 * Cross-check every field in an `ExtractedTeamPreview` against the
 * vendored Showdown-Champions snapshot. Throws `ExtractionError` with
 * `kind='illegal-field'` on the first violation, naming the offending
 * field so the caller (or a retry path) can localize the fix.
 *
 * Validation rules per `dev/plans/05-vision-design.md` §"Validation":
 *
 * - `species` must exist in the pokedex.
 * - `item` (when present) must exist in the items table.
 * - `ability` (when present) must be one of the species' pokedex
 *   abilities.
 * - `move` (when present) must be on the species' gen-9 movepool.
 * - `tera` must be undefined for M-A. (M-B rules are TBD; we apply
 *   the M-A default until told otherwise.)
 *
 * Validation is shallow on `gender` — the schema layer already ensures
 * it's `'M' | 'F' | 'N'`; we trust that.
 */
export function validateExtraction(extracted: ExtractedTeamPreview, format: Format): void {
  validateTeam(extracted.myTeam, 'myTeam', format);
  validateTeam(extracted.oppTeam, 'oppTeam', format);
}

function validateTeam(
  team: readonly (ExtractedMon | ExtractedKit)[],
  fieldName: string,
  format: Format,
): void {
  for (let i = 0; i < team.length; i += 1) {
    const entry = team[i];
    if (entry === undefined) continue;
    validateEntry(entry, `${fieldName}[${i}]`, format);
  }
}

function validateEntry(entry: ExtractedMon | ExtractedKit, where: string, format: Format): void {
  if (!speciesExists(entry.species)) {
    throw new ExtractionError(
      'illegal-field',
      `${where}.species "${entry.species}" not found in the Showdown pokedex`,
      'Check spelling / form suffix; expected Showdown-canonical name (e.g. "Indeedee-F", not "Indeedee Female")',
    );
  }

  // Open-sheet entries carry kit fields; cast so we can probe them.
  const kit = entry as ExtractedKit;

  if (kit.item !== undefined && !itemExists(kit.item)) {
    throw new ExtractionError(
      'illegal-field',
      `${where}.item "${kit.item}" not found in the Showdown items table`,
    );
  }

  if (kit.ability !== undefined && !speciesHasAbility(entry.species, kit.ability)) {
    throw new ExtractionError(
      'illegal-field',
      `${where}.ability "${kit.ability}" is not a legal ability for ${entry.species}`,
      'Ability must appear in the species pokedex abilities (slot 0/1/H/S)',
    );
  }

  if (kit.moves !== undefined) {
    for (const move of kit.moves) {
      if (!speciesLearnsMoveGen9(entry.species, move)) {
        throw new ExtractionError(
          'illegal-field',
          `${where}.moves: "${entry.species}" does not learn "${move}" under gen-9 rules`,
        );
      }
    }
  }

  if (kit.tera !== undefined) {
    if (isNoTeraFormat(format)) {
      throw new ExtractionError(
        'illegal-field',
        `${where}.tera "${kit.tera}" not allowed under format ${format} (no-Tera)`,
        'Reg M-A bans Tera; the model should omit the field rather than emit "None" or null',
      );
    }
  }
}

/**
 * Whether the format bans Terastallization. Reg M-A is no-Tera; M-B's
 * official rules haven't shipped — we treat it as no-Tera too until
 * evidence suggests otherwise. Update when a future format unlocks
 * Tera.
 */
function isNoTeraFormat(format: Format): boolean {
  switch (format) {
    case 'gen9championsvgc2026regma':
      return true;
    case 'gen9championsvgc2026regmb':
      return true;
  }
}
