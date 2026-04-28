/**
 * Tests for the M4.5 threshold solver.
 *
 * Strategy: pick legal-in-M-A matchups (no Restricted / Paradox / Treasure
 * of Ruin attackers), compute the OHKO threshold by linear scan, and
 * assert the binary-search solver agrees. The linear-scan oracle is the
 * "hand-computed" reference — it walks the same calc path as the solver
 * but without the binary-search optimisation, so any disagreement is a
 * solver bug rather than a calc-semantics bug.
 *
 * Also exercises:
 *   - Status moves return Infinity / Infinity (no offensive stat).
 *   - Unknown species returns Infinity / Infinity (rawStats = NaN).
 *   - Stat-key derivation matches calc category.
 */

import { getGeneration } from '@pva/engine';
import { Field, Move } from '@smogon/calc';
import { describe, expect, it } from 'vitest';
import { solveThreshold } from '../src/threshold.js';
import { __testing as thresholdTesting } from '../src/threshold.js';
import type { KitCandidate } from '../src/types.js';

const gen = getGeneration();
const DOUBLES_FIELD = new Field({ gameType: 'Doubles' });

/**
 * Convenience constructor for `KitCandidate`. Tests don't need every field
 * to be meaningful — they only need the species/item/ability/moves trio
 * that drives calc, plus an EV/nature pair the solver can override.
 */
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

/**
 * Linear-scan oracle: walks every integer stat in [50, 250] and returns the
 * smallest one for which the calc reports a guaranteed OHKO. ~200 calc
 * calls per oracle call — slow but unambiguously correct.
 */
function oracleT1(
  attackerKit: KitCandidate,
  defenderKit: KitCandidate,
  move: Move,
  field: Field,
): number {
  const lo = 50;
  const hi = 250;
  for (let s = lo; s <= hi; s++) {
    const r = solveThreshold(gen, attackerKit, defenderKit, move, field, {
      statMin: s,
      statMax: s,
    });
    // statMin === statMax === s degenerates the search to "predicate(s)?" —
    // the solver returns s on hit, +Inf on miss. This is the cheapest way
    // to expose the same predicate without re-implementing it in the test.
    if (Number.isFinite(r.t1)) return r.t1;
  }
  return Number.POSITIVE_INFINITY;
}

describe('threshold: solver agrees with linear-scan oracle', () => {
  it('Choice Band Garchomp Earthquake vs. neutral Garchomp (T1 hand-computed)', () => {
    // Garchomp Earthquake spread move — single-target case (set Doubles
    // off so we don't multiply by 0.75). Matchup is purely physical so
    // T1 should land in the Atk axis. Garchomp's Atk base is 130; the
    // oracle pinpoints T1.
    const attacker = kit({
      species: 'Garchomp',
      item: 'Choice Band',
      ability: 'Rough Skin',
      moves: ['Earthquake'],
      nature: 'Adamant',
      evs: { atk: 252 },
      bucket: 'offensive-physical',
    });
    const defender = kit({
      species: 'Garchomp',
      ability: 'Rough Skin',
      nature: 'Hardy',
      evs: { hp: 4 },
      bucket: 'offensive-physical',
    });
    const move = new Move(gen, 'Earthquake');

    const result = solveThreshold(gen, attacker, defender, move);
    const oracle = oracleT1(attacker, defender, move);

    expect(result.t1).toBe(oracle);
    expect(result.t2).toBeLessThanOrEqual(result.t1); // 2HKO threshold ≤ 1HKO threshold
  });

  it('Choice Specs Tornadus Hurricane vs. Garchomp (special move → SpA axis)', () => {
    const attacker = kit({
      species: 'Tornadus',
      item: 'Choice Specs',
      ability: 'Prankster',
      moves: ['Hurricane'],
      nature: 'Modest',
      evs: { spa: 252 },
      bucket: 'offensive-special',
    });
    const defender = kit({
      species: 'Garchomp',
      ability: 'Rough Skin',
      nature: 'Hardy',
      evs: { hp: 4 },
      bucket: 'offensive-physical',
    });
    const move = new Move(gen, 'Hurricane');

    const result = solveThreshold(gen, attacker, defender, move);
    const oracle = oracleT1(attacker, defender, move);
    expect(result.t1).toBe(oracle);
  });

  it('Incineroar Knock Off vs. bulky Amoonguss — agrees with oracle', () => {
    const attacker = kit({
      species: 'Incineroar',
      item: 'Choice Band',
      ability: 'Intimidate',
      moves: ['Knock Off'],
      nature: 'Adamant',
      evs: { atk: 252 },
      bucket: 'offensive-physical',
    });
    const defender = kit({
      species: 'Amoonguss',
      item: 'Sitrus Berry',
      ability: 'Regenerator',
      nature: 'Bold',
      evs: { hp: 252, def: 252 },
      bucket: 'bulky-physical',
    });
    const move = new Move(gen, 'Knock Off');
    const result = solveThreshold(gen, attacker, defender, move, DOUBLES_FIELD);
    const oracle = oracleT1(attacker, defender, move, DOUBLES_FIELD);
    expect(result.t1).toBe(oracle);
  });
});

describe('threshold: boundary behaviour', () => {
  it('status moves return Infinity for both T1 and T2', () => {
    const attacker = kit({
      species: 'Whimsicott',
      ability: 'Prankster',
      nature: 'Timid',
      evs: { hp: 252, spe: 252 },
      bucket: 'speed-control',
    });
    const defender = kit({ species: 'Garchomp' });
    // Tailwind is a status move; calc category === 'Status'.
    const move = new Move(gen, 'Tailwind');
    const r = solveThreshold(gen, attacker, defender, move);
    expect(r.t1).toBe(Number.POSITIVE_INFINITY);
    expect(r.t2).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns Infinity when no S in [50, 250] produces an OHKO', () => {
    // Tackle from a defensive Sitrus mon into a max-HP Steel-type wall.
    // Even at S=250 the move can't OHKO; expect Infinity for T1.
    const attacker = kit({
      species: 'Amoonguss',
      ability: 'Regenerator',
      moves: ['Tackle'],
      nature: 'Bold',
      evs: { hp: 252, def: 252 },
      bucket: 'bulky-special',
    });
    const defender = kit({
      species: 'Archaludon',
      ability: 'Stamina',
      nature: 'Impish',
      evs: { hp: 252, def: 252 },
      bucket: 'bulky-physical',
    });
    const move = new Move(gen, 'Tackle');
    const r = solveThreshold(gen, attacker, defender, move);
    expect(r.t1).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns Infinity for unknown species (rawStats undefined / NaN)', () => {
    const attacker = kit({
      species: 'NotARealMonXyz',
      moves: ['Tackle'],
    });
    const defender = kit({ species: 'Garchomp' });
    const move = new Move(gen, 'Tackle');
    const r = solveThreshold(gen, attacker, defender, move);
    // The species lookup in `@smogon/calc` returns a synthetic Pokemon
    // with all stats at base 0 → rawStats may be 0 or NaN; either way
    // no S in our search range produces a non-zero damage range, so the
    // solver returns Infinity.
    expect(r.t1).toBe(Number.POSITIVE_INFINITY);
  });

  it('T2 ≤ T1 always (a 1HKO is also a 2HKO)', () => {
    const attacker = kit({
      species: 'Garchomp',
      item: 'Life Orb',
      ability: 'Rough Skin',
      moves: ['Earthquake'],
      nature: 'Adamant',
      evs: { atk: 252 },
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
    const r = solveThreshold(gen, attacker, defender, move, DOUBLES_FIELD);
    expect(r.t2).toBeLessThanOrEqual(r.t1);
  });
});

describe('threshold: monotonicity in defender bulk', () => {
  it('bulkier defender requires higher (or equal) T1 from same attacker', () => {
    const attacker = kit({
      species: 'Garchomp',
      item: 'Choice Band',
      ability: 'Rough Skin',
      moves: ['Earthquake'],
      nature: 'Adamant',
      evs: { atk: 252 },
      bucket: 'offensive-physical',
    });
    const squishy = kit({
      species: 'Garchomp',
      ability: 'Rough Skin',
      nature: 'Naive',
      evs: { hp: 0 },
      bucket: 'offensive-physical',
    });
    const bulky = kit({
      species: 'Garchomp',
      ability: 'Rough Skin',
      nature: 'Impish',
      evs: { hp: 252, def: 252 },
      bucket: 'bulky-physical',
    });
    const move = new Move(gen, 'Earthquake');
    const tSquishy = solveThreshold(gen, attacker, squishy, move).t1;
    const tBulky = solveThreshold(gen, attacker, bulky, move).t1;
    // Bulkier defender → larger T1 (need more attack to OHKO).
    expect(tBulky).toBeGreaterThanOrEqual(tSquishy);
  });
});

describe('threshold: __testing helpers', () => {
  it('STAT_MIN / STAT_MAX cover the level-50 raw-stat range', () => {
    expect(thresholdTesting.STAT_MIN).toBe(50);
    expect(thresholdTesting.STAT_MAX).toBe(250);
  });

  it('offensiveStatKey maps physical/special/status to atk/spa/undefined', () => {
    expect(thresholdTesting.offensiveStatKey(new Move(gen, 'Earthquake'))).toBe('atk');
    expect(thresholdTesting.offensiveStatKey(new Move(gen, 'Hurricane'))).toBe('spa');
    expect(thresholdTesting.offensiveStatKey(new Move(gen, 'Tailwind'))).toBeUndefined();
  });

  it('findSmallestSatisfying returns the boundary integer', () => {
    // Predicate: s >= 137. Test we converge on 137 from the [50, 250] range.
    const out = thresholdTesting.findSmallestSatisfying(50, 250, (s) => s >= 137);
    expect(out).toBe(137);
  });

  it('findSmallestSatisfying returns Infinity when never true', () => {
    const out = thresholdTesting.findSmallestSatisfying(50, 250, () => false);
    expect(out).toBe(Number.POSITIVE_INFINITY);
  });
});
