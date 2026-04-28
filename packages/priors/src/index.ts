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
 * `expand` flows from the caller, who got it from `engine.getGeneration()`.
 */

export { expand } from './expand.js';
export type {
  ExpandClosed,
  ExpandOpen,
  ExpandOptions,
  KnownKit,
} from './expand.js';

export { readCache, writeCache } from './cache.js';
export type { CacheEntry, CacheOptions } from './cache.js';

export {
  fetchPikalytics,
  parsePikalyticsMarkdown,
  pikalyticsSlug,
  pikalyticsUrl,
  UnknownFormatError,
  USER_AGENT,
} from './sources/pikalytics.js';
export type { SheetMode } from './sources/pikalytics.js';

export type {
  AbilityPrior,
  ItemPrior,
  KitCandidate,
  MovePrior,
  PikalyticsSpeciesData,
  RepresentativeSpread,
  StatBucket,
} from './types.js';
