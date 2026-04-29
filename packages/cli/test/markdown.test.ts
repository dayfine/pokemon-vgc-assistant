import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VisionImage } from '@pva/vision';
import { describe, expect, it } from 'vitest';
import { type OrchestrateResult, orchestrate, parseTeam, renderMarkdown } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEAM_TXT = readFileSync(join(HERE, 'fixtures', 'charx-experiment.txt'), 'utf8');

const STUB_IMAGE: VisionImage = {
  bytes: Buffer.from('mock'),
  mediaType: 'image/jpeg',
};

const VISION_RESPONSE = JSON.stringify({
  sheetMode: 'open',
  myTeam: [],
  oppTeam: [
    {
      species: 'Volcarona',
      item: 'Power Herb',
      ability: 'Flame Body',
      moves: ['Quiver Dance', 'Heat Wave', 'Bug Buzz', 'Protect'],
    },
    {
      species: 'Indeedee-F',
      item: 'Psychic Seed',
      ability: 'Psychic Surge',
      moves: ['Follow Me', 'Expanding Force', 'Dazzling Gleam', 'Helping Hand'],
    },
    {
      species: 'Garchomp',
      item: 'Life Orb',
      ability: 'Rough Skin',
      moves: ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Protect'],
    },
    {
      species: 'Salamence',
      item: 'Salamencite',
      ability: 'Aerilate',
      moves: ['Hyper Voice', 'Dragon Claw', 'Earthquake', 'Protect'],
    },
    {
      species: 'Hatterene',
      item: 'Mental Herb',
      ability: 'Magic Bounce',
      moves: ['Trick Room', 'Dazzling Gleam', 'Psyshock', 'Protect'],
    },
    {
      species: 'Annihilape',
      item: 'Choice Scarf',
      ability: 'Defiant',
      moves: ['Rage Fist', 'Close Combat', 'Final Gambit', 'U-turn'],
    },
  ],
  confidence: 'high',
  notes: 'Third opp slot was occluded; Garchomp is best guess based on type icons.',
});

const RECOMMENDER_RESPONSE = JSON.stringify({
  bring: ['Charizard', 'Tyranitar', 'Sinistcha', 'Sneasler'],
  lead: ['Sinistcha', 'Charizard'],
  back: ['Tyranitar', 'Sneasler'],
  primaryWinCondition: 'Char-X DD sweep behind Sinistcha redirection.',
  keyOppThreats: [
    { opp: 'Salamence', why: 'Mega Hyper Voice spreads.' },
    { opp: 'Annihilape', why: 'Defiant scarf revenge.' },
  ],
  leadScenarios: [
    {
      ifOppLeads: ['Indeedee-F', 'Volcarona'],
      weLead: ['Sinistcha', 'Charizard'],
      turn1Play: 'Rage Powder + Dragon Dance',
      turn2Play: 'Strength Sap + Flare Blitz on Volcarona',
    },
  ],
  deviatesFromScoreBaseline: false,
  confidence: 'high',
  rationale: 'Char-X DD is the deterministic top-1 and the matrix supports it.',
});

async function buildResult(): Promise<OrchestrateResult> {
  const myTeam = parseTeam(TEAM_TXT).teamSet;
  return orchestrate({
    myTeam,
    oppImage: STUB_IMAGE,
    format: 'gen9championsvgc2026regma',
    sheetMode: 'open',
    mockVisionResponse: VISION_RESPONSE,
    mockRecommenderResponse: RECOMMENDER_RESPONSE,
  });
}

describe('renderMarkdown', () => {
  it('produces every required section in stable order', async () => {
    const md = renderMarkdown(await buildResult());
    const expected = [
      '# pva recommendation',
      '## Bring',
      '## Win condition',
      '## Key opp threats',
      '## Lead scenarios',
      '## Confidence: high',
      '## Rationale',
      '## Deterministic-score baseline',
    ];
    let cursor = 0;
    for (const heading of expected) {
      const idx = md.indexOf(heading, cursor);
      expect(idx, `section "${heading}" missing or out of order`).toBeGreaterThanOrEqual(cursor);
      cursor = idx + heading.length;
    }
  });

  it('lists the picked Bring as a bold name slash-separated', async () => {
    const md = renderMarkdown(await buildResult());
    expect(md).toContain('**Charizard / Tyranitar / Sinistcha / Sneasler**');
    expect(md).toContain('Lead: Sinistcha + Charizard → Back: Tyranitar + Sneasler');
  });

  it('surfaces vision notes in the header', async () => {
    const md = renderMarkdown(await buildResult());
    expect(md).toContain('**Vision notes**: Third opp slot was occluded');
  });

  it('describes alignment with the deterministic top when not deviating', async () => {
    const md = renderMarkdown(await buildResult());
    expect(md).toContain('Aligned with deterministic top-1.');
  });

  it('renders deviationRationale when the recommendation deviates', async () => {
    const myTeam = parseTeam(TEAM_TXT).teamSet;
    const deviating = JSON.parse(RECOMMENDER_RESPONSE);
    deviating.deviatesFromScoreBaseline = true;
    deviating.deviationRationale =
      'Top-1 was Char-X / Sneasler / Tyranitar / Incineroar; swapped Incineroar → Sinistcha to neutralize Indeedee-F redirection.';
    const result = await orchestrate({
      myTeam,
      oppImage: STUB_IMAGE,
      format: 'gen9championsvgc2026regma',
      sheetMode: 'open',
      mockVisionResponse: VISION_RESPONSE,
      mockRecommenderResponse: JSON.stringify(deviating),
    });
    const md = renderMarkdown(result);
    expect(md).toContain('Deviates from deterministic top-1');
    expect(md).toContain('neutralize Indeedee-F redirection');
  });
});
