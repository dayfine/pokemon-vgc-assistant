import type { Format } from '@pva/engine';
import type { SheetMode } from './types.js';

/**
 * System + user prompt builder for the Claude Vision call. Pure; tests
 * pin the output via inline snapshots so changes are deliberate.
 *
 * Sprite-based species ID is the load-bearing path — the prompt
 * explicitly tells the model NOT to rely on OCR-of-labels (the Switch
 * UI can be in any locale) and to return English Showdown-canonical
 * names for everything.
 *
 * Per `dev/plans/05-vision-design.md`:
 * - Closed sheet: opp rows return species + optional gender only.
 * - Open sheet: opp rows include item + ability + moves + tera.
 * - My-side rows are always open-sheet (the Switch shows my full sets
 *   to me regardless of the format's sheet mode).
 */

export interface BuiltVisionPrompt {
  readonly system: string;
  readonly user: string;
}

export function buildVisionPrompt(sheetMode: SheetMode, format: Format): BuiltVisionPrompt {
  return {
    system: systemPrompt(),
    user: userPrompt(sheetMode, format),
  };
}

function systemPrompt(): string {
  return [
    'You are a Pokémon team-preview extractor for Pokémon Champions VGC (a Switch game).',
    '',
    'You receive a screenshot of the team-preview screen and return a strict JSON object describing the Pokémon visible on screen. Two screen modes exist:',
    '',
    '- **closed sheet** (ranked ladder): opponent rows show only sprite + a generic frame. Item, ability, moves, and Tera type are HIDDEN for opp.',
    '- **open sheet** (tournament / TPCi events): opponent rows show sprite + ability text + item icon + 4 moves + Tera type.',
    '',
    "In both modes, MY side (the user's team) is fully visible — return the full kit for my mons regardless of the sheet mode flag.",
    '',
    'The Switch UI may be in any language (English, Japanese, Chinese, Korean, etc.). **Use sprite + icon recognition, not OCR-of-labels.** Sprite layout and visual icons are language-invariant.',
    '',
    'Always return English Showdown-canonical names. Examples: `Charizard`, `Indeedee-F` (form-suffixed), `Charizardite X`, `Intimidate`, `Knock Off`, `Helping Hand`. Mega Stones use the `<Species>ite` pattern (e.g. `Salamencite`, `Tyranitarite`); Charizardite has X/Y suffixes.',
    '',
    'If you cannot identify a sprite confidently, set `confidence: "low"` and describe the uncertainty in the top-level `notes` field. Never guess silently — partial information with stated uncertainty is more useful than confident wrong answers.',
    '',
    'Output the JSON object only — no surrounding prose, no markdown code fence.',
  ].join('\n');
}

function userPrompt(sheetMode: SheetMode, format: Format): string {
  const sheetLine =
    sheetMode === 'open'
      ? 'Sheet mode: **open**. Opponent rows include item, ability, four moves, and Tera type. Read all of them.'
      : 'Sheet mode: **closed**. Opponent rows show only sprite + (sometimes) a gender icon. Return species + optional gender for opp; do NOT invent item / ability / moves / Tera fields.';
  const teraLine = formatLine(format);
  const schema = sheetMode === 'open' ? OPEN_SHEET_SCHEMA : CLOSED_SHEET_SCHEMA;
  return [
    `Format: ${format}.`,
    teraLine,
    sheetLine,
    '',
    "Extract the team preview into the JSON schema below. The screen shows my team on one side and the opponent's team on the other. For my side, return the full kit (open-sheet shape). For opp, follow the sheet-mode rule above.",
    '',
    'Return six entries per side when six are visible. If fewer rows are present (e.g. partial frame), return what you see and explain the gap in `notes`.',
    '',
    'JSON schema:',
    '',
    '```',
    schema,
    '```',
    '',
    'Output the JSON only.',
  ].join('\n');
}

/**
 * Per-format reminder lines. Format ID literals are scoped here only —
 * call sites reference `format` by parameter so adding new formats is
 * a config change.
 */
function formatLine(format: Format): string {
  switch (format) {
    case 'gen9championsvgc2026regma':
      return 'Reg M-A is no-Tera — every entry\'s `tera` field MUST be omitted (do not return null or "None").';
    case 'gen9championsvgc2026regmb':
      return 'Reg M-B rules are TBD. Treat with M-A defaults (no Tera) unless visible evidence in the screenshot says otherwise.';
  }
}

const OPEN_SHEET_SCHEMA = `{
  "sheetMode": "open",
  "myTeam": [
    { "species": "Charizard", "gender": "M", "item": "Charizardite X", "ability": "Blaze", "moves": ["Dragon Dance", "Flare Blitz", "Dragon Claw", "Protect"], "tera": null }
  ],
  "oppTeam": [
    { "species": "Indeedee-F", "gender": "F", "item": "Psychic Seed", "ability": "Psychic Surge", "moves": ["Follow Me", "Expanding Force", "Dazzling Gleam", "Helping Hand"] }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "optional free-form string"
}`;

const CLOSED_SHEET_SCHEMA = `{
  "sheetMode": "closed",
  "myTeam": [
    { "species": "Charizard", "gender": "M", "item": "Charizardite X", "ability": "Blaze", "moves": ["Dragon Dance", "Flare Blitz", "Dragon Claw", "Protect"] }
  ],
  "oppTeam": [
    { "species": "Indeedee-F", "gender": "F" }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "optional free-form string"
}`;
