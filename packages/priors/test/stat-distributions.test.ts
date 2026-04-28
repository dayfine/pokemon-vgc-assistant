/**
 * Per-species stat-distribution invariants for M4.5.
 *
 * Acceptance:
 *   - ≥10 species hand-curated.
 *   - Each species' weights sum to exactly 1.0 within ±1e-9.
 *   - Each weight is in (0, 1] (no zero/negative entries — those should be
 *     omitted from the array, not encoded as zero).
 *   - Each entry's `bucket` is a legal `StatBucket` (TypeScript catches
 *     typos at compile time; this is a runtime echo for clarity).
 *   - The distribution table doesn't reference any banned-in-M-A species
 *     by name. We can't enumerate the M-A allow-list without `@pkmn/dex`'s
 *     gen9champions mod (per `engine/src/data.ts` TODO), so this test
 *     pins a small explicit deny-list of species we know to be banned.
 */

import { describe, expect, it } from 'vitest';
import { SPECIES_WITH_DISTRIBUTION, STAT_DISTRIBUTIONS } from '../src/stat-distributions.js';
import type { StatBucket } from '../src/types.js';

const LEGAL_BUCKETS: ReadonlySet<StatBucket> = new Set<StatBucket>([
  'bulky-physical',
  'bulky-special',
  'offensive-physical',
  'offensive-special',
  'speed-control',
]);

/**
 * Species explicitly banned in Reg M-A per
 * `dev/research/champions-2026-04-26.md`. This is a deny-list, not an
 * allow-list — once `@pkmn/dex` ships gen9champions, swap to a positive
 * legal-species check.
 */
const BANNED_IN_MA: ReadonlySet<string> = new Set([
  'Calyrex-Shadow',
  'Calyrex-Ice',
  'Miraidon',
  'Koraidon',
  'Iron Hands',
  'Iron Bundle',
  'Iron Valiant',
  'Flutter Mane',
  'Roaring Moon',
  'Chien-Pao',
  'Wo-Chien',
  'Ting-Lu',
  'Chi-Yu',
  'Urshifu',
  'Urshifu-Single-Strike',
  'Urshifu-Rapid-Strike',
]);

describe('stat-distributions: coverage + invariants', () => {
  it('covers ≥10 species (M4.5 acceptance criterion)', () => {
    expect(SPECIES_WITH_DISTRIBUTION.length).toBeGreaterThanOrEqual(10);
  });

  it.each(SPECIES_WITH_DISTRIBUTION)(
    'species "%s" — weights sum to 1.0 within ±1e-9',
    (species) => {
      const dist = STAT_DISTRIBUTIONS[species];
      expect(dist).toBeDefined();
      let total = 0;
      for (const e of dist ?? []) total += e.weight;
      expect(Math.abs(total - 1.0)).toBeLessThan(1e-9);
    },
  );

  it.each(SPECIES_WITH_DISTRIBUTION)('species "%s" — every weight is in (0, 1]', (species) => {
    const dist = STAT_DISTRIBUTIONS[species] ?? [];
    for (const e of dist) {
      expect(e.weight).toBeGreaterThan(0);
      expect(e.weight).toBeLessThanOrEqual(1);
    }
  });

  it.each(SPECIES_WITH_DISTRIBUTION)(
    'species "%s" — every bucket is a legal StatBucket',
    (species) => {
      const dist = STAT_DISTRIBUTIONS[species] ?? [];
      for (const e of dist) {
        expect(LEGAL_BUCKETS.has(e.bucket)).toBe(true);
      }
    },
  );

  it.each(SPECIES_WITH_DISTRIBUTION)('species "%s" — not banned in Reg M-A', (species) => {
    expect(BANNED_IN_MA.has(species)).toBe(false);
  });

  it('overlaps the M4-simple fixture species so M4 + M4.5 share coverage', () => {
    // The five M4-simple fixtures must all have a stat distribution; M4.5
    // would otherwise force a re-curation step every time we add a fixture.
    for (const species of ['Incineroar', 'Whimsicott', 'Sneasler', 'Archaludon', 'Garchomp']) {
      expect(STAT_DISTRIBUTIONS[species]).toBeDefined();
    }
  });

  it('format ID is not hardcoded in stat-distributions.ts', async () => {
    // Format-agnostic-by-construction lint. The table lists species names
    // that exist across formats; the M-A format ID should never appear.
    const fs = await import('node:fs');
    const path = new URL('../src/stat-distributions.ts', import.meta.url).pathname;
    const src = fs.readFileSync(path, 'utf8');
    expect(src).not.toContain('gen9championsvgc2026regma');
  });
});
