import { type OppKitOption, type OppSlotPriors, Pokemon, type getGeneration } from '@pva/engine';
import { type KitCandidate, expand } from '@pva/priors';
import type { ExtractedTeamPreview } from '@pva/vision';
import type { PriorsClient } from '../priors.js';

type Generation = ReturnType<typeof getGeneration>;

/**
 * Convert closed-sheet vision (species-only opp) into an engine
 * `OppSlotPriors[]` by expanding each species through Pikalytics
 * priors. Each slot ships:
 *
 * - `representative` — the highest-weight kit's `Pokemon`, used by
 *   speed-ranking and as the row label in the matrix.
 * - `kits` — the full `OppKitOption[]` distribution (weights sum to
 *   1.0 ±1e-9 per the priors design).
 *
 * Per-species fetches go through `PriorsClient` (default: cache-first
 * Pikalytics fetch). Tests inject a stub that returns canned
 * `PikalyticsSpeciesData` per species to stay offline.
 */
const DEFAULT_LEVEL = 50;

export async function oppSlotPriorsFromVision(
  extracted: ExtractedTeamPreview,
  gen: Generation,
  priorsClient: PriorsClient,
): Promise<readonly OppSlotPriors[]> {
  if (extracted.sheetMode !== 'closed') {
    throw new Error(
      `oppSlotPriorsFromVision called with sheetMode=${extracted.sheetMode}. The closed-sheet path expects species-only input; open-sheet input goes through oppTeamFromVision.`,
    );
  }
  const slots: OppSlotPriors[] = [];
  for (let i = 0; i < extracted.oppTeam.length; i += 1) {
    const entry = extracted.oppTeam[i];
    if (entry === undefined) continue;
    const data = await priorsClient.fetchSpecies(entry.species);
    const candidates = expand(gen, { sheetMode: 'closed', data });
    if (candidates.length === 0) {
      throw new Error(
        `Opp slot #${i + 1} ("${entry.species}"): priors returned no kit candidates. The species likely has no Pikalytics presence under the active format / sheet mode.`,
      );
    }
    const kits = candidates.map((c) => toOppKitOption(c, gen));
    // Representative = highest-weight kit. KitCandidate weights sum to
    // 1.0; ties resolve by source order. Engine tests use a similar
    // pattern (see `bp-species.test.ts` `singleKitSlot`).
    const representative = pickRepresentative(kits);
    slots.push({ representative, kits });
  }
  return slots;
}

function toOppKitOption(c: KitCandidate, gen: Generation): OppKitOption {
  const pokemon = new Pokemon(gen, c.species, {
    level: DEFAULT_LEVEL,
    item: c.item,
    ability: c.ability,
    nature: c.nature,
    evs: c.evs,
    moves: [...c.moves],
  });
  return {
    pokemon,
    kit: {
      species: c.species,
      item: c.item,
      ability: c.ability,
      moves: c.moves,
    },
    weight: c.weight,
  };
}

function pickRepresentative(kits: readonly OppKitOption[]): Pokemon {
  let bestIdx = 0;
  let bestWeight = -1;
  for (let i = 0; i < kits.length; i += 1) {
    const k = kits[i];
    if (k !== undefined && k.weight > bestWeight) {
      bestIdx = i;
      bestWeight = k.weight;
    }
  }
  const rep = kits[bestIdx];
  if (rep === undefined) {
    throw new Error('pickRepresentative called with empty kits array');
  }
  return rep.pokemon;
}
