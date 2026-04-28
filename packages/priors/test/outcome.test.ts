/**
 * Tests for the M4.5 outcome integrator.
 *
 * Boundary properties (load-bearing — these are the report's correctness
 * surface):
 *   - pOhko ∈ [0, 1] always.
 *   - pTwoHko ∈ [0, 1] always.
 *   - pTwoHko ≥ pOhko always (a guaranteed 1HKO is also a guaranteed 2HKO).
 *   - Status moves return both zeros.
 *   - Species without a curated distribution returns both zeros (silent
 *     gap rather than guess).
 *
 * Sanity properties (catch sign errors):
 *   - Monotonicity in defender bulk: bulkier defender → P(OHKO) is
 *     non-increasing for the same attacker.
 *   - Bounding by extremes: a species whose entire distribution sits in
 *     "offensive" buckets has P(OHKO) higher than one whose entire
 *     distribution sits in "bulky" buckets, against the same defender.
 */

import { getGeneration } from '@pva/engine';
import { Field, Move } from '@smogon/calc';
import { describe, expect, it } from 'vitest';
import { outcomeProbability } from '../src/outcome.js';
import type { KitCandidate } from '../src/types.js';

const gen = getGeneration();
const DOUBLES_FIELD = new Field({ gameType: 'Doubles' });

function kit(overrides: Partial<KitCandidate> & Pick<KitCandidate, 'species'>): KitCandidate {
  return {
    item: '',
    ability: '',
    moves: [],
    nature: 'Hardy',
    evs: {},
    weight: 1.0,
    bucket: 'offensive-physical',
    ...overrides,
  };
}

describe('outcomeProbability: boundary behaviour', () => {
  it('returns zeros for species without a distribution', () => {
    const attacker = kit({
      species: 'NotInTable',
      item: 'Choice Band',
      moves: ['Earthquake'],
      bucket: 'offensive-physical',
    });
    const defender = kit({ species: 'Garchomp' });
    const move = new Move(gen, 'Earthquake');
    const r = outcomeProbability(gen, attacker, defender, move, 'NotInTable');
    expect(r.pOhko).toBe(0);
    expect(r.pTwoHko).toBe(0);
  });

  it('returns zeros for status moves', () => {
    const attacker = kit({
      species: 'Whimsicott',
      ability: 'Prankster',
      moves: ['Tailwind'],
      bucket: 'speed-control',
    });
    const defender = kit({ species: 'Garchomp' });
    const move = new Move(gen, 'Tailwind');
    const r = outcomeProbability(gen, attacker, defender, move, 'Whimsicott');
    expect(r.pOhko).toBe(0);
    expect(r.pTwoHko).toBe(0);
  });

  it('pOhko and pTwoHko are in [0, 1] for a typical matchup', () => {
    const attacker = kit({
      species: 'Garchomp',
      item: 'Life Orb',
      ability: 'Rough Skin',
      moves: ['Earthquake'],
      bucket: 'offensive-physical',
    });
    const defender = kit({
      species: 'Incineroar',
      ability: 'Intimidate',
      nature: 'Impish',
      evs: { hp: 252, def: 252 },
      bucket: 'bulky-physical',
    });
    const move = new Move(gen, 'Earthquake');
    const r = outcomeProbability(gen, attacker, defender, move, 'Garchomp', DOUBLES_FIELD);
    expect(r.pOhko).toBeGreaterThanOrEqual(0);
    expect(r.pOhko).toBeLessThanOrEqual(1);
    expect(r.pTwoHko).toBeGreaterThanOrEqual(0);
    expect(r.pTwoHko).toBeLessThanOrEqual(1);
  });

  it('pTwoHko ≥ pOhko always', () => {
    // Run several matchups to widen the surface; the invariant is structural.
    const attacker = kit({
      species: 'Garchomp',
      item: 'Choice Band',
      ability: 'Rough Skin',
      moves: ['Earthquake'],
      bucket: 'offensive-physical',
    });
    const defenders = [
      kit({ species: 'Incineroar', nature: 'Impish', evs: { hp: 252, def: 252 } }),
      kit({ species: 'Amoonguss', nature: 'Bold', evs: { hp: 252, def: 252 } }),
      kit({ species: 'Archaludon', nature: 'Impish', evs: { hp: 252, def: 252 } }),
      kit({ species: 'Tornadus', nature: 'Timid', evs: { hp: 252, spe: 252 } }),
    ];
    const move = new Move(gen, 'Earthquake');
    for (const d of defenders) {
      const r = outcomeProbability(gen, attacker, d, move, 'Garchomp', DOUBLES_FIELD);
      expect(r.pTwoHko).toBeGreaterThanOrEqual(r.pOhko);
    }
  });
});

describe('outcomeProbability: monotonicity in defender bulk', () => {
  it('bulkier defender → P(OHKO) does not increase', () => {
    const attacker = kit({
      species: 'Garchomp',
      item: 'Choice Band',
      ability: 'Rough Skin',
      moves: ['Earthquake'],
      bucket: 'offensive-physical',
    });
    const squishy = kit({
      species: 'Incineroar',
      ability: 'Intimidate',
      nature: 'Adamant', // neutral on Def
      evs: { atk: 252 }, // no HP/Def investment
      bucket: 'offensive-physical',
    });
    const bulky = kit({
      species: 'Incineroar',
      ability: 'Intimidate',
      nature: 'Impish', // +Def
      evs: { hp: 252, def: 252 },
      bucket: 'bulky-physical',
    });
    const move = new Move(gen, 'Earthquake');
    const rSquishy = outcomeProbability(gen, attacker, squishy, move, 'Garchomp', DOUBLES_FIELD);
    const rBulky = outcomeProbability(gen, attacker, bulky, move, 'Garchomp', DOUBLES_FIELD);
    expect(rBulky.pOhko).toBeLessThanOrEqual(rSquishy.pOhko);
  });
});

describe('outcomeProbability: distribution-shape sanity', () => {
  it('Garchomp (80% offensive-physical) has higher P(OHKO) than Incineroar (70% bulky-physical) on the same matchup', () => {
    // Both attacking the same target (a squishy Tornadus). Garchomp's
    // distribution puts most mass on the offensive-physical bucket whose
    // 252 Atk Adamant produces the highest Atk stat for the species; that
    // should give a higher OHKO rate than Incineroar's bulky-leaning
    // distribution at the same defender.
    const defender = kit({
      species: 'Tornadus',
      ability: 'Prankster',
      nature: 'Timid',
      evs: { hp: 4, spe: 252 },
      bucket: 'speed-control',
    });
    const garKit = kit({
      species: 'Garchomp',
      item: 'Choice Band',
      ability: 'Rough Skin',
      moves: ['Earthquake'],
      bucket: 'offensive-physical',
    });
    const inciKit = kit({
      species: 'Incineroar',
      item: 'Choice Band',
      ability: 'Intimidate',
      moves: ['Knock Off'],
      bucket: 'offensive-physical',
    });
    const garMove = new Move(gen, 'Earthquake');
    const inciMove = new Move(gen, 'Knock Off');

    const garR = outcomeProbability(gen, garKit, defender, garMove, 'Garchomp', DOUBLES_FIELD);
    const inciR = outcomeProbability(gen, inciKit, defender, inciMove, 'Incineroar', DOUBLES_FIELD);

    // Garchomp's offensive-physical mass is 0.8 vs. Incineroar's 0.2; both
    // at full Atk with Choice Band + good base stat should OHKO Tornadus,
    // so the *integrated* P(OHKO) reflects the mass weighting.
    expect(garR.pOhko).toBeGreaterThanOrEqual(inciR.pOhko);
  });
});
