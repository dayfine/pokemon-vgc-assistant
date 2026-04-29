import { Pokemon, type TeamSet, type getGeneration } from '@pva/engine';
import type { ExtractedKit, ExtractedTeamPreview } from '@pva/vision';

type Generation = ReturnType<typeof getGeneration>;

/**
 * Convert vision's open-sheet `ExtractedTeamPreview.oppTeam` into an
 * engine `TeamSet`. Each opp entry must carry full kit fields (item,
 * ability, moves) — closed-sheet entries (species-only) cannot reduce
 * to a single `Pokemon` without prior expansion via `@pva/priors`,
 * which lands in M6.0b.
 *
 * Throws `OppKitMissingError` with a clear message when an entry
 * lacks the kit fields. CLI surfaces this so the user knows to either
 * pass `--sheet-mode open` or wait for the closed-sheet path.
 */
const DEFAULT_LEVEL = 50;

export function oppTeamFromVision(extracted: ExtractedTeamPreview, gen: Generation): TeamSet {
  if (extracted.sheetMode !== 'open') {
    throw new OppKitMissingError(
      "Closed-sheet vision returns species only. M6.0 requires open-sheet input; pass `--sheet-mode open` (and use a fixture/screenshot that shows opp's full kits). Closed-sheet via priors expansion lands in M6.0b.",
    );
  }
  return extracted.oppTeam.map((entry, idx) =>
    buildPokemonFromKit(entry as ExtractedKit, gen, idx),
  );
}

function buildPokemonFromKit(kit: ExtractedKit, gen: Generation, idx: number): Pokemon {
  const moves = kit.moves;
  if (moves === undefined || moves.length === 0) {
    throw new OppKitMissingError(
      `Opp slot #${idx + 1} ("${kit.species}"): no moves in extraction. Open-sheet vision should always return four moves; check the extraction notes for occlusion warnings.`,
    );
  }
  return new Pokemon(gen, kit.species, {
    level: DEFAULT_LEVEL,
    ...(kit.item !== undefined && kit.item.length > 0 ? { item: kit.item } : {}),
    ...(kit.ability !== undefined && kit.ability.length > 0 ? { ability: kit.ability } : {}),
    moves: [...moves],
    ...(kit.gender !== undefined ? { gender: kit.gender } : {}),
  });
}

export class OppKitMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OppKitMissingError';
  }
}
