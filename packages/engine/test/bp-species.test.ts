/**
 * Closed-sheet path tests for `recommendBPFromSpecies`.
 *
 * Mirrors the M3 scenario tests in `bp.test.ts` but exercises the new
 * species-input entry point: instead of building the opp `TeamSet` with
 * concrete `Pokemon` objects, the caller supplies one
 * `OppSlotPriors` per opp slot — a representative `Pokemon` (used for
 * speed-ranking) plus an `OppKitOption[]` distribution that the matrix
 * iterates over and `score` aggregates as expected counts.
 *
 * Test plan:
 *  - Hand-build a my-team + opp-species list.
 *  - Wire two kit candidates per opp slot with hand-set weights.
 *  - Confirm the top-3 picks include the obvious answer (a Calyrex-Shadow
 *    counter, mirroring `bp.test.ts` Scenario 3) and that the score
 *    breakdown surfaces real-valued, non-integer values when kit weights
 *    aren't 1.0 — proving the kit-cell aggregation path actually fires.
 */

import { describe, expect, it } from 'vitest';
import {
  Field,
  type OppKitOption,
  type OppSlotPriors,
  Pokemon,
  type ScoreWeights,
  getGeneration,
  recommendBPFromSpecies,
} from '../src/index.js';

const gen = getGeneration();
const DOUBLES = new Field({ gameType: 'Doubles' });

const WEIGHTS: ScoreWeights = {
  ohkoThreats: 3,
  speedControl: 2,
  defensiveAnswers: 2,
  ohkoTaken: 3,
  roleGap: 3,
};

/** Build a single-kit OppSlotPriors from a fully-built `Pokemon`. Reduces
 *  the closed-sheet path to a single weight-1 kit cell per opp slot, which
 *  must replicate the M3 scoring behaviour. */
function singleKitSlot(p: Pokemon): OppSlotPriors {
  const moves: string[] = [];
  for (const m of p.moves) {
    if (m) moves.push(m);
  }
  const kit: OppKitOption = {
    pokemon: p,
    kit: {
      species: p.name,
      item: p.item ?? '',
      ability: p.ability ?? '',
      moves,
    },
    weight: 1,
  };
  return { representative: p, kits: [kit] };
}

describe('recommendBPFromSpecies — single-kit reduction', () => {
  it('reduces to M3 behaviour when every opp slot has one weight-1 kit', () => {
    // Same scenario as bp.test.ts Scenario 3: one dominant opp threat,
    // one obvious answer on my side. The single-kit path should produce
    // a top-pick that includes the Caly-killer.
    const opp1 = new Pokemon(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Choice Specs',
      ability: 'As One (Spectrier)',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Astral Barrage', 'Psychic'],
    });
    const opp2 = new Pokemon(gen, 'Pelipper', {
      level: 50,
      ability: 'Drizzle',
      nature: 'Modest',
      evs: { hp: 252, spa: 252 },
      moves: ['Hurricane', 'Hydro Pump'],
    });
    const opp3 = new Pokemon(gen, 'Tatsugiri', {
      level: 50,
      ability: 'Commander',
      nature: 'Modest',
      evs: { hp: 4, spa: 252, spe: 252 },
      moves: ['Muddy Water', 'Draco Meteor'],
    });
    const opp4 = new Pokemon(gen, 'Dondozo', {
      level: 50,
      ability: 'Unaware',
      nature: 'Impish',
      evs: { hp: 252, def: 252 },
      moves: ['Wave Crash', 'Body Press'],
    });
    const opp5 = new Pokemon(gen, 'Amoonguss', {
      level: 50,
      ability: 'Regenerator',
      nature: 'Bold',
      evs: { hp: 252, def: 252 },
      moves: ['Sludge Bomb', 'Pollen Puff'],
    });
    const opp6 = new Pokemon(gen, 'Volcarona', {
      level: 50,
      ability: 'Flame Body',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Heat Wave', 'Bug Buzz'],
    });
    const oppSlots = [opp1, opp2, opp3, opp4, opp5, opp6].map(singleKitSlot);

    const urshifu = new Pokemon(gen, 'Urshifu', {
      level: 50,
      item: 'Choice Band',
      ability: 'Unseen Fist',
      nature: 'Adamant',
      evs: { atk: 252, spe: 252 },
      moves: ['Wicked Blow', 'Close Combat'],
    });
    const rilla = new Pokemon(gen, 'Rillaboom', {
      level: 50,
      ability: 'Grassy Surge',
      nature: 'Adamant',
      evs: { hp: 4, atk: 252, spe: 252 },
      moves: ['Wood Hammer', 'Grassy Glide'],
    });
    const tornadus = new Pokemon(gen, 'Tornadus', {
      level: 50,
      ability: 'Prankster',
      nature: 'Timid',
      evs: { hp: 252, spe: 252 },
      moves: ['Tailwind', 'Bleakwind Storm'],
    });
    const indeedee = new Pokemon(gen, 'Indeedee-F', {
      level: 50,
      ability: 'Psychic Surge',
      nature: 'Modest',
      evs: { hp: 252, spa: 252 },
      moves: ['Psychic', 'Follow Me'],
    });
    const garganacl = new Pokemon(gen, 'Garganacl', {
      level: 50,
      ability: 'Purifying Salt',
      nature: 'Careful',
      evs: { hp: 252, spd: 252 },
      moves: ['Salt Cure', 'Body Press'],
    });
    const flutterMane = new Pokemon(gen, 'Flutter Mane', {
      level: 50,
      ability: 'Protosynthesis',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Moonblast', 'Shadow Ball'],
    });

    const myTeam = [urshifu, rilla, tornadus, indeedee, garganacl, flutterMane] as const;
    const ranked = recommendBPFromSpecies(gen, myTeam, oppSlots, WEIGHTS, { field: DOUBLES });

    const top = ranked.picks[0]?.combo.map((p) => p.name) ?? [];
    expect(top).toContain('Urshifu');
  });
});

describe('recommendBPFromSpecies — multi-kit aggregation', () => {
  it('produces real-valued breakdown counts under non-trivial kit weights', () => {
    // Hand-build an opp slot with two distinct kits at hand-set weights so
    // the score breakdown's pickedKoOpp / oppKoPicked values land between
    // integer counts. The multi-kit path must surface fractional values
    // (= weighted expected counts) — anything integer would mean the
    // matrix is collapsing kits at the score boundary, which is the bug
    // this slice fixes.
    //
    // Scenario: opp slot 0 is "either Choice Specs or Assault Vest
    // Calyrex-Shadow" 50/50. Specs OHKOs my Iron Hands; AV does not.
    // Slot 1 is a single concrete Iron Hands.
    const calySpecs = new Pokemon(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Choice Specs',
      ability: 'As One (Spectrier)',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Astral Barrage', 'Psychic'],
    });
    // AV Calyrex-Shadow: bulky-special spread, weaker offensive output.
    const calyAv = new Pokemon(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Assault Vest',
      ability: 'As One (Spectrier)',
      nature: 'Careful',
      evs: { hp: 252, spd: 252 },
      moves: ['Astral Barrage', 'Psychic'],
    });
    const ironHandsOpp = new Pokemon(gen, 'Iron Hands', {
      level: 50,
      ability: 'Quark Drive',
      nature: 'Adamant',
      evs: { hp: 252, atk: 252 },
      moves: ['Drain Punch', 'Wild Charge'],
    });

    const calySlot: OppSlotPriors = {
      representative: calySpecs,
      kits: [
        {
          pokemon: calySpecs,
          kit: {
            species: 'Calyrex-Shadow',
            item: 'Choice Specs',
            ability: 'As One (Spectrier)',
            moves: ['Astral Barrage', 'Psychic'],
          },
          weight: 0.5,
        },
        {
          pokemon: calyAv,
          kit: {
            species: 'Calyrex-Shadow',
            item: 'Assault Vest',
            ability: 'As One (Spectrier)',
            moves: ['Astral Barrage', 'Psychic'],
          },
          weight: 0.5,
        },
      ],
    };
    const ironSlot = singleKitSlot(ironHandsOpp);

    // My team: 4 mons so the only top pick is the full bring (C(4,4)=1).
    const m1 = new Pokemon(gen, 'Iron Hands', {
      level: 50,
      ability: 'Quark Drive',
      nature: 'Adamant',
      evs: { hp: 252, atk: 252 },
      moves: ['Drain Punch', 'Wild Charge'],
    });
    const m2 = new Pokemon(gen, 'Tornadus', {
      level: 50,
      ability: 'Prankster',
      nature: 'Timid',
      evs: { hp: 252, spe: 252 },
      moves: ['Tailwind', 'Bleakwind Storm'],
    });
    const m3 = new Pokemon(gen, 'Flutter Mane', {
      level: 50,
      ability: 'Protosynthesis',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Moonblast', 'Shadow Ball'],
    });
    const m4 = new Pokemon(gen, 'Garchomp', {
      level: 50,
      ability: 'Rough Skin',
      nature: 'Jolly',
      evs: { atk: 252, spe: 252 },
      moves: ['Earthquake', 'Dragon Claw'],
    });

    const myTeam = [m1, m2, m3, m4] as const;
    const ranked = recommendBPFromSpecies(gen, myTeam, [calySlot, ironSlot], WEIGHTS, {
      field: DOUBLES,
      topK: 1,
    });

    const top = ranked.picks[0];
    expect(top).toBeDefined();
    if (!top) return;

    // The breakdown for picked KO offense and KO-taken should reflect
    // weighted aggregation of two kit branches. We assert that *some*
    // breakdown count is non-integer (within a tolerance), which proves
    // the kit-cell axis is being weighted-summed rather than collapsed.
    const b = top.score.breakdown;
    const allCounts = [b.pickedKoOpp, b.oppKoPicked, b.pickedSurvivesOpp];
    const someFractional = allCounts.some((v) => Math.abs(v - Math.round(v)) > 1e-6);
    expect(someFractional).toBe(true);

    // pickedKoOpp ∈ [0, 2] and oppKoPicked ∈ [0, 4] (4 picks). Bounds
    // sanity-check the aggregation didn't blow past the slot count.
    expect(b.pickedKoOpp).toBeGreaterThanOrEqual(0);
    expect(b.pickedKoOpp).toBeLessThanOrEqual(2);
    expect(b.oppKoPicked).toBeGreaterThanOrEqual(0);
    expect(b.oppKoPicked).toBeLessThanOrEqual(4);
  });
});
