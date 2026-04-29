import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type VisionImage, extract } from '../src/index.js';

/**
 * Live opt-in test — only runs when `RUN_LIVE_TESTS=1` is set in the
 * environment. Mirrors the recommender package's `live.test.ts`
 * pattern: skipped in CI by default; useful as a smoke test against
 * the real Vision API before shipping a release.
 *
 * Requires `ANTHROPIC_API_KEY` in the environment. Costs roughly one
 * Claude Sonnet vision call per run (a few cents).
 */
const RUN_LIVE = process.env.RUN_LIVE_TESTS === '1';
const describeIfLive = RUN_LIVE ? describe : describe.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  HERE,
  '..',
  '..',
  '..',
  'data',
  'fixtures',
  'champions-team-preview-zh-tw-2026-04-28-001.jpg',
);

describeIfLive('live vision API — zh-TW open-sheet fixture', () => {
  it('extracts both teams from the Tabuyo Charizard X experiment fixture', async () => {
    const bytes = readFileSync(FIXTURE_PATH);
    const image: VisionImage = { bytes, mediaType: 'image/jpeg' };
    const result = await extract(image, {
      sheetMode: 'open',
      format: 'gen9championsvgc2026regma',
    });
    // Inspection-friendly assertions — the live model may differ on
    // edge cases but should produce a structurally valid extraction
    // with the canonical species names from the fixture.
    expect(result.myTeam.length).toBeGreaterThanOrEqual(1);
    expect(result.oppTeam.length).toBeGreaterThanOrEqual(1);
    expect(result.confidence).toMatch(/^(high|medium)$/);
    // Spot-check at least one of the my-side species (the user's team
    // in this fixture is Charizard X / Tyranitar / Milotic / Incineroar /
    // Sinistcha / Sneasler).
    const mySpecies = new Set(result.myTeam.map((m) => m.species));
    const expectedAtLeastOne = [
      'Charizard',
      'Tyranitar',
      'Milotic',
      'Incineroar',
      'Sinistcha',
      'Sneasler',
    ];
    const hit = expectedAtLeastOne.some((s) => mySpecies.has(s));
    expect(hit, `none of ${expectedAtLeastOne.join(', ')} in extracted myTeam`).toBe(true);
  });
});
