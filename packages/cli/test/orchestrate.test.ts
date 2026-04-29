import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VisionImage } from '@pva/vision';
import { describe, expect, it } from 'vitest';
import { OppKitMissingError, orchestrate, parseTeam } from '../src/index.js';

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

describe('orchestrate — closed-sheet not yet supported', () => {
  it('rejects closed-sheet input with a clear error pointing at M6.0b', async () => {
    const myTeam = parseTeam(TEAM_TXT).teamSet;
    const closedResp = JSON.stringify({
      sheetMode: 'closed',
      myTeam: [],
      oppTeam: [{ species: 'Volcarona' }],
      confidence: 'high',
    });
    await expect(
      orchestrate({
        myTeam,
        oppImage: STUB_IMAGE,
        format: 'gen9championsvgc2026regma',
        sheetMode: 'closed',
        mockVisionResponse: closedResp,
      }),
    ).rejects.toBeInstanceOf(OppKitMissingError);
  });
});
