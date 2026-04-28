/**
 * Reconstructs the 2026-04-28 experiment's input bundle (teams, matrix,
 * speed ranking, score baseline). Tests in this package exercise the
 * recommender's prompt builder and JSON pipeline; building this bundle
 * is the cleanest way to drive the prompt builder against realistic
 * data.
 *
 * Test-only file. Production `src/*` does not import engine runtime.
 */

import {
  Field,
  type MatchupMatrix,
  Pokemon,
  type RankedPicks,
  type ScoreWeights,
  type SpeedRanking,
  type TeamSet,
  getGeneration,
  matrix,
  recommendBP,
  speedTiers,
} from '@pva/engine';

const gen = getGeneration();

/** Doubles field — VGC standard. */
export const DOUBLES = new Field({ gameType: 'Doubles' });

/**
 * Score weights — mirror the values `pva.config.ts` ships at M3 and the
 * experiment used. Hand-coded here because the test target is the
 * recommender, not the score weights.
 */
export const EXPERIMENT_WEIGHTS: ScoreWeights = {
  ohkoThreats: 3,
  speedControl: 2,
  defensiveAnswers: 2,
  ohkoTaken: 3,
  roleGap: 3,
};

export function buildMyTeam(): TeamSet {
  return [
    new Pokemon(gen, 'Charizard', {
      level: 50,
      item: 'Charizardite X',
      ability: 'Blaze',
      nature: 'Adamant',
      evs: { atk: 252, spe: 252, hp: 4 },
      moves: ['Protect', 'Dragon Dance', 'Dragon Claw', 'Flare Blitz'],
      gender: 'M',
    }),
    new Pokemon(gen, 'Tyranitar', {
      level: 50,
      item: 'Tyranitarite',
      ability: 'Sand Stream',
      nature: 'Adamant',
      evs: { hp: 4, atk: 252, spe: 252 },
      moves: ['Protect', 'Crunch', 'Rock Slide', 'High Horsepower'],
      gender: 'F',
    }),
    new Pokemon(gen, 'Milotic', {
      level: 50,
      item: 'Leftovers',
      ability: 'Competitive',
      nature: 'Bold',
      evs: { hp: 252, def: 252, spa: 4 },
      moves: ['Protect', 'Icy Wind', 'Scald', 'Recover'],
      gender: 'M',
    }),
    new Pokemon(gen, 'Incineroar', {
      level: 50,
      item: 'Sitrus Berry',
      ability: 'Intimidate',
      nature: 'Adamant',
      evs: { hp: 252, atk: 252, spd: 4 },
      moves: ['Fake Out', 'Parting Shot', 'Throat Chop', 'Flare Blitz'],
      gender: 'M',
    }),
    new Pokemon(gen, 'Sinistcha', {
      level: 50,
      item: 'Coba Berry',
      ability: 'Hospitality',
      nature: 'Sassy',
      evs: { hp: 252, spd: 252, spa: 4 },
      moves: ['Matcha Gotcha', 'Rage Powder', 'Trick Room', 'Life Dew'],
    }),
    new Pokemon(gen, 'Sneasler', {
      level: 50,
      item: 'White Herb',
      ability: 'Unburden',
      nature: 'Jolly',
      evs: { atk: 252, spe: 252, hp: 4 },
      moves: ['Fake Out', 'Dire Claw', 'Close Combat', 'Coaching'],
      gender: 'M',
    }),
  ];
}

export function buildOppTeam(): TeamSet {
  return [
    new Pokemon(gen, 'Charizard', {
      level: 50,
      item: 'Charizardite Y',
      ability: 'Blaze',
      nature: 'Modest',
      evs: { spa: 252, spe: 252, hp: 4 },
      moves: ['Heat Wave', 'Solar Beam', 'Air Slash', 'Protect'],
      gender: 'M',
    }),
    new Pokemon(gen, 'Mewtwo', {
      level: 50,
      item: 'Mewtwonite X',
      ability: 'Pressure',
      nature: 'Adamant',
      evs: { atk: 252, spe: 252, hp: 4 },
      moves: ['Psystrike', 'Drain Punch', 'Ice Punch', 'Bullet Punch'],
      gender: 'N',
    }),
    new Pokemon(gen, 'Garchomp', {
      level: 50,
      item: 'Life Orb',
      ability: 'Rough Skin',
      nature: 'Jolly',
      evs: { atk: 252, spe: 252, hp: 4 },
      moves: ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Fire Fang'],
      gender: 'M',
    }),
    new Pokemon(gen, 'Annihilape', {
      level: 50,
      item: 'Assault Vest',
      ability: 'Defiant',
      nature: 'Adamant',
      evs: { hp: 252, atk: 252, spd: 4 },
      moves: ['Drain Punch', 'Rage Fist', 'Shadow Claw', 'U-turn'],
    }),
    new Pokemon(gen, 'Volcarona', {
      level: 50,
      item: 'Sitrus Berry',
      ability: 'Flame Body',
      nature: 'Timid',
      evs: { hp: 4, spa: 252, spe: 252 },
      moves: ['Heat Wave', 'Bug Buzz', 'Quiver Dance', 'Protect'],
      gender: 'F',
    }),
    new Pokemon(gen, 'Indeedee-F', {
      level: 50,
      item: 'Psychic Seed',
      ability: 'Psychic Surge',
      nature: 'Modest',
      evs: { hp: 252, spa: 252, spd: 4 },
      moves: ['Follow Me', 'Psychic', 'Helping Hand', 'Protect'],
      gender: 'F',
    }),
  ];
}

export interface ExperimentBundle {
  readonly myTeam: TeamSet;
  readonly oppTeam: TeamSet;
  readonly matchupMatrix: MatchupMatrix;
  readonly speed: SpeedRanking;
  readonly baseline: RankedPicks;
}

/**
 * Build the full input bundle. Cached per-process via a module-level
 * memo because matrix construction is non-trivial (~200ms) and many
 * tests reuse the same bundle.
 */
let cached: ExperimentBundle | undefined;
export function experimentBundle(): ExperimentBundle {
  if (cached !== undefined) return cached;
  const myTeam = buildMyTeam();
  const oppTeam = buildOppTeam();
  const matchupMatrix = matrix(gen, myTeam, oppTeam, { field: DOUBLES });
  const speed = speedTiers([
    ...myTeam.map((p) => ({ pokemon: p, side: 'my' as const })),
    ...oppTeam.map((p) => ({ pokemon: p, side: 'opp' as const })),
  ]);
  const baseline = recommendBP(gen, myTeam, oppTeam, EXPERIMENT_WEIGHTS, {
    field: DOUBLES,
    topK: 5,
  });
  cached = { myTeam, oppTeam, matchupMatrix, speed, baseline };
  return cached;
}
