import { Generations } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface';

/**
 * Internal format ID. The set is intentionally a literal union so that
 * format-keyed maps (`Record<Format, ...>` in `recommender/prompt.ts`,
 * `priors/sources/pikalytics.ts`) get exhaustiveness-checked at compile
 * time — adding a new format forces every consumer to declare what it
 * does for the new value.
 *
 * `gen9championsvgc2026regmb` is a **stub** for the next Reg M rotation.
 * It exists to force-test the format-agnostic claim across packages; no
 * real M-B rules are wired yet (Pikalytics has no M-B slugs, recommender's
 * FORMAT_RULES carries placeholder text). Replace the stub text and add
 * proper Pikalytics slugs once M-B's official rules ship.
 */
export type Format = 'gen9championsvgc2026regma' | 'gen9championsvgc2026regmb';

export const DEFAULT_FORMAT: Format = 'gen9championsvgc2026regma';

// M1 ships vanilla Gen 9 base data. The gen9champions mod (Champions-only
// species/moves/items list, M-A's Mega list, SP→stat math) is not yet wired —
// see plan open questions Q1/Q2/Q3. M1.5 will swap this for the modded data.
// Both M-A and M-B currently resolve to the same vanilla Gen 9 generation;
// once the mod lands, this switch picks the right modded data per format.
export function getGeneration(_format: Format = DEFAULT_FORMAT): Generation {
  return Generations.get(9);
}
