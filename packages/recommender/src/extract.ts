import { DEFAULT_MODEL, createDefaultClient } from './client.js';
import { buildPrompt } from './prompt.js';
import { parseAgentRecommendation } from './schema.js';
import type { AgentRecommendation, RecommendOptions } from './types.js';
import { RecommenderError } from './types.js';

/**
 * Public entry point. Pipeline:
 *   1. Build prompt from `opts`.
 *   2. If `opts.mockResponse` is set, skip the client and use it as the
 *      raw response (mock-replay path).
 *   3. Otherwise call `opts.client` (or default) with the prompt.
 *   4. Parse + schema-validate the response.
 *   5. Return the typed `AgentRecommendation`, or throw a typed
 *      `RecommenderError`.
 *
 * No retry on malformed JSON for v1. The design doc allows it; the
 * experiment shows the model returns valid JSON consistently when the
 * prompt asks for "JSON only, no fence". Adding retries before we have
 * a malformed-response signal in the wild is premature.
 */
export async function recommend(opts: RecommendOptions): Promise<AgentRecommendation> {
  const prompt = buildPrompt(opts);
  const raw = opts.mockResponse ?? (await callClient(prompt, opts));
  return parseAgentRecommendation(raw);
}

async function callClient(prompt: string, opts: RecommendOptions): Promise<string> {
  const client = opts.client ?? createDefaultClient();
  const model = opts.anthropicModel ?? DEFAULT_MODEL;
  try {
    return await client.complete({ prompt, model });
  } catch (err) {
    if (err instanceof RecommenderError) throw err;
    throw new RecommenderError('api-error', `client.complete failed: ${(err as Error).message}`);
  }
}
