/**
 * Tests for the M4.5 threshold cache.
 *
 * Same shape as `cache.test.ts` (tmpdir + mtime + injected `now`), plus
 * threshold-specific concerns:
 *   - `+Inf` round-trips through JSON serialisation.
 *   - Move-name normalisation (case/whitespace) yields the same key.
 *   - Move-order independence in `kitFingerprint` — rearranging the 4
 *     moves doesn't change the cache key.
 *   - Field fingerprint defaults to a stable token when input is omitted.
 */

import { mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fieldFingerprint,
  kitFingerprint,
  readThresholdCache,
  writeThresholdCache,
} from '../src/index.js';
import type { ThresholdCacheKey } from '../src/index.js';

const SAMPLE_KEY: ThresholdCacheKey = {
  format: 'gen9championsvgc2026regma',
  attacker: {
    species: 'Garchomp',
    item: 'Choice Band',
    ability: 'Rough Skin',
    moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'],
  },
  defender: {
    species: 'Incineroar',
    item: 'Sitrus Berry',
    ability: 'Intimidate',
    moves: ['Fake Out', 'Parting Shot', 'Flare Blitz', 'Knock Off'],
  },
  move: 'Earthquake',
  field: { gameType: 'Doubles' },
};

describe('threshold cache: read/write under tmpdir', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pva-priors-thresh-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('round-trips a finite-valued threshold', () => {
    writeThresholdCache({ key: SAMPLE_KEY, value: { t1: 137, t2: 105 } }, { root });
    const v = readThresholdCache(SAMPLE_KEY, { root, ttlDays: 30 });
    expect(v).toEqual({ t1: 137, t2: 105 });
  });

  it('round-trips +Infinity as a sentinel string under the hood', () => {
    writeThresholdCache(
      {
        key: SAMPLE_KEY,
        value: { t1: Number.POSITIVE_INFINITY, t2: Number.POSITIVE_INFINITY },
      },
      { root },
    );
    const v = readThresholdCache(SAMPLE_KEY, { root, ttlDays: 30 });
    expect(v?.t1).toBe(Number.POSITIVE_INFINITY);
    expect(v?.t2).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns undefined on cache miss', () => {
    const v = readThresholdCache(SAMPLE_KEY, { root, ttlDays: 30 });
    expect(v).toBeUndefined();
  });

  it('reports stale when mtime exceeds ttlDays', () => {
    writeThresholdCache({ key: SAMPLE_KEY, value: { t1: 137, t2: 105 } }, { root });
    // Backdate the entry — TTL of 30 days, fast-forward past it.
    // The threshold cache is in `<root>/<format>/thresholds/<sha>.json`.
    // We don't know the sha here without re-deriving it; the simplest
    // path is to inject `now` instead of touching mtime.
    const future = Date.now() + 60 * 86_400_000;
    const v = readThresholdCache(SAMPLE_KEY, { root, ttlDays: 30, now: future });
    expect(v).toBeUndefined();
  });

  it('honours `now` parameter for deterministic TTL checks', () => {
    writeThresholdCache({ key: SAMPLE_KEY, value: { t1: 100, t2: 80 } }, { root });
    const v = readThresholdCache(SAMPLE_KEY, { root, ttlDays: 30, now: Date.now() });
    expect(v).toEqual({ t1: 100, t2: 80 });
  });

  it('mtime-based staleness: utimes-backdated entry is not returned', () => {
    writeThresholdCache({ key: SAMPLE_KEY, value: { t1: 100, t2: 80 } }, { root });
    // Walk the cache dir to find the single .json — saves replicating
    // the sha derivation in the test.
    const dir = join(root, SAMPLE_KEY.format, 'thresholds');
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    const f = files[0];
    if (f === undefined) throw new Error('expected a cache file');
    const old = (Date.now() - 60 * 86_400_000) / 1000;
    utimesSync(join(dir, f), old, old);
    const v = readThresholdCache(SAMPLE_KEY, { root, ttlDays: 30 });
    expect(v).toBeUndefined();
  });
});

describe('kitFingerprint', () => {
  it('is independent of move order', () => {
    const a = kitFingerprint({
      species: 'Garchomp',
      item: 'Life Orb',
      ability: 'Rough Skin',
      moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'],
    });
    const b = kitFingerprint({
      species: 'Garchomp',
      item: 'Life Orb',
      ability: 'Rough Skin',
      moves: ['Protect', 'Rock Slide', 'Dragon Claw', 'Earthquake'],
    });
    expect(a).toBe(b);
  });

  it('changes when any of (species, item, ability, moves) changes', () => {
    const base = {
      species: 'Garchomp',
      item: 'Life Orb',
      ability: 'Rough Skin',
      moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'],
    } as const;
    const baseFp = kitFingerprint(base);
    expect(kitFingerprint({ ...base, species: 'Tyranitar' })).not.toBe(baseFp);
    expect(kitFingerprint({ ...base, item: 'Choice Band' })).not.toBe(baseFp);
    expect(kitFingerprint({ ...base, ability: 'Sand Veil' })).not.toBe(baseFp);
    expect(
      kitFingerprint({ ...base, moves: ['Earthquake', 'Outrage', 'Rock Slide', 'Protect'] }),
    ).not.toBe(baseFp);
  });
});

describe('fieldFingerprint', () => {
  it('returns a stable token when called with no input', () => {
    expect(fieldFingerprint()).toBe('default');
    expect(fieldFingerprint(undefined)).toBe('default');
  });

  it('is sensitive to weather/terrain', () => {
    const a = fieldFingerprint({ gameType: 'Doubles' });
    const b = fieldFingerprint({ gameType: 'Doubles', weather: 'Sun' });
    const c = fieldFingerprint({ gameType: 'Doubles', terrain: 'Electric' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it('is stable for the same inputs', () => {
    const a = fieldFingerprint({ gameType: 'Doubles', weather: 'Rain' });
    const b = fieldFingerprint({ gameType: 'Doubles', weather: 'Rain' });
    expect(a).toBe(b);
  });
});
