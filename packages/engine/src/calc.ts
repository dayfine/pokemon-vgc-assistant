import { calculate } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface';
import type { Field, Matchup, Move, Pokemon } from './types.js';

export function calc(
  gen: Generation,
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field?: Field,
): Matchup {
  const result = calculate(gen, attacker, defender, move, field);
  const [min, max] = result.range();
  const ko = result.kochance();
  return {
    attacker,
    defender,
    move,
    damage: {
      min,
      max,
      koChance: ko.chance,
      notation: ko.text,
    },
  };
}
