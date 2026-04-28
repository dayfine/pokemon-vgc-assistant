/**
 * On-disk cache for fetched + parsed Pikalytics responses.
 *
 * The cache is keyed by `(format, source, species)` and writes two files
 * per entry:
 *   - `<species>.md`   — the raw Markdown response, useful for re-parsing
 *                        when the parser changes without forcing a refetch.
 *   - `<species>.json` — the parsed `PikalyticsSpeciesData`, ready to feed
 *                        `expand`.
 *
 * TTL is enforced via mtime: if the parsed JSON's mtime is older than
 * `ttlDays` × 86400000 ms relative to a caller-supplied `now`, the cache
 * miss is reported. Engine purity rule applies: this module never reads
 * `pva.config.ts` — `ttlDays` and `cacheRoot` come in as parameters from
 * the CLI / test layer.
 *
 * Tests use a tmpdir cache root via `os.tmpdir()`; production uses
 * `data/cache/priors/...` under the repo root (gitignored).
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PikalyticsSpeciesData } from './types.js';

export interface CacheOptions {
  /** Root directory where `<format>/<source>/<species>.{md,json}` lives. */
  readonly root: string;
  /** Days before a cache entry is considered stale. */
  readonly ttlDays: number;
  /** Now, in epoch ms. Injected for deterministic tests. */
  readonly now?: number;
}

export interface CacheEntry {
  readonly raw: string;
  readonly parsed: PikalyticsSpeciesData;
}

const MS_PER_DAY = 86_400_000;

function entryDir(root: string, format: string, source: string): string {
  // Path components are only "trusted" callers (format ID + source slug,
  // both controlled by `priors`), so no extra sanitisation. Species names
  // can contain spaces or hyphens; we encode hard separators only.
  return join(root, format, source);
}

function entryPaths(
  root: string,
  format: string,
  source: string,
  species: string,
): { md: string; json: string } {
  const safeSpecies = species.replace(/[/\\]/g, '_');
  const dir = entryDir(root, format, source);
  return {
    md: join(dir, `${safeSpecies}.md`),
    json: join(dir, `${safeSpecies}.json`),
  };
}

/**
 * Read a cache entry if present and within TTL. Returns `undefined` on
 * miss (entry absent, parsed JSON unreadable, or stale by mtime).
 */
export function readCache(
  format: string,
  source: string,
  species: string,
  options: CacheOptions,
): CacheEntry | undefined {
  const paths = entryPaths(options.root, format, source, species);
  let mtimeMs: number;
  try {
    mtimeMs = statSync(paths.json).mtimeMs;
  } catch {
    return undefined;
  }
  const now = options.now ?? Date.now();
  if (now - mtimeMs > options.ttlDays * MS_PER_DAY) return undefined;
  let parsed: PikalyticsSpeciesData;
  let raw: string;
  try {
    parsed = JSON.parse(readFileSync(paths.json, 'utf8')) as PikalyticsSpeciesData;
    raw = readFileSync(paths.md, 'utf8');
  } catch {
    return undefined;
  }
  return { raw, parsed };
}

/**
 * Write both the raw Markdown and parsed JSON for a cache entry. Creates
 * intermediate directories. The mtime gate in `readCache` reads the JSON's
 * mtime, so writing JSON after the Markdown ensures stale Markdown can't
 * outlive a freshly-parsed JSON record.
 */
export function writeCache(
  format: string,
  source: string,
  species: string,
  entry: CacheEntry,
  options: Pick<CacheOptions, 'root'>,
): void {
  const paths = entryPaths(options.root, format, source, species);
  mkdirSync(dirname(paths.md), { recursive: true });
  writeFileSync(paths.md, entry.raw, 'utf8');
  writeFileSync(paths.json, JSON.stringify(entry.parsed, null, 2), 'utf8');
}
