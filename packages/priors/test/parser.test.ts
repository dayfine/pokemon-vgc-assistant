import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UnknownFormatError,
  parsePikalyticsMarkdown,
  pikalyticsSlug,
  pikalyticsUrl,
} from '../src/index.js';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'pikalytics');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('parsePikalyticsMarkdown — Reg M-A fixtures', () => {
  it('parses Incineroar response into structured priors', () => {
    const md = readFixture('championspreview-incineroar.md');
    const parsed = parsePikalyticsMarkdown(md);
    expect({
      species: parsed.species,
      format: parsed.format,
      dataDate: parsed.dataDate,
      itemCount: parsed.items.length,
      abilityCount: parsed.abilities.length,
      moveCount: parsed.moves.length,
      topItem: parsed.items[0],
      topAbility: parsed.abilities[0],
      topMove: parsed.moves[0],
    }).toMatchInlineSnapshot(`
      {
        "abilityCount": 6,
        "dataDate": "2026-03",
        "format": "Pokemon Champions VGC 2026 (\`championspreview\`)",
        "itemCount": 10,
        "moveCount": 10,
        "species": "Incineroar",
        "topAbility": {
          "name": "Intimidate",
          "percent": 60.647,
        },
        "topItem": {
          "name": "Sitrus Berry",
          "percent": 8.305,
        },
        "topMove": {
          "name": "Fake Out",
          "percent": 41.092,
        },
      }
    `);
  });

  it('parses Whimsicott response', () => {
    const md = readFixture('championspreview-whimsicott.md');
    const parsed = parsePikalyticsMarkdown(md);
    expect(parsed.species).toBe('Whimsicott');
    expect(parsed.items[0]).toEqual({ name: 'Focus Sash', percent: 7.647 });
    expect(parsed.moves[0]).toEqual({ name: 'Tailwind', percent: 45.319 });
  });

  it('parses Sneasler response', () => {
    const md = readFixture('championspreview-sneasler.md');
    const parsed = parsePikalyticsMarkdown(md);
    expect(parsed.species).toBe('Sneasler');
    expect(parsed.items[0]).toEqual({ name: 'White Herb', percent: 13.624 });
  });

  it('parses Archaludon response', () => {
    const md = readFixture('championspreview-archaludon.md');
    const parsed = parsePikalyticsMarkdown(md);
    expect(parsed.species).toBe('Archaludon');
    expect(parsed.abilities[0]).toEqual({ name: 'Stamina', percent: 46.943 });
    expect(parsed.moves[0]).toEqual({ name: 'Electro Shot', percent: 37.566 });
  });

  it('parses Garchomp response', () => {
    const md = readFixture('championspreview-garchomp.md');
    const parsed = parsePikalyticsMarkdown(md);
    expect(parsed.species).toBe('Garchomp');
    expect(parsed.items[0]).toEqual({ name: 'Life Orb', percent: 16.062 });
  });

  it('returns empty section arrays for absent sections (parser does not throw)', () => {
    const minimal = '# UnknownMon - Stub\n## Quick Info\n| **Format** | x |\n';
    const parsed = parsePikalyticsMarkdown(minimal);
    expect(parsed.items).toEqual([]);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.moves).toEqual([]);
    expect(parsed.species).toBe('UnknownMon');
  });
});

describe('Format-ID translation', () => {
  it('roundtrips championspreview / championstournaments via the public API', () => {
    expect(pikalyticsSlug('gen9championsvgc2026regma', 'closed')).toBe('championspreview');
    expect(pikalyticsSlug('gen9championsvgc2026regma', 'open')).toBe('championstournaments');
  });

  it('builds AI-endpoint URL using the slug for the active sheetMode', () => {
    expect(pikalyticsUrl('gen9championsvgc2026regma', 'closed', 'Incineroar')).toBe(
      'https://www.pikalytics.com/ai/pokedex/championspreview/Incineroar',
    );
    expect(pikalyticsUrl('gen9championsvgc2026regma', 'open', 'Calyrex-Shadow')).toBe(
      'https://www.pikalytics.com/ai/pokedex/championstournaments/Calyrex-Shadow',
    );
  });

  it('throws UnknownFormatError on unknown format', () => {
    expect(() => pikalyticsSlug('gen9vgc9999regz', 'closed')).toThrow(UnknownFormatError);
  });
});
