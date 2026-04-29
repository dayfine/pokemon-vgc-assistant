import type { Format } from '@pva/engine';

/**
 * Vision-package public types. Mirror the shape laid out in
 * `dev/plans/05-vision-design.md` §"Public API shape".
 */

export type SheetMode = 'closed' | 'open';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type Gender = 'M' | 'F' | 'N';

/**
 * Closed-sheet extraction returns species (and gender when visible).
 * Item / ability / moves / Tera are HIDDEN under closed sheet, so the
 * model is instructed to omit them for opp rows.
 */
export interface ExtractedMon {
  readonly species: string;
  readonly gender?: Gender;
}

/**
 * Open-sheet extraction adds the kit fields: item, ability, four moves,
 * Tera type. M-A is no-Tera, so `tera` should be undefined under that
 * format — validator enforces.
 */
export interface ExtractedKit extends ExtractedMon {
  readonly item?: string;
  readonly ability?: string;
  readonly moves?: readonly string[];
  readonly tera?: string;
}

/**
 * Result of `extract(image, opts)`. Both sides are returned because the
 * Champions team-preview screen renders my-team and opp-team in the
 * same frame.
 */
export interface ExtractedTeamPreview {
  readonly sheetMode: SheetMode;
  /**
   * Always populated — my side is open-sheet on every team-preview
   * screen (the Switch shows my full sets to me regardless of the
   * format's sheet mode).
   */
  readonly myTeam: readonly ExtractedKit[];
  /**
   * Closed-sheet `oppTeam` entries carry only `species` + optional
   * `gender`. Open-sheet entries carry the full `ExtractedKit`.
   */
  readonly oppTeam: readonly (ExtractedMon | ExtractedKit)[];
  readonly confidence: ConfidenceLevel;
  /**
   * Free-form notes from the model — surfaces uncertainty (e.g. "the
   * third opp mon's sprite was occluded; my best guess is X"). Caller
   * can show this in the UI for the user to override.
   */
  readonly notes?: string;
}

export type ExtractionErrorKind =
  | 'invalid-response' // JSON parse failed or schema mismatch
  | 'illegal-field' // species / ability / item / move not legal in format
  | 'low-confidence' // model self-reported low confidence
  | 'api-error'; // upstream API call failed

export class ExtractionError extends Error {
  readonly kind: ExtractionErrorKind;
  readonly detail: string | undefined;
  /** Raw model output, when available — useful for debugging. */
  readonly raw: string | undefined;
  constructor(kind: ExtractionErrorKind, message: string, detail?: string, raw?: string) {
    super(message);
    this.name = 'ExtractionError';
    this.kind = kind;
    this.detail = detail;
    this.raw = raw;
  }
}

/**
 * Minimal Anthropic vision client interface. The real Anthropic SDK
 * client implements this; tests inject mocks. Mirrors the recommender
 * package's `AnthropicClient` (single-message create with a string
 * response), but message content carries an image block.
 */
export interface AnthropicVisionClient {
  call(systemPrompt: string, userPrompt: string, image: VisionImage): Promise<string>;
}

/**
 * Image payload passed to the vision client. `bytes` is the raw image
 * content; `mediaType` matches what the Anthropic API expects on the
 * image source (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).
 */
export interface VisionImage {
  readonly bytes: Buffer;
  readonly mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface ExtractOptions {
  readonly sheetMode: SheetMode;
  readonly format: Format;
  /** Override the Anthropic client (tests inject mocks). */
  readonly client?: AnthropicVisionClient;
  /**
   * Bypass the client entirely with a recorded response. Used for unit
   * tests that exercise the parsing / validation pipeline without
   * touching the API surface.
   */
  readonly mockResponse?: string;
}
