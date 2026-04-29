import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PikalyticsSpeciesData } from '@pva/priors';
import type { VisionImage } from '@pva/vision';
import { describe, expect, it } from 'vitest';
import { type PriorsClient, orchestrate, parseTeam } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEAM_TXT = readFileSync(join(HERE, 'fixtures', 'charx-experiment.txt'), 'utf8');

const STUB_IMAGE: VisionImage = {
  bytes: Buffer.from('mock client never reads this'),
  mediaType: 'image/jpeg',
};

const OPEN_VISION_RESPONSE = JSON.stringify({
  sheetMode: 'open',
  myTeam: [
    // Vision returns my-team too, but the orchestrator uses the
    // typed-team for `myTeam` so this is informational.
    {
      species: 'Charizard',
      item: 'Charizardite X',
      ability: 'Blaze',
      moves: ['Protect', 'Dragon Dance', 'Dragon Claw', 'Flare Blitz'],
    },
  ],
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
});

const RECOMMENDER_RESPONSE = JSON.stringify({
  bring: ['Charizard', 'Tyranitar', 'Sinistcha', 'Sneasler'],
  lead: ['Sinistcha', 'Charizard'],
  back: ['Tyranitar', 'Sneasler'],
  primaryWinCondition:
    'Set up Mega Charizard-X with Dragon Dance behind Sinistcha Rage Powder; sweep with +1 Flare Blitz / Dragon Claw.',
  keyOppThreats: [
    {
      opp: 'Salamence',
      why: 'Mega Salamence Hyper Voice spread-blocks our lead pair if not pressured early.',
    },
    {
      opp: 'Annihilape',
      why: 'Defiant + Choice Scarf revenge-kills weakened sweepers; do not drop Intimidate into it.',
    },
    {
      opp: 'Indeedee-F',
      why: 'Follow Me eats setup turns; KO it before the second DD.',
    },
  ],
  leadScenarios: [
    {
      ifOppLeads: ['Indeedee-F', 'Volcarona'],
      weLead: ['Sinistcha', 'Charizard'],
      turn1Play: 'Rage Powder + Dragon Dance',
      turn2Play: 'Strength Sap + Flare Blitz on Volcarona',
      turn3Play: 'Sleep Sneasler in for Coaching → +1 Charizard sweep',
    },
    {
      ifOppLeads: ['Salamence', 'Indeedee-F'],
      weLead: ['Tyranitar', 'Sneasler'],
      turn1Play: 'Rock Slide spread + Coaching on Tyranitar',
      turn2Play: 'Stone Edge Salamence; Sneasler Close Combat Indeedee-F',
    },
  ],
  deviatesFromScoreBaseline: false,
  confidence: 'high',
  rationale:
    'Char-X + Sinistcha is the deterministic top-1 and the matchup matrix supports it: +1 Flare Blitz OHKOs Volcarona / Hatterene / Indeedee-F, and Sinistcha Rage Powder absorbs the Follow Me redirect target swap. Tyranitar second-pair handles Salamence with Rock Slide + Sand Stream chip; Sneasler Coaching extends the sweep window into back-half.',
});

describe('orchestrate — open-sheet end-to-end', () => {
  it('runs the full pipeline against mocked vision + mocked recommender', async () => {
    const myTeam = parseTeam(TEAM_TXT).teamSet;
    const result = await orchestrate({
      myTeam,
      oppImage: STUB_IMAGE,
      format: 'gen9championsvgc2026regma',
      sheetMode: 'open',
      mockVisionResponse: OPEN_VISION_RESPONSE,
      mockRecommenderResponse: RECOMMENDER_RESPONSE,
    });
    expect(result.recommendation.bring).toHaveLength(4);
    expect(result.oppTeam).toHaveLength(6);
    expect(result.scoreBaseline.picks.length).toBeGreaterThan(0);
    // Engine actually computed a non-empty matrix.
    expect(result.matchupMatrix.my.cells.length).toBe(6);
    expect(result.matchupMatrix.opp.cells.length).toBe(6);
    // Speed ranking covers all 12 mons (6 + 6).
    expect(result.speedRanking.entries.length).toBe(12);
  });

  it('preserves `notes` plumbing through to the recommender call', async () => {
    const myTeam = parseTeam(TEAM_TXT).teamSet;
    // Notes pass through opaquely; assertion is just that the call
    // succeeds with a notes array (the recommender mock-response path
    // already validated the parser accepts the optional field).
    const result = await orchestrate({
      myTeam,
      oppImage: STUB_IMAGE,
      format: 'gen9championsvgc2026regma',
      sheetMode: 'open',
      notes: ['Game 1 — opp Volcarona had Quiver Dance.'],
      mockVisionResponse: OPEN_VISION_RESPONSE,
      mockRecommenderResponse: RECOMMENDER_RESPONSE,
    });
    expect(result.recommendation.bring).toHaveLength(4);
  });
});

/**
 * Synthetic per-species priors data. Real Pikalytics fixtures live in
 * `packages/priors/test/fixtures/pikalytics/` — for orchestrator
 * smoke-tests we hand-build minimal valid shapes per species so the
 * orchestrator unit test stays offline and doesn't pull priors fixtures
 * cross-package.
 */
function stubSpeciesData(species: string): PikalyticsSpeciesData {
  // Each opp gets a single dominant item + ability + four moves at
  // realistic-looking percentages. Item percent must be ≥ priors'
  // 5% inclusion floor for `expand` to keep the candidate.
  const base: Record<string, { item: string; ability: string; moves: readonly string[] }> = {
    Volcarona: {
      item: 'Power Herb',
      ability: 'Flame Body',
      moves: ['Quiver Dance', 'Heat Wave', 'Bug Buzz', 'Protect'],
    },
    Garchomp: {
      item: 'Life Orb',
      ability: 'Rough Skin',
      moves: ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Protect'],
    },
    'Indeedee-F': {
      item: 'Psychic Seed',
      ability: 'Psychic Surge',
      moves: ['Follow Me', 'Expanding Force', 'Dazzling Gleam', 'Helping Hand'],
    },
    Salamence: {
      item: 'Salamencite',
      ability: 'Intimidate',
      moves: ['Hyper Voice', 'Dragon Claw', 'Earthquake', 'Protect'],
    },
    Hatterene: {
      item: 'Mental Herb',
      ability: 'Magic Bounce',
      moves: ['Trick Room', 'Dazzling Gleam', 'Psyshock', 'Protect'],
    },
    Annihilape: {
      item: 'Choice Scarf',
      ability: 'Defiant',
      moves: ['Rage Fist', 'Close Combat', 'Final Gambit', 'U-turn'],
    },
  };
  const kit = base[species];
  if (kit === undefined) {
    throw new Error(`No stub priors data for ${species}`);
  }
  return {
    species,
    format: 'gen9championsvgc2026regma',
    dataDate: '2026-04-01',
    items: [{ name: kit.item, percent: 80 }],
    abilities: [{ name: kit.ability, percent: 95 }],
    moves: kit.moves.map((m) => ({ name: m, percent: 80 })),
  };
}

const stubPriorsClient: PriorsClient = {
  async fetchSpecies(species) {
    return stubSpeciesData(species);
  },
};

describe('orchestrate — closed-sheet end-to-end', () => {
  const CLOSED_VISION_RESPONSE = JSON.stringify({
    sheetMode: 'closed',
    myTeam: [],
    oppTeam: [
      { species: 'Volcarona' },
      { species: 'Indeedee-F' },
      { species: 'Garchomp' },
      { species: 'Salamence' },
      { species: 'Hatterene' },
      { species: 'Annihilape' },
    ],
    confidence: 'high',
  });

  it('runs the closed-sheet pipeline through priors expansion', async () => {
    const myTeam = parseTeam(TEAM_TXT).teamSet;
    const result = await orchestrate({
      myTeam,
      oppImage: STUB_IMAGE,
      format: 'gen9championsvgc2026regma',
      sheetMode: 'closed',
      mockVisionResponse: CLOSED_VISION_RESPONSE,
      mockRecommenderResponse: RECOMMENDER_RESPONSE,
      priorsClient: stubPriorsClient,
    });
    expect(result.recommendation.bring).toHaveLength(4);
    expect(result.oppTeam).toHaveLength(6);
    // Each opp slot's representative comes from priors expansion —
    // not from the vision response (which only carries species).
    const oppNames = result.oppTeam.map((p) => p.name);
    expect(oppNames).toEqual([
      'Volcarona',
      'Indeedee-F',
      'Garchomp',
      'Salamence',
      'Hatterene',
      'Annihilape',
    ]);
    expect(result.matchupMatrix.my.cells.length).toBe(6);
    expect(result.matchupMatrix.opp.cells.length).toBe(6);
    expect(result.speedRanking.entries.length).toBe(12);
  });
});
