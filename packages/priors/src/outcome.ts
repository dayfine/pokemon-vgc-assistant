/**
 * Outcome-probability integrator (M4.5).
 *
 * For a fixed (attacker_kit, defender_kit, move, field) and an attacker
 * species:
 *
 *   1. Solve the threshold T1 (smallest offensive stat guaranteeing OHKO)
 *      and T2 (smallest stat guaranteeing 2HKO) once via `solveThreshold`.
 *   2. Look up the species' `STAT_DISTRIBUTIONS` row → list of
 *      `(weight, bucket)` pairs.
 *   3. For each bucket: instantiate a `@smogon/calc` Pokemon with the
 *      bucket's representative spread, read its `rawStats.atk` (or `.spa`
 *      for special moves) — this is the bucket's *offensive stat under
 *      that role profile*.
 *   4. P(OHKO) = Σ weight · 1{stat ≥ T1}; same for P(2HKO).
 *
 * The output is a real-valued payload `{ pOhko, pTwoHko }` that the engine
 * matrix layer will eventually carry through to `score`. M4.5 ships the
 * primitive in isolation; the matrix-payload swap is a separate engine
 * track PR (per the dispatch's hard scope guard).
 *
 * Boundary behaviour:
 *   - `pOhko ∈ [0, 1]`, `pTwoHko ∈ [0, 1]`, `pTwoHko ≥ pOhko` (a guaranteed
 *     1HKO is also a guaranteed 2HKO; the calc layer enforces this).
 *   - Species with no distribution row → `{ pOhko: 0, pTwoHko: 0 }`. We
 *     do *not* fall back to a uniform-over-buckets default; an absent
 *     species is a curation gap and silently zeroing it makes the gap
 *     visible in the report rather than papering over with a guess.
 *   - Status moves and zero-damage matchups → both zero (T1, T2 = +Inf,
 *     no bucket's stat exceeds infinity).
 */

import { Pokemon } from '@smogon/calc';
import type { Field, Move } from '@smogon/calc';
import type { Generation } from '@smogon/calc/dist/data/interface.js';
import { REPRESENTATIVE_SPREADS } from './spreads.js';
import { STAT_DISTRIBUTIONS } from './stat-distributions.js';
import { solveThreshold } from './threshold.js';
import type { KitCandidate, OutcomeProbability } from './types.js';

/**
 * Which raw-stat key this move indexes. Mirrors `threshold.ts`'s
 * `offensiveStatKey` — duplicated here to avoid exporting the helper from
 * `threshold.ts` and bloating the public surface.
 */
function moveOffensiveStat(move: Move): 'atk' | 'spa' | undefined {
  if (move.category === 'Physical') return 'atk';
  if (move.category === 'Special') return 'spa';
  return undefined;
}

/**
 * Compute the offensive stat (atk or spa) that a Pokémon of the given
 * species lands at when running the bucket's representative spread. We
 * instantiate a fresh `@smogon/calc.Pokemon` and read its `rawStats[key]`
 * — the calc's stat formula already accounts for level / nature / EVs /
 * IVs, which is exactly what we want for "what stat does this role
 * profile produce on this species?".
 *
 * Level is fixed at 50 (VGC standard, mirrors `threshold.ts`).
 *
 * Returns `undefined` when the species can't be looked up — keeps the
 * outcome integrator tolerant of typos / unknown opp species rather than
 * throwing mid-matrix-build.
 */
function statForBucket(
  gen: Generation,
  species: string,
  bucket: keyof typeof REPRESENTATIVE_SPREADS,
  statKey: 'atk' | 'spa',
): number | undefined {
  const spread = REPRESENTATIVE_SPREADS[bucket];
  const evs: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>> = {};
  for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
    const v = spread.evs[k];
    if (typeof v === 'number') evs[k] = v;
  }
  const p = new Pokemon(gen, species, {
    level: 50,
    nature: spread.nature as never,
    evs,
  });
  const v = p.rawStats[statKey];
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return v;
}

/**
 * Public entry point. Returns `{ pOhko, pTwoHko }` — see file header for
 * algorithm + boundary behaviour.
 */
export function outcomeProbability(
  gen: Generation,
  attackerKit: KitCandidate,
  defenderKit: KitCandidate,
  move: Move,
  attackerSpecies: string,
  field?: Field,
): OutcomeProbability {
  const dist = STAT_DISTRIBUTIONS[attackerSpecies];
  if (dist === undefined || dist.length === 0) {
    return { pOhko: 0, pTwoHko: 0 };
  }

  const statKey = moveOffensiveStat(move);
  if (statKey === undefined) {
    return { pOhko: 0, pTwoHko: 0 };
  }

  const { t1, t2 } = solveThreshold(gen, attackerKit, defenderKit, move, field);

  let pOhko = 0;
  let pTwoHko = 0;
  for (const entry of dist) {
    const stat = statForBucket(gen, attackerSpecies, entry.bucket, statKey);
    if (stat === undefined) continue;
    if (stat >= t1) pOhko += entry.weight;
    if (stat >= t2) pTwoHko += entry.weight;
  }

  // pTwoHko >= pOhko by construction (T2 ≤ T1: a 1HKO is also a 2HKO),
  // but floating-point + the calc's notation discontinuity can produce
  // pOhko ever-so-slightly above pTwoHko in degenerate cases. Clamp.
  if (pTwoHko < pOhko) pTwoHko = pOhko;

  return { pOhko, pTwoHko };
}
