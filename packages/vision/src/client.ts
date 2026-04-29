import Anthropic from '@anthropic-ai/sdk';
import { type AnthropicVisionClient, ExtractionError, type VisionImage } from './types.js';

/**
 * Default vision model. The Anthropic SDK rev'd 0.65 supports
 * Sonnet 4.6 with vision; using the same default the recommender
 * package uses keeps the cost / capability profile consistent.
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** Default max output tokens. Vision responses are JSON of bounded size. */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Thin Anthropic SDK wrapper for the Vision API. The only file in
 * this package that touches `process.env`; qc-structural enforces.
 *
 * Reads `ANTHROPIC_API_KEY` lazily so test setups that swap the env
 * between cases work.
 */
export function createDefaultClient(): AnthropicVisionClient {
  return {
    async call(systemPrompt: string, userPrompt: string, image: VisionImage): Promise<string> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey === undefined || apiKey.length === 0) {
        throw new ExtractionError(
          'api-error',
          'ANTHROPIC_API_KEY not set; cannot make a real Vision API call. For tests, pass `client` or `mockResponse` in ExtractOptions.',
        );
      }
      const sdk = new Anthropic({ apiKey });
      try {
        const message = await sdk.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: DEFAULT_MAX_TOKENS,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: image.mediaType,
                    data: image.bytes.toString('base64'),
                  },
                },
                { type: 'text', text: userPrompt },
              ],
            },
          ],
        });
        const text = message.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .join('');
        if (text.length === 0) {
          throw new ExtractionError(
            'api-error',
            'Anthropic Vision response contained no text blocks',
          );
        }
        return text;
      } catch (err) {
        if (err instanceof ExtractionError) throw err;
        throw new ExtractionError(
          'api-error',
          `Anthropic Vision API call failed: ${(err as Error).message}`,
        );
      }
    },
  };
}
