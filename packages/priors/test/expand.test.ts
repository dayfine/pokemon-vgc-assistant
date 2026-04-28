import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGeneration } from '@pva/engine';
import { describe, expect, it } from 'vitest';
import { expand, parsePikalyticsMarkdown } from '../src/index.js';
import type { KitCandidate } from '../src/index.js';
import { LEGAL_ABILITIES } from '../src/spreads.js';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'pikalytics');
const gen = getGeneration();

function loadFixture(name: string): ReturnType<typeof parsePikalyticsMarkdown> {
  const md = readFileSync(join(FIXTURES, `championspreview-${name}.md`), 'utf8');
  return parsePikalyticsMarkdown(md);
}

function toID(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function assertLegal(kit: KitCandidate): void {
  // Item: must be queryable in the active gen.
  expect(gen.items.get(toID(kit.item) as never), `item ${kit.item} legal`).toBeDefined();
  // Ability: must appear in our species allow-list (until @pkmn/dex ships
  // gen9champions, this is the legality fallback per spreads.ts).
  const legalAbilities = LEGAL_ABILITIES[kit.species];
  expect(legalAbilities, `species ${kit.species} has ability allow-list`).toBeDefined();
  expect(legalAbilities, `ability ${kit.ability} legal for ${kit.species}`).toContain(kit.ability);
  // Moves: each must be queryable in the active gen.
  for (const m of kit.moves) {
    expect(gen.moves.get(toID(m) as never), `move ${m} legal`).toBeDefined();
  }
  // Tera: M-A is no-Tera; the field must be undefined.
  expect(kit.tera).toBeUndefined();
}

describe('expand — closed sheet, Reg M-A fixtures', () => {
  it('Incineroar: weights sum to 1.0, all kits legal, top bucket carries ≥30% mass', () => {
    const data = loadFixture('incineroar');
    const kits = expand(gen, { sheetMode: 'closed', data });

    expect(kits.length).toBeGreaterThanOrEqual(1);
    let total = 0;
    for (const k of kits) {
      total += k.weight;
      assertLegal(k);
    }
    expect(Math.abs(total - 1.0)).toBeLessThan(1e-9);

    // Top bucket aggregate: group by bucket, find max sum.
    const byBucket = new Map<string, number>();
    for (const k of kits) byBucket.set(k.bucket, (byBucket.get(k.bucket) ?? 0) + k.weight);
    const topBucketWeight = Math.max(...byBucket.values());
    expect(topBucketWeight).toBeGreaterThanOrEqual(0.3);
  });

  it('Whimsicott: weights sum to 1.0, all kits legal, top bucket carries ≥30% mass', () => {
    const data = loadFixture('whimsicott');
    const kits = expand(gen, { sheetMode: 'closed', data });

    expect(kits.length).toBeGreaterThanOrEqual(1);
    let total = 0;
    for (const k of kits) {
      total += k.weight;
      assertLegal(k);
    }
    expect(Math.abs(total - 1.0)).toBeLessThan(1e-9);

    const byBucket = new Map<string, number>();
    for (const k of kits) byBucket.set(k.bucket, (byBucket.get(k.bucket) ?? 0) + k.weight);
    expect(Math.max(...byBucket.values())).toBeGreaterThanOrEqual(0.3);

    // Whimsicott's only ≥5% item is Focus Sash; expect a single Prankster set.
    expect(kits.length).toBe(1);
    expect(kits[0]?.item).toBe('Focus Sash');
    expect(kits[0]?.ability).toBe('Prankster');
  });

  it('Sneasler: weights sum to 1.0, all kits legal, top bucket carries ≥30% mass', () => {
    const data = loadFixture('sneasler');
    const kits = expand(gen, { sheetMode: 'closed', data });

    expect(kits.length).toBeGreaterThanOrEqual(2);
    let total = 0;
    for (const k of kits) {
      total += k.weight;
      assertLegal(k);
    }
    expect(Math.abs(total - 1.0)).toBeLessThan(1e-9);

    const byBucket = new Map<string, number>();
    for (const k of kits) byBucket.set(k.bucket, (byBucket.get(k.bucket) ?? 0) + k.weight);
    expect(Math.max(...byBucket.values())).toBeGreaterThanOrEqual(0.3);
  });

  it('Garchomp: top item Life Orb resolves to offensive-physical bucket', () => {
    const data = loadFixture('garchomp');
    const kits = expand(gen, { sheetMode: 'closed', data });

    const lifeOrb = kits.find((k) => k.item === 'Life Orb');
    expect(lifeOrb).toBeDefined();
    expect(lifeOrb?.bucket).toBe('offensive-physical');
    // Garchomp's Atk (130) >> SpA (80), so the offensive lean is physical.
    expect(lifeOrb?.nature).toBe('Adamant');
  });

  it('respects topItems option', () => {
    const data = loadFixture('sneasler');
    const k1 = expand(gen, { sheetMode: 'closed', data }, { topItems: 1 });
    const k3 = expand(gen, { sheetMode: 'closed', data }, { topItems: 3 });
    expect(k1.length).toBe(1);
    expect(k3.length).toBeGreaterThanOrEqual(k1.length);
    // k1's single weight must still normalise to 1.0.
    expect(k1[0]?.weight).toBe(1.0);
  });

  it('respects probabilityFloor option', () => {
    const data = loadFixture('incineroar');
    // Sitrus Berry sits at 8.305%; raising the floor above that drops it.
    const empty = expand(gen, { sheetMode: 'closed', data }, { probabilityFloor: 50 });
    expect(empty).toEqual([]);
  });
});

describe('expand — open sheet collapses to single known kit', () => {
  it('returns single-element KitCandidate[] with weight 1.0', () => {
    const kits = expand(gen, {
      sheetMode: 'open',
      species: 'Incineroar',
      knownKit: {
        item: 'Sitrus Berry',
        ability: 'Intimidate',
        moves: ['Fake Out', 'Parting Shot', 'Flare Blitz', 'Knock Off'],
      },
    });
    expect(kits.length).toBe(1);
    expect(kits[0]?.weight).toBe(1.0);
    expect(kits[0]?.item).toBe('Sitrus Berry');
    expect(kits[0]?.ability).toBe('Intimidate');
    expect(kits[0]?.moves).toEqual(['Fake Out', 'Parting Shot', 'Flare Blitz', 'Knock Off']);
    expect(kits[0]?.tera).toBeUndefined();
  });

  it('preserves Tera when supplied (forward-compatible with non-M-A formats)', () => {
    const kits = expand(gen, {
      sheetMode: 'open',
      species: 'Garchomp',
      knownKit: {
        item: 'Life Orb',
        ability: 'Rough Skin',
        moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'],
        tera: 'Steel',
      },
    });
    expect(kits[0]?.tera).toBe('Steel');
  });
});
