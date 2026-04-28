/**
 * Public API for `@pva/priors`.
 *
 * Engine-purity rule applies here too: this module re-exports surface area
 * only. The Pikalytics fetcher (network I/O) and the on-disk cache (fs
 * I/O) are exposed but do their I/O at call sites — no top-level side
 * effects on import.
 *
 * Architecture: `priors` depends on `@pva/engine` for **types only**.
 * Nothing in `priors/src/*` imports a runtime function from `@pva/engine`
 * (qc-structural enforces this). The Generation parameter passed into
 * `expand` and `solveThreshold` flows from the caller, who got it from
 * `engine.getGeneration()`. The threshold solver calls `@smogon/calc`
 * directly (the same dependency `engine.calc` wraps) rather than going
 * through `engine` — preserves the priors→engine types-only edge while
 * avoiding a duplicate calc abstraction.
 */

export { expand } from './expand.js';
export type {
  ExpandClosed,
  ExpandOpen,
  ExpandOptions,
  KnownKit,
} from './expand.js';

export {
  fieldFingerprint,
  kitFingerprint,
  readCache,
  readThresholdCache,
  writeCache,
  writeThresholdCache,
} from './cache.js';
export type {
  CacheEntry,
  CacheOptions,
  FieldFingerprint,
  FieldFingerprintInput,
  KitFingerprint,
  KitFingerprintInput,
  ThresholdCacheEntry,
  ThresholdCacheKey,
  ThresholdCacheOptions,
} from './cache.js';

export {
  fetchPikalytics,
  parsePikalyticsMarkdown,
  pikalyticsSlug,
  pikalyticsUrl,
  UnknownFormatError,
  USER_AGENT,
} from './sources/pikalytics.js';
export type { SheetMode } from './sources/pikalytics.js';

export { outcomeProbability } from './outcome.js';
export { SPECIES_WITH_DISTRIBUTION, STAT_DISTRIBUTIONS } from './stat-distributions.js';
export { solveThreshold } from './threshold.js';
export type { ThresholdSolverOptions } from './threshold.js';

export type {
  AbilityPrior,
  ItemPrior,
  KitCandidate,
  MovePrior,
  OutcomeProbability,
  PikalyticsSpeciesData,
  RepresentativeSpread,
  StatBucket,
  StatBucketWeight,
  ThresholdResult,
} from './types.js';
