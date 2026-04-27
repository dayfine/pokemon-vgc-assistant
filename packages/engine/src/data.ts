import { Generations } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface';

export type Format = 'gen9championsvgc2026regma';

export const DEFAULT_FORMAT: Format = 'gen9championsvgc2026regma';

// M1 ships vanilla Gen 9 base data. The gen9champions mod (Champions-only
// species/moves/items list, M-A's Mega list, SP→stat math) is not yet wired —
// see plan open questions Q1/Q2/Q3. M1.5 will swap this for the modded data.
export function getGeneration(_format: Format = DEFAULT_FORMAT): Generation {
  return Generations.get(9);
}
