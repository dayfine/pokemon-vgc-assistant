import type { Field, Move, Pokemon } from '@smogon/calc';

export type { Pokemon, Move, Field };

export type Item = string;

export type TeamSet = readonly Pokemon[];

/** Which side of the field a Pokémon is on, from the user's perspective. */
export type Side = 'my' | 'opp';

/** Pokémon stat-stage value. Stages outside [-6, +6] do not exist in-game. */
export type StatStage = -6 | -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DamageRange {
  min: number;
  max: number;
  koChance: number | undefined;
  notation: string;
}

export interface Matchup {
  attacker: Pokemon;
  defender: Pokemon;
  move: Move;
  damage: DamageRange;
}
