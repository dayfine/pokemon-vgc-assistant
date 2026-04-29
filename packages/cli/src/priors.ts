import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Format } from '@pva/engine';
import {
  type PikalyticsSpeciesData,
  type SheetMode,
  fetchPikalytics,
  parsePikalyticsMarkdown,
  readCache,
  writeCache,
} from '@pva/priors';

/**
 * Test-injection seam for the priors layer. Tests pass a stub that
 * returns canned `PikalyticsSpeciesData` per species so the orchestrator
 * unit tests stay offline.
 *
 * The default implementation (`createDefaultPriorsClient`) wires
 * `priors.fetchPikalytics` + `priors.parsePikalyticsMarkdown` with the
 * priors cache layer underneath, so a closed-sheet `pva recommend`
 * makes at most one Pikalytics call per opp species per cache TTL.
 */
export interface PriorsClient {
  fetchSpecies(species: string): Promise<PikalyticsSpeciesData>;
}

export interface DefaultPriorsClientOptions {
  readonly format: Format;
  readonly sheetMode: SheetMode;
  /** Cache root directory. Defaults to `~/.cache/pva/priors`. */
  readonly cacheRoot?: string;
  /** Cache TTL in days. Defaults to 7. */
  readonly ttlDays?: number;
  /** Override the network fetcher (mostly for tests). */
  readonly fetcher?: typeof fetch;
}

const DEFAULT_TTL_DAYS = 7;
const PIKALYTICS_SOURCE = 'pikalytics';

/**
 * Default priors client. Reads from a local cache (`~/.cache/pva/priors`
 * by default) before going to the network; on miss it fetches Pikalytics,
 * parses the response, and writes both raw + parsed entries back to the
 * cache. Per `dev/research/pikalytics-2026-04-27.md`, this respects
 * Pikalytics' robots.txt and identifies traffic via the priors-package
 * USER_AGENT.
 *
 * One file in the CLI (besides `commands/recommend.ts`'s media-type
 * sniffing) that touches the network — `qc-structural` allows this only
 * because the priors package's `fetchPikalytics` is the actual call site.
 */
export function createDefaultPriorsClient(opts: DefaultPriorsClientOptions): PriorsClient {
  const cacheRoot = opts.cacheRoot ?? join(homedir(), '.cache', 'pva', 'priors');
  const ttlDays = opts.ttlDays ?? DEFAULT_TTL_DAYS;
  return {
    async fetchSpecies(species: string): Promise<PikalyticsSpeciesData> {
      const cached = readCache(opts.format, PIKALYTICS_SOURCE, species, {
        root: cacheRoot,
        ttlDays,
      });
      if (cached !== undefined) return cached.parsed;
      const raw = await fetchPikalytics(opts.format, opts.sheetMode, species, opts.fetcher);
      const parsed = parsePikalyticsMarkdown(raw);
      writeCache(opts.format, PIKALYTICS_SOURCE, species, { raw, parsed }, { root: cacheRoot });
      return parsed;
    },
  };
}
