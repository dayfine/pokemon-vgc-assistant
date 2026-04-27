import type { Field, Move, Pokemon } from '@smogon/calc';

export type { Pokemon, Move, Field };

export type Item = string;

export type TeamSet = readonly Pokemon[];

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
