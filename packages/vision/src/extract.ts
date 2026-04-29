import { createDefaultClient } from './client.js';
import { buildVisionPrompt } from './prompt.js';
import { parseAndValidate } from './schema.js';
import {
  type ExtractOptions,
  type ExtractedTeamPreview,
  ExtractionError,
  type VisionImage,
} from './types.js';
import { validateExtraction } from './validate.js';

/**
 * Public entry. Extract a team-preview screenshot into a typed
 * `ExtractedTeamPreview`. Single Claude Vision call; no retry path
 * (caller decides — see design doc §"Validation").
 *
 * Test injection points:
 * - `opts.client` — swap the real SDK for a mock implementing
 *   `AnthropicVisionClient`.
 * - `opts.mockResponse` — bypass the client entirely with a recorded
 *   model response. Used by unit tests that exercise the parsing /
 *   validation pipeline without ever touching the API surface.
 *
 * The default client is constructed lazily so tests that don't set
 * `ANTHROPIC_API_KEY` can still drive the pipeline via mocks.
 */
export async function extract(
  image: VisionImage,
  opts: ExtractOptions,
): Promise<ExtractedTeamPreview> {
  const { system, user } = buildVisionPrompt(opts.sheetMode, opts.format);

  let raw: string;
  if (opts.mockResponse !== undefined) {
    raw = opts.mockResponse;
  } else {
    const client = opts.client ?? createDefaultClient();
    raw = await client.call(system, user, image);
  }

  const parsed = parseAndValidate(raw, opts.sheetMode);

  if (parsed.confidence === 'low') {
    // The model self-reported low confidence. Surface as a typed
    // error rather than returning a low-quality extraction silently —
    // the caller (CLI / live-capture / web UI) decides whether to
    // retry, ask the user, or accept the partial result.
    throw new ExtractionError(
      'low-confidence',
      'Model self-reported low confidence in the extraction',
      parsed.notes,
      raw,
    );
  }

  validateExtraction(parsed, opts.format);

  return parsed;
}
