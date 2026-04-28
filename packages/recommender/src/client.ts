import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicClient } from './types.js';
import { RecommenderError } from './types.js';

/**
 * Default model per design doc §"Open questions" Q1. Sonnet was the
 * model that the 2026-04-28 experiment used successfully; Opus override
 * is per-call via `RecommendOptions.anthropicModel`.
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Default max output tokens. The experiment recorded a ~5KB response;
 * 4096 tokens of output covers that with headroom.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Thin Anthropic SDK wrapper. The only file in this package that touches
 * `process.env`; qc-structural enforces that constraint.
 *
 * Reads `ANTHROPIC_API_KEY` lazily (per call) so test setups that swap
 * the env between tests work. The SDK constructor reads the same
 * variable by default; we read explicitly so we can throw a typed
 * `RecommenderError` instead of the SDK's untyped error.
 */
export function createDefaultClient(): AnthropicClient {
  return {
    async complete({ prompt, model }) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey === undefined || apiKey.length === 0) {
        throw new RecommenderError(
          'api-error',
          'ANTHROPIC_API_KEY not set; cannot make a real API call. For tests, pass `client` or `mockResponse` in RecommendOptions.',
        );
      }
      const sdk = new Anthropic({ apiKey });
      try {
        const message = await sdk.messages.create({
          model,
          max_tokens: DEFAULT_MAX_TOKENS,
          messages: [{ role: 'user', content: prompt }],
        });
        // Concatenate all text blocks. The SDK supports multi-block
        // responses (tool use, thinking); for our prompt the response is
        // a single text block, but we defensively join.
        const text = message.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .join('');
        if (text.length === 0) {
          throw new RecommenderError('api-error', 'Anthropic response contained no text blocks');
        }
        return text;
      } catch (err) {
        if (err instanceof RecommenderError) throw err;
        throw new RecommenderError(
          'api-error',
          `Anthropic API call failed: ${(err as Error).message}`,
        );
      }
    },
  };
}
