/**
 * Hand-rolled validator for the model's JSON response. Mirrors the
 * pattern recommender uses — small, dependency-free, throws typed
 * `ExtractionError` on every malformed-input path.
 *
 * The model sometimes wraps JSON in markdown code fences; we strip
 * those before parsing.
 */

import {
  type ConfidenceLevel,
  type ExtractedKit,
  type ExtractedMon,
  type ExtractedTeamPreview,
  ExtractionError,
  type Gender,
  type SheetMode,
} from './types.js';

const VALID_CONFIDENCE: readonly ConfidenceLevel[] = ['high', 'medium', 'low'];
const VALID_GENDER: readonly Gender[] = ['M', 'F', 'N'];

/**
 * Strip markdown code fences from a model response. The Claude Vision
 * API sometimes returns JSON wrapped in ```json ... ``` despite our
 * "JSON only" instruction; tolerate both shapes.
 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch?.[1] !== undefined) return fenceMatch[1].trim();
  return trimmed;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Parse a raw model response and validate against the
 * `ExtractedTeamPreview` shape. Throws `ExtractionError` with
 * `kind='invalid-response'` on parse failure or shape mismatch.
 *
 * `sheetMode` is passed in (not read from the response) because the
 * caller already knows it — we use it to enforce the closed/open
 * shape difference: under closed sheet, opp entries must NOT carry
 * `item` / `ability` / `moves` / `tera`.
 */
export function parseAndValidate(raw: string, sheetMode: SheetMode): ExtractedTeamPreview {
  const stripped = stripCodeFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    throw new ExtractionError(
      'invalid-response',
      'Model response was not valid JSON',
      e instanceof Error ? e.message : String(e),
      raw,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new ExtractionError(
      'invalid-response',
      'Top-level response must be a JSON object',
      `Got ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
      raw,
    );
  }

  const responseSheetMode = parsed.sheetMode;
  if (responseSheetMode !== 'closed' && responseSheetMode !== 'open') {
    throw new ExtractionError(
      'invalid-response',
      'Missing or invalid `sheetMode` (expected "closed" | "open")',
      `Got ${JSON.stringify(responseSheetMode)}`,
      raw,
    );
  }
  if (responseSheetMode !== sheetMode) {
    throw new ExtractionError(
      'invalid-response',
      `sheetMode mismatch — caller asked for "${sheetMode}", model returned "${responseSheetMode}"`,
      undefined,
      raw,
    );
  }

  const myTeam = parseTeam(parsed.myTeam, 'myTeam', 'open', raw); // my side is always open
  const oppTeam = parseTeam(parsed.oppTeam, 'oppTeam', sheetMode, raw);

  const confidence = parsed.confidence;
  if (!VALID_CONFIDENCE.includes(confidence as ConfidenceLevel)) {
    throw new ExtractionError(
      'invalid-response',
      'Missing or invalid `confidence` (expected "high" | "medium" | "low")',
      `Got ${JSON.stringify(confidence)}`,
      raw,
    );
  }

  const notes = parsed.notes;
  if (notes !== undefined && typeof notes !== 'string') {
    throw new ExtractionError(
      'invalid-response',
      '`notes` must be a string when present',
      `Got ${typeof notes}`,
      raw,
    );
  }

  const out: ExtractedTeamPreview = {
    sheetMode,
    myTeam,
    oppTeam,
    confidence: confidence as ConfidenceLevel,
    ...(notes !== undefined ? { notes } : {}),
  };
  return out;
}

function parseTeam(
  value: unknown,
  field: string,
  mode: SheetMode,
  raw: string,
): readonly ExtractedKit[] {
  if (!Array.isArray(value)) {
    throw new ExtractionError(
      'invalid-response',
      `\`${field}\` must be an array`,
      `Got ${typeof value}`,
      raw,
    );
  }
  return value.map((entry, idx) => parseEntry(entry, `${field}[${idx}]`, mode, raw));
}

function parseEntry(value: unknown, where: string, mode: SheetMode, raw: string): ExtractedKit {
  if (!isPlainObject(value)) {
    throw new ExtractionError(
      'invalid-response',
      `\`${where}\` must be an object`,
      `Got ${typeof value}`,
      raw,
    );
  }
  const species = value.species;
  if (typeof species !== 'string' || species.length === 0) {
    throw new ExtractionError(
      'invalid-response',
      `\`${where}.species\` must be a non-empty string`,
      `Got ${JSON.stringify(species)}`,
      raw,
    );
  }
  const gender = value.gender;
  if (gender !== undefined && !VALID_GENDER.includes(gender as Gender)) {
    throw new ExtractionError(
      'invalid-response',
      `\`${where}.gender\` must be "M" | "F" | "N" when present`,
      `Got ${JSON.stringify(gender)}`,
      raw,
    );
  }

  const mon: ExtractedMon = {
    species,
    ...(gender !== undefined ? { gender: gender as Gender } : {}),
  };

  if (mode === 'closed') {
    // Closed-sheet entries must NOT carry kit fields. If the model
    // returned them, that's a schema breach we surface explicitly.
    for (const banned of ['item', 'ability', 'moves', 'tera'] as const) {
      if (value[banned] !== undefined) {
        throw new ExtractionError(
          'invalid-response',
          `\`${where}.${banned}\` not allowed under closed sheet`,
          undefined,
          raw,
        );
      }
    }
    return mon;
  }

  const item = value.item;
  if (item !== undefined && (typeof item !== 'string' || item.length === 0)) {
    throw new ExtractionError(
      'invalid-response',
      `\`${where}.item\` must be a non-empty string when present`,
      `Got ${JSON.stringify(item)}`,
      raw,
    );
  }
  const ability = value.ability;
  if (ability !== undefined && (typeof ability !== 'string' || ability.length === 0)) {
    throw new ExtractionError(
      'invalid-response',
      `\`${where}.ability\` must be a non-empty string when present`,
      `Got ${JSON.stringify(ability)}`,
      raw,
    );
  }
  const moves = value.moves;
  let movesOut: readonly string[] | undefined;
  if (moves !== undefined) {
    if (!Array.isArray(moves) || moves.some((m) => typeof m !== 'string' || m.length === 0)) {
      throw new ExtractionError(
        'invalid-response',
        `\`${where}.moves\` must be an array of non-empty strings when present`,
        `Got ${JSON.stringify(moves)}`,
        raw,
      );
    }
    if (moves.length > 4) {
      throw new ExtractionError(
        'invalid-response',
        `\`${where}.moves\` has ${moves.length} entries; max 4`,
        undefined,
        raw,
      );
    }
    movesOut = moves as readonly string[];
  }
  const tera = value.tera;
  if (tera !== undefined && typeof tera !== 'string') {
    throw new ExtractionError(
      'invalid-response',
      `\`${where}.tera\` must be a string when present`,
      `Got ${JSON.stringify(tera)}`,
      raw,
    );
  }

  return {
    ...mon,
    ...(item !== undefined ? { item } : {}),
    ...(ability !== undefined ? { ability } : {}),
    ...(movesOut !== undefined ? { moves: movesOut } : {}),
    ...(tera !== undefined ? { tera } : {}),
  };
}
