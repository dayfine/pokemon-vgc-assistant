/**
 * `@pva/vision` — Claude Vision-backed team-preview extractor.
 *
 * Public surface: a single `extract()` function plus the result /
 * options / error types. See `dev/plans/05-vision-design.md` for the
 * design.
 */

export { DEFAULT_MODEL, createDefaultClient } from './client.js';
export { extract } from './extract.js';
export { buildVisionPrompt } from './prompt.js';
export type { BuiltVisionPrompt } from './prompt.js';
export { parseAndValidate } from './schema.js';
export { validateExtraction } from './validate.js';
export type {
  AnthropicVisionClient,
  ConfidenceLevel,
  ExtractOptions,
  ExtractedKit,
  ExtractedMon,
  ExtractedTeamPreview,
  ExtractionErrorKind,
  Gender,
  SheetMode,
  VisionImage,
} from './types.js';
export { ExtractionError } from './types.js';
