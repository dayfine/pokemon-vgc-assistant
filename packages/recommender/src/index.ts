/**
 * Public API for `@pva/recommender`.
 *
 * Architecture: depends on `@pva/engine` for **types only**. No runtime
 * `@pva/engine` imports — the recommender consumes engine outputs
 * (matrix, speed ranking, ranked picks) via its caller, doesn't compute
 * them itself. qc-structural enforces this constraint.
 *
 * No imports from `@pva/priors` or `@pva/vision` — those tracks feed
 * the *inputs* to the recommender via the CLI/web wiring, not via direct
 * dependency.
 *
 * The only side-effecting file is `client.ts` (reads `process.env` and
 * calls the Anthropic SDK). Default tests run offline against a mocked
 * client; live tests gate on `RUN_LIVE_TESTS=1`.
 */

export { DEFAULT_MODEL, createDefaultClient } from './client.js';
export { recommend } from './extract.js';
export { FACTS, selectFacts } from './facts.js';
export type { Fact } from './facts.js';
export { buildPrompt } from './prompt.js';
export {
  parseAgentRecommendation,
  validateAgainstLegalSpecies,
} from './schema.js';
export type {
  AgentRecommendation,
  AnthropicClient,
  KeyThreat,
  LeadScenario,
  RecommendOptions,
  RecommenderErrorKind,
  SheetMode,
} from './types.js';
export { RecommenderError } from './types.js';
