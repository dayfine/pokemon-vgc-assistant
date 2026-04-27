import { describe, expect, it } from 'vitest';
import {
  Field,
  Pokemon as PokemonClass,
  type ScoreWeights,
  getGeneration,
  matrix,
  score,
  speedTiers,
} from '../src/index.js';
import type { MatchupMatrix } from '../src/matrix.js';
import type { SpeedRanking } from '../src/speed.js';
import type { Matchup, Move, Pokemon, TeamSet } from '../src/types.js';

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
    const calyShadow = new PokemonClass(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Choice Specs',
      ability: 'As One (Spectrier)',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Astral Barrage', 'Psychic'],
    });
    const ironHands = new PokemonClass(gen, 'Iron Hands', {
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

// Synthetic-matrix tests below pin guard semantics that the integration
// scenarios in `bp.test.ts` exercise indirectly. Stubbing the matrix gives
// precise control over `koChance` / `notation` and over team membership
// without depending on real calc rolls.
function stubMon(name: string, moves: readonly string[] = []): Pokemon {
  return { name, moves } as unknown as Pokemon;
}

function stubMatchup(
  category: 'Physical' | 'Special' | 'Status',
  koChance: number | undefined,
  notation: string,
): Matchup {
  return {
    attacker: {} as unknown as Pokemon,
    defender: {} as unknown as Pokemon,
    move: { category } as unknown as Move,
    damage: { min: 0, max: 0, koChance, notation },
  };
}

function stubMatrix(
  myTeam: TeamSet,
  oppTeam: TeamSet,
  myCells: ReadonlyArray<ReadonlyArray<readonly Matchup[]>>,
  oppCells: ReadonlyArray<ReadonlyArray<readonly Matchup[]>>,
): MatchupMatrix {
  return {
    my: { attackers: myTeam, defenders: oppTeam, cells: myCells },
    opp: { attackers: oppTeam, defenders: myTeam, cells: oppCells },
  };
}

const EMPTY_SPEED: SpeedRanking = { entries: [], trickRoom: false };

const OHKO_MOVE = stubMatchup('Physical', 1, '100% — guaranteed OHKO');
// Multi-hit edge case: notation says 2HKO but koChance is 1. The guard must
// reject this — `hasGuaranteedOhko` requires both signals to agree.
const TWO_HKO_KOCHANCE_ONE = stubMatchup('Physical', 1, '50 - 60% — guaranteed 2HKO');
const NO_KO_MOVE = stubMatchup('Physical', 0, '20 - 25% — possible 4HKO');

describe('score — guard semantics', () => {
  it('does not classify 2HKO as OHKO when koChance happens to be 1', () => {
    const a = stubMon('A', ['Move']);
    const x = stubMon('X');
    const m = stubMatrix([a], [x], [[[TWO_HKO_KOCHANCE_ONE]]], [[[NO_KO_MOVE]]]);
    const s = score([a], [x], m, EMPTY_SPEED, TEST_WEIGHTS);
    // notation says 2HKO → does not count toward `pickedKoOpp` even though
    // koChance is 1. This is the multi-hit guard from `hasGuaranteedOhko`.
    expect(s.breakdown.pickedKoOpp).toBe(0);
    // The same guard governs survivesAllMoves: A is *not* OHKO'd by X
    // (notation is 2HKO), so X counts as walled.
    expect(s.breakdown.pickedSurvivesOpp).toBe(1);
  });

  it('dedups pickedKoOpp: two answers to the same opp count once', () => {
    const a = stubMon('A', ['Move']);
    const b = stubMon('B', ['Move']);
    const x = stubMon('X');
    // Both A and B OHKO X; X must count exactly once toward pickedKoOpp.
    const m = stubMatrix(
      [a, b],
      [x],
      [[[OHKO_MOVE]], [[OHKO_MOVE]]],
      [[[NO_KO_MOVE], [NO_KO_MOVE]]],
    );
    const s = score([a, b], [x], m, EMPTY_SPEED, TEST_WEIGHTS);
    expect(s.breakdown.pickedKoOpp).toBe(1);
  });

  it('dedups oppKoPicked: two opp threats KOing the same pick count once', () => {
    const a = stubMon('A', ['Move']);
    const y = stubMon('Y', ['Move']);
    const z = stubMon('Z', ['Move']);
    // Both Y and Z OHKO A; A must count exactly once toward oppKoPicked.
    const m = stubMatrix(
      [a],
      [y, z],
      [[[NO_KO_MOVE], [NO_KO_MOVE]]],
      [[[OHKO_MOVE]], [[OHKO_MOVE]]],
    );
    const s = score([a], [y, z], m, EMPTY_SPEED, TEST_WEIGHTS);
    expect(s.breakdown.oppKoPicked).toBe(1);
  });

  it('dedups pickedSurvivesOpp: two walls of the same opp count once', () => {
    const a = stubMon('A', ['Move']);
    const b = stubMon('B', ['Move']);
    const x = stubMon('X', ['Move']);
    // X cannot OHKO A or B; X must count exactly once toward pickedSurvivesOpp.
    const m = stubMatrix(
      [a, b],
      [x],
      [[[NO_KO_MOVE]], [[NO_KO_MOVE]]],
      [[[NO_KO_MOVE], [NO_KO_MOVE]]],
    );
    const s = score([a, b], [x], m, EMPTY_SPEED, TEST_WEIGHTS);
    expect(s.breakdown.pickedSurvivesOpp).toBe(1);
  });
});
