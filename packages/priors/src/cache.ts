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

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PikalyticsSpeciesData, ThresholdResult } from './types.js';

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

// --- Threshold cache (M4.5) -------------------------------------------------

/**
 * Stable fingerprint of an attacker / defender kit for cache keying.
 * Threshold values depend on (species, item, ability, moves) — not on
 * spread/EVs (the binary search over offensive stat is exactly what
 * varies the EV-equivalent), so we exclude `nature`, `evs`, `weight`,
 * and `bucket` to maximise cache hit rate.
 *
 * Moves are sorted before hashing so the same 4-move set in different
 * orders produces the same fingerprint. The hash is a hex-encoded SHA-1
 * truncated to 16 chars — collision risk in this corpus is negligible
 * (millions of distinct kits before a 50% collision rate).
 */
export interface KitFingerprintInput {
  readonly species: string;
  readonly item: string;
  readonly ability: string;
  readonly moves: readonly string[];
}

export type KitFingerprint = string;

export function kitFingerprint(input: KitFingerprintInput): KitFingerprint {
  const moves = [...input.moves].sort();
  const blob = JSON.stringify({
    species: input.species,
    item: input.item,
    ability: input.ability,
    moves,
  });
  return createHash('sha1').update(blob).digest('hex').slice(0, 16);
}

/**
 * Stable fingerprint of a calc field for cache keying. We accept a
 * partial subset of the calc's `Field` shape (`gameType`, `weather`,
 * `terrain`, attacker/defender side flags) because that's what M4.5's
 * threshold solver passes through. Adding a field key here is an
 * additive change — older cache entries miss, recompute, and re-cache
 * cleanly because the fingerprint changes.
 */
export interface FieldFingerprintInput {
  readonly gameType?: string;
  readonly weather?: string;
  readonly terrain?: string;
  readonly attackerSide?: Record<string, unknown>;
  readonly defenderSide?: Record<string, unknown>;
}

export type FieldFingerprint = string;

export function fieldFingerprint(input?: FieldFingerprintInput): FieldFingerprint {
  if (input === undefined) return 'default';
  const blob = JSON.stringify({
    gameType: input.gameType ?? 'Doubles',
    weather: input.weather ?? null,
    terrain: input.terrain ?? null,
    attackerSide: input.attackerSide ?? null,
    defenderSide: input.defenderSide ?? null,
  });
  return createHash('sha1').update(blob).digest('hex').slice(0, 16);
}

/**
 * Composite cache key for one threshold lookup. The threshold cache is
 * format-stable: rotating from M-A to M-B doesn't invalidate M-A entries
 * because the calc behaviour for a given (kit, kit, move, field) tuple
 * doesn't depend on which format the kit came from. We still bucket by
 * `format` in the on-disk path for human-readable directory layout.
 */
export interface ThresholdCacheKey {
  readonly format: string;
  readonly attacker: KitFingerprintInput;
  readonly defender: KitFingerprintInput;
  readonly move: string;
  readonly field?: FieldFingerprintInput;
}

const THRESHOLD_SOURCE = 'thresholds';

/**
 * Hash the (attacker, defender, move, field) tuple into a single sha. The
 * `format` doesn't enter the hash — its only role is to bucket the on-disk
 * directory.
 */
function thresholdShaForKey(key: ThresholdCacheKey): string {
  const moveID = key.move.toLowerCase().replace(/[^a-z0-9]/g, '');
  const blob = JSON.stringify({
    a: kitFingerprint(key.attacker),
    d: kitFingerprint(key.defender),
    m: moveID,
    f: fieldFingerprint(key.field),
  });
  return createHash('sha1').update(blob).digest('hex').slice(0, 32);
}

function thresholdEntryPath(root: string, key: ThresholdCacheKey): string {
  const sha = thresholdShaForKey(key);
  return join(root, key.format, THRESHOLD_SOURCE, `${sha}.json`);
}

export interface ThresholdCacheOptions {
  /** Root directory; same shape as `CacheOptions.root`. */
  readonly root: string;
  /**
   * Days before a threshold entry is considered stale. Default at the
   * caller is 30 — thresholds depend only on calc behaviour (which
   * changes only when `@smogon/calc` upgrades), so they're much more
   * stable than Pikalytics priors (which the M4 cache pins at 7 days).
   */
  readonly ttlDays: number;
  /** Now, in epoch ms. Injected for deterministic tests. */
  readonly now?: number;
}

export interface ThresholdCacheEntry {
  readonly key: ThresholdCacheKey;
  readonly value: ThresholdResult;
}

interface OnDiskThresholdEntry {
  readonly key: ThresholdCacheKey;
  readonly value: { t1: number | string; t2: number | string };
}

function serialiseThreshold(v: number): number | string {
  // JSON can't natively round-trip Infinity. Encode as a sentinel string.
  if (v === Number.POSITIVE_INFINITY) return '+inf';
  return v;
}

function deserialiseThreshold(v: number | string): number {
  if (v === '+inf') return Number.POSITIVE_INFINITY;
  if (typeof v === 'number') return v;
  return Number.NaN;
}

/**
 * Read a threshold cache entry if present and within TTL. Returns
 * `undefined` on miss.
 */
export function readThresholdCache(
  key: ThresholdCacheKey,
  options: ThresholdCacheOptions,
): ThresholdResult | undefined {
  const path = thresholdEntryPath(options.root, key);
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return undefined;
  }
  const now = options.now ?? Date.now();
  if (now - mtimeMs > options.ttlDays * MS_PER_DAY) return undefined;
  let parsed: OnDiskThresholdEntry;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as OnDiskThresholdEntry;
  } catch {
    return undefined;
  }
  return {
    t1: deserialiseThreshold(parsed.value.t1),
    t2: deserialiseThreshold(parsed.value.t2),
  };
}

/**
 * Write a threshold cache entry. Creates the parent directory; overwrites
 * any existing entry at the same hash (same key → same file → same
 * value if the calc is deterministic).
 */
export function writeThresholdCache(
  entry: ThresholdCacheEntry,
  options: Pick<ThresholdCacheOptions, 'root'>,
): void {
  const path = thresholdEntryPath(options.root, entry.key);
  mkdirSync(dirname(path), { recursive: true });
  const payload: OnDiskThresholdEntry = {
    key: entry.key,
    value: {
      t1: serialiseThreshold(entry.value.t1),
      t2: serialiseThreshold(entry.value.t2),
    },
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
}
