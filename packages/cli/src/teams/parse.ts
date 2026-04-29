import { Teams } from '@pkmn/sets';
import { Pokemon, type TeamSet, getGeneration } from '@pva/engine';

/**
 * Parse a Showdown-export `.txt` body into an engine `TeamSet`. Six
 * Pokémon expected; we error early on any other count.
 *
 * Why six exactly: the M-A format requires a 6-mon team. CLI is the
 * outermost validation seam — if the user typed a 4-mon team or
 * accidentally pasted two teams in one file, surfacing it here gives
 * a clearer error than an engine-side failure on a downstream call.
 */
export interface ParsedTeam {
  readonly teamSet: TeamSet;
  /** Display name from the Showdown header line, when present. */
  readonly name: string | undefined;
}

const REQUIRED_TEAM_SIZE = 6;
const DEFAULT_LEVEL = 50;

export function parseTeam(body: string): ParsedTeam {
  const team = Teams.importTeam(body);
  if (team === undefined) {
    throw new TeamParseError(
      'Could not parse Showdown export. Check the file is in the canonical format ("Charizard @ Charizardite X" / "Ability: Blaze" / four "- Move" lines).',
    );
  }
  const sets = team.team;
  if (sets.length !== REQUIRED_TEAM_SIZE) {
    throw new TeamParseError(
      `Expected ${REQUIRED_TEAM_SIZE} sets, found ${sets.length}. Each team file must contain exactly six Pokémon separated by blank lines.`,
    );
  }

  const gen = getGeneration();
  const teamSet: Pokemon[] = sets.map((set, idx) => {
    const species = set.species ?? set.name;
    if (typeof species !== 'string' || species.length === 0) {
      throw new TeamParseError(`Set #${idx + 1}: missing species`);
    }
    const moves = (set.moves ?? []).filter(
      (m): m is string => typeof m === 'string' && m.length > 0,
    );
    if (moves.length === 0) {
      throw new TeamParseError(`Set #${idx + 1} ("${species}"): no moves listed`);
    }
    return new Pokemon(gen, species, {
      level: typeof set.level === 'number' && set.level > 0 ? set.level : DEFAULT_LEVEL,
      ...(set.item !== undefined && set.item !== '' ? { item: set.item } : {}),
      ...(set.ability !== undefined && set.ability !== '' ? { ability: set.ability } : {}),
      ...(set.nature !== undefined && set.nature !== '' ? { nature: set.nature } : {}),
      ...(set.evs !== undefined ? { evs: set.evs } : {}),
      ...(set.ivs !== undefined ? { ivs: set.ivs } : {}),
      moves,
      ...(typeof set.gender === 'string' && set.gender !== ''
        ? { gender: set.gender as 'M' | 'F' | 'N' }
        : {}),
    });
  });

  return {
    teamSet,
    name: team.name,
  };
}

/** Thrown by `parseTeam` when the input is not a valid Showdown-export team. */
export class TeamParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamParseError';
  }
}
