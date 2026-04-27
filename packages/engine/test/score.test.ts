import { describe, expect, it } from 'vitest';
import {
  Field,
  Pokemon,
  type ScoreWeights,
  getGeneration,
  matrix,
  score,
  speedTiers,
} from '../src/index.js';

const gen = getGeneration();

// Doubles is the VGC default; pin it explicitly so spread-move halving
// behaves correctly in calc.
const DOUBLES = new Field({ gameType: 'Doubles' });

// Test weights are intentionally simple integers — they make breakdown
// arithmetic easy to verify by hand. Behavioral assertions below only
// rely on the *sign* of the differences (one bring outscores another),
// not the absolute totals.
const TEST_WEIGHTS: ScoreWeights = {
  ohkoThreats: 3,
  speedControl: 2,
  defensiveAnswers: 2,
  ohkoTaken: 3,
  roleGap: 3,
};

describe('score — breakdown wiring', () => {
  it('reports breakdown counts that match the constructed scenario', () => {
    // Tiny scenario: one pick (Calyrex-Shadow with Specs) vs. one opp
    // (Iron Hands w/ no item, Adamant). Calyrex 1HKOs Iron Hands with
    // Astral Barrage; Iron Hands cannot 1HKO Calyrex back.
    const calyShadow = new Pokemon(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Choice Specs',
      ability: 'As One (Spectrier)',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Astral Barrage', 'Psychic'],
    });
    const ironHands = new Pokemon(gen, 'Iron Hands', {
      level: 50,
      ability: 'Quark Drive',
      nature: 'Adamant',
      evs: { hp: 252, atk: 252 },
      moves: ['Drain Punch', 'Wild Charge'],
    });

    const myTeam = [calyShadow] as const;
    const oppTeam = [ironHands] as const;
    const m = matrix(gen, myTeam, oppTeam, { field: DOUBLES });
    const sp = speedTiers([
      { pokemon: calyShadow, side: 'my' },
      { pokemon: ironHands, side: 'opp' },
    ]);
    const s = score(myTeam, oppTeam, m, sp, TEST_WEIGHTS);

    // Calyrex 1HKOs Iron Hands with Astral Barrage → pickedKoOpp = 1.
    expect(s.breakdown.pickedKoOpp).toBe(1);
    // Iron Hands does not 1HKO Calyrex with either move → oppKoPicked = 0.
    expect(s.breakdown.oppKoPicked).toBe(0);
    // Calyrex outspeeds Iron Hands at base → pickedOutspeedOpp = 1.
    expect(s.breakdown.pickedOutspeedOpp).toBe(1);
    // Calyrex survives Iron Hands' best move (no OHKO from Hands here).
    expect(s.breakdown.pickedSurvivesOpp).toBe(1);
    // Bring has only Calyrex (special attacker, no speed control move,
    // no physical move) → physicalAttacker + speedControl unfilled.
    expect(s.breakdown.unfilledRoles).toBe(2);
  });
});
