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
  // `result.kochance()` throws (or `console.log`s with err=false) on 0-damage
  // matchups, e.g. Normal-type Fake Out into a Ghost-type defender. Those are
  // a normal occurrence when matrix.ts iterates every move on a set, so
  // short-circuit here and report a clean "no damage" cell.
  if (max === 0) {
    return {
      attacker,
      defender,
      move,
      damage: { min: 0, max: 0, koChance: 0, notation: 'no damage' },
    };
  }
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
