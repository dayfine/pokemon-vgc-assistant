import { mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCache, writeCache } from '../src/index.js';
import type { CacheEntry } from '../src/index.js';

const SAMPLE: CacheEntry = {
  raw: '# Stub\n',
  parsed: {
    species: 'Stub',
    format: 'gen9championsvgc2026regma',
    dataDate: '2026-03',
    items: [],
    abilities: [],
    moves: [],
  },
};

describe('cache: read/write under tmpdir', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pva-priors-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('round-trips an entry through write+read', () => {
    writeCache('gen9championsvgc2026regma', 'pikalytics', 'Stub', SAMPLE, { root });
    const entry = readCache('gen9championsvgc2026regma', 'pikalytics', 'Stub', {
      root,
      ttlDays: 7,
    });
    expect(entry).toBeDefined();
    expect(entry?.parsed).toEqual(SAMPLE.parsed);
    expect(entry?.raw).toBe(SAMPLE.raw);
  });

  it('returns undefined when entry is missing', () => {
    const entry = readCache('gen9championsvgc2026regma', 'pikalytics', 'Missing', {
      root,
      ttlDays: 7,
    });
    expect(entry).toBeUndefined();
  });

  it('reports stale when mtime exceeds ttlDays', () => {
    writeCache('gen9championsvgc2026regma', 'pikalytics', 'Stub', SAMPLE, { root });
    // Backdate the JSON file's mtime by 30 days. The cache reads the JSON's
    // mtime, so this is the load-bearing target.
    const jsonPath = join(root, 'gen9championsvgc2026regma', 'pikalytics', 'Stub.json');
    const old = (Date.now() - 30 * 86_400_000) / 1000;
    utimesSync(jsonPath, old, old);
    const entry = readCache('gen9championsvgc2026regma', 'pikalytics', 'Stub', {
      root,
      ttlDays: 7,
    });
    expect(entry).toBeUndefined();
  });

  it('honours injected `now` for deterministic TTL checks', () => {
    writeCache('gen9championsvgc2026regma', 'pikalytics', 'Stub', SAMPLE, { root });
    const future = Date.now() + 100 * 86_400_000;
    const entry = readCache('gen9championsvgc2026regma', 'pikalytics', 'Stub', {
      root,
      ttlDays: 7,
      now: future,
    });
    expect(entry).toBeUndefined();
  });
});
