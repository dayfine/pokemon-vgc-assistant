import { Move } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface';
import { calc } from './calc.js';
import type { Field, Matchup, Pokemon, TeamSet } from './types.js';

/**
 * One side's full per-move damage grid against the opposing team.
 *
 * `cells[a][d]` = list of `Matchup` objects, one per move on attacker `a`
 * targeting defender `d`. Status moves are filtered out.
 */
export interface MatrixSide {
  readonly attackers: TeamSet;
  readonly defenders: TeamSet;
  readonly cells: ReadonlyArray<ReadonlyArray<readonly Matchup[]>>;
}

export interface MatchupMatrix {
  readonly my: MatrixSide;
  readonly opp: MatrixSide;
}

export interface MatrixOptions {
  /**
   * Field state used for both directions. The wrapper passes this through to
   * `@smogon/calc.calculate`. Defaults to `{ gameType: 'Doubles' }` since the
   * VGC use case is doubles — but spread-move halving is the calc's job, not
   * the matrix's.
   */
  readonly field?: Field;
}

function shouldCalc(move: Move): boolean {
  // Status moves do no damage; skip to keep the matrix focused on KO math.
  // BP-zero damaging moves (e.g. counter-style) get a 0 damage range from
  // calc, but we still want to record them — they're rare but real.
  return move.category !== 'Status';
}

function cellsFor(
  gen: Generation,
  attackers: TeamSet,
  defenders: TeamSet,
  field: Field | undefined,
): ReadonlyArray<ReadonlyArray<readonly Matchup[]>> {
  return attackers.map((attacker) =>
    defenders.map((defender) => {
      const matchups: Matchup[] = [];
      for (const moveName of attacker.moves) {
        if (!moveName) continue;
        const move = new Move(gen, moveName);
        if (!shouldCalc(move)) continue;
        matchups.push(calc(gen, attacker, defender, move, field));
      }
      return matchups;
    }),
  );
}

/**
 * Compute the full damage grid for two teams, both directions.
 *
 * Pure: no globals, no I/O. The Pokémon objects must already carry their
 * move list (`pokemon.moves`); this function only iterates them. Use the
 * `Pokemon` constructor's `moves` option to populate.
 */
export function matrix(
  gen: Generation,
  myTeam: TeamSet,
  oppTeam: TeamSet,
  options: MatrixOptions = {},
): MatchupMatrix {
  const { field } = options;
  return {
    my: {
      attackers: myTeam,
      defenders: oppTeam,
      cells: cellsFor(gen, myTeam, oppTeam, field),
    },
    opp: {
      attackers: oppTeam,
      defenders: myTeam,
      cells: cellsFor(gen, oppTeam, myTeam, field),
    },
  };
}
