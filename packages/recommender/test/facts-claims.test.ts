import { describe, expect, it } from 'vitest';

import { FACTS } from '../src/facts';
import {
  itemExists,
  megaStoneTriggers,
  speciesHasAbility,
  speciesLearnsMoveGen9,
  toID,
} from './helpers/showdown-snapshot';

/**
 * M6.5.3 facts data gate. Iterates every fact's `claims` × the vendored
 * Showdown-Champions snapshot. Any species/move/ability/item reference
 * that doesn't match the snapshot is a CI failure.
 *
 * What a claim asserts:
 *
 * - `{ species, move }`     — every listed species learns the move under
 *                             gen-9 rules.
 * - `{ species, ability }`  — every listed species has the ability in
 *                             some pokedex slot (0/1/H/S).
 * - `{ species, item }`     — the item exists in the items table; when
 *                             `species` is non-empty, the item is
 *                             expected to be a Mega Stone whose trigger
 *                             list intersects `species`.
 *
 * Failure messages name the fact key + claim index so the offending
 * entry in `facts.ts` is straight to find. Predicate logic (`applies`)
 * is out of scope for this gate — only the data assertions are checked.
 */
describe('facts.ts — claims data gate', () => {
  it('every fact with predicate-encoded species lists carries a claim', () => {
    // Sanity floor: M6.5.1 ships 38 facts; the migration in part B
    // populates `claims` on every fact whose predicate names species
    // (i.e. anything except pure-mechanic prose: Choice / Cloak / Eject /
    // Sash / Taunt / Aurora-Veil-form-bug / M-B stub). Floor at 25 so a
    // future fact addition without claims doesn't silently slip past.
    const withClaims = FACTS.filter((f) => f.claims !== undefined && f.claims.length > 0);
    expect(withClaims.length).toBeGreaterThanOrEqual(25);
  });

  for (const fact of FACTS) {
    const claims = fact.claims;
    if (!claims) continue;
    for (let i = 0; i < claims.length; i += 1) {
      const claim = claims[i];
      if (!claim) continue;
      const label = `${fact.key}[claims[${i}]]`;

      if (claim.move !== undefined) {
        const move = claim.move;
        for (const species of claim.species) {
          it(`${label}: ${species} learns ${move}`, () => {
            expect(speciesLearnsMoveGen9(species, move)).toBe(true);
          });
        }
      }

      if (claim.ability !== undefined) {
        const ability = claim.ability;
        for (const species of claim.species) {
          it(`${label}: ${species} has ability ${ability}`, () => {
            expect(speciesHasAbility(species, ability)).toBe(true);
          });
        }
      }

      if (claim.item !== undefined) {
        const item = claim.item;
        it(`${label}: item "${item}" exists`, () => {
          expect(itemExists(item)).toBe(true);
        });
        if (claim.species.length > 0) {
          // Item + species ⇒ Mega Stone trigger check. The item must
          // Mega-evolve at least one species in the claim list. Both
          // sides canonicalized via `toID` so display-name and
          // Showdown-name variants compare equal.
          const speciesIds = claim.species.map(toID);
          it(`${label}: item "${item}" mega-evolves one of [${claim.species.join(', ')}]`, () => {
            const triggers = megaStoneTriggers(item);
            expect(triggers.length).toBeGreaterThan(0);
            expect(triggers.some((t) => speciesIds.includes(toID(t)))).toBe(true);
          });
        }
      }
    }
  }
});
