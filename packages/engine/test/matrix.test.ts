import { describe, expect, it } from 'vitest';
import {
  Field,
  type MatchupMatrix,
  type MatrixSide,
  Pokemon,
  getGeneration,
  matrix,
} from '../src/index.js';

const gen = getGeneration();

/**
 * Flatten one side of a matrix into stable, snapshot-friendly rows.
 * The matrix carries `Pokemon`/`Move` instances which are heavy and noisy in
 * snapshots; keep only the names + numeric damage here.
 *
 * The cell shape is `KitCell[]` per (a, d) — for the M3 backwards-compat
 * path each cell has exactly one weight-1 KitCell whose `matchups` array
 * is the M3 `Matchup[]`. Flatten through both axes.
 */
function flattenSide(side: MatrixSide) {
  return side.cells.flatMap((row, ai) =>
    row.flatMap((cell, di) =>
      cell.flatMap((kc) =>
        kc.matchups.map((m) => ({
          attacker: side.attackers[ai]?.name ?? '?',
          defender: side.defenders[di]?.name ?? '?',
          move: m.move.name,
          min: m.damage.min,
          max: m.damage.max,
          koChance: m.damage.koChance,
          notation: m.damage.notation,
        })),
      ),
    ),
  );
}

function flatten(m: MatchupMatrix) {
  return { my: flattenSide(m.my), opp: flattenSide(m.opp) };
}

describe('matrix — Calyrex-Shadow archetype vs. Miraidon archetype (doubles)', () => {
  it('produces a pinned damage grid for both directions', () => {
    // Build small 2-mon "archetype" teams. Each Pokémon carries the moves the
    // matrix iterates. Status moves (e.g. Encore, Trick) and 0-damage type
    // immunities (e.g. Fake Out vs. Ghost) are exercised here to lock in the
    // wrapper's robustness.
    //
    // Levels pinned to 50 — VGC standard. @smogon/calc defaults to 100.
    const calyShadow = new Pokemon(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Choice Specs',
      ability: 'As One (Spectrier)',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Astral Barrage', 'Psychic', 'Trick'],
    });
    const incin = new Pokemon(gen, 'Incineroar', {
      level: 50,
      item: 'Safety Goggles',
      ability: 'Intimidate',
      nature: 'Adamant',
      evs: { hp: 252, atk: 252 },
      moves: ['Knock Off', 'Flare Blitz', 'Fake Out'],
    });

    const miraidon = new Pokemon(gen, 'Miraidon', {
      level: 50,
      item: 'Choice Specs',
      ability: 'Hadron Engine',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Electro Drift', 'Draco Meteor'],
    });
    const flutter = new Pokemon(gen, 'Flutter Mane', {
      level: 50,
      item: 'Booster Energy',
      ability: 'Protosynthesis',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Moonblast', 'Shadow Ball'],
    });

    const m = matrix(gen, [calyShadow, incin], [miraidon, flutter], {
      field: new Field({ gameType: 'Doubles', terrain: 'Electric' }),
    });

    expect(flatten(m)).toMatchInlineSnapshot(`
      {
        "my": [
          {
            "attacker": "Calyrex-Shadow",
            "defender": "Miraidon",
            "koChance": 1,
            "max": 145,
            "min": 123,
            "move": "Astral Barrage",
            "notation": "guaranteed 2HKO",
          },
          {
            "attacker": "Calyrex-Shadow",
            "defender": "Miraidon",
            "koChance": 1,
            "max": 145,
            "min": 123,
            "move": "Psychic",
            "notation": "guaranteed 2HKO",
          },
          {
            "attacker": "Calyrex-Shadow",
            "defender": "Flutter Mane",
            "koChance": 1,
            "max": 252,
            "min": 212,
            "move": "Astral Barrage",
            "notation": "guaranteed OHKO",
          },
          {
            "attacker": "Calyrex-Shadow",
            "defender": "Flutter Mane",
            "koChance": 1,
            "max": 127,
            "min": 108,
            "move": "Psychic",
            "notation": "guaranteed 2HKO",
          },
          {
            "attacker": "Incineroar",
            "defender": "Miraidon",
            "koChance": 0.90625,
            "max": 100,
            "min": 84,
            "move": "Knock Off",
            "notation": "90.6% chance to 2HKO",
          },
          {
            "attacker": "Incineroar",
            "defender": "Miraidon",
            "koChance": 0.117431640625,
            "max": 61,
            "min": 51,
            "move": "Flare Blitz",
            "notation": "11.7% chance to 3HKO",
          },
          {
            "attacker": "Incineroar",
            "defender": "Miraidon",
            "koChance": undefined,
            "max": 28,
            "min": 23,
            "move": "Fake Out",
            "notation": "possible 7HKO",
          },
          {
            "attacker": "Incineroar",
            "defender": "Flutter Mane",
            "koChance": 1,
            "max": 159,
            "min": 135,
            "move": "Knock Off",
            "notation": "guaranteed OHKO",
          },
          {
            "attacker": "Incineroar",
            "defender": "Flutter Mane",
            "koChance": 1,
            "max": 195,
            "min": 165,
            "move": "Flare Blitz",
            "notation": "guaranteed OHKO",
          },
          {
            "attacker": "Incineroar",
            "defender": "Flutter Mane",
            "koChance": 0,
            "max": 0,
            "min": 0,
            "move": "Fake Out",
            "notation": "no damage",
          },
        ],
        "opp": [
          {
            "attacker": "Miraidon",
            "defender": "Calyrex-Shadow",
            "koChance": 1,
            "max": 270,
            "min": 229,
            "move": "Electro Drift",
            "notation": "guaranteed OHKO",
          },
          {
            "attacker": "Miraidon",
            "defender": "Calyrex-Shadow",
            "koChance": 1,
            "max": 270,
            "min": 229,
            "move": "Draco Meteor",
            "notation": "guaranteed OHKO",
          },
          {
            "attacker": "Miraidon",
            "defender": "Incineroar",
            "koChance": 1,
            "max": 294,
            "min": 249,
            "move": "Electro Drift",
            "notation": "guaranteed OHKO",
          },
          {
            "attacker": "Miraidon",
            "defender": "Incineroar",
            "koChance": 1,
            "max": 294,
            "min": 249,
            "move": "Draco Meteor",
            "notation": "guaranteed OHKO",
          },
          {
            "attacker": "Flutter Mane",
            "defender": "Calyrex-Shadow",
            "koChance": 0.90625,
            "max": 100,
            "min": 84,
            "move": "Moonblast",
            "notation": "90.6% chance to 2HKO",
          },
          {
            "attacker": "Flutter Mane",
            "defender": "Calyrex-Shadow",
            "koChance": 1,
            "max": 336,
            "min": 280,
            "move": "Shadow Ball",
            "notation": "guaranteed OHKO",
          },
          {
            "attacker": "Flutter Mane",
            "defender": "Incineroar",
            "koChance": 0.46484375,
            "max": 109,
            "min": 93,
            "move": "Moonblast",
            "notation": "46.5% chance to 2HKO",
          },
          {
            "attacker": "Flutter Mane",
            "defender": "Incineroar",
            "koChance": undefined,
            "max": 45,
            "min": 38,
            "move": "Shadow Ball",
            "notation": "possible 5HKO",
          },
        ],
      }
    `);
  });

  it('skips status moves but iterates every damaging move on the set', () => {
    const calyShadow = new Pokemon(gen, 'Calyrex-Shadow', {
      level: 50,
      item: 'Choice Specs',
      ability: 'As One (Spectrier)',
      nature: 'Timid',
      evs: { spa: 252, spe: 252 },
      moves: ['Astral Barrage', 'Trick', 'Encore'],
    });
    const flutter = new Pokemon(gen, 'Flutter Mane', {
      level: 50,
      nature: 'Timid',
      evs: { spe: 252 },
      moves: ['Moonblast'],
    });
    const m = matrix(gen, [calyShadow], [flutter]);
    // M3 backwards-compat path: a single weight-1 KitCell per (a, d) pair.
    // Flatten the kit-cell axis to read out per-move identity.
    const myKitCells = m.my.cells[0]?.[0] ?? [];
    const myMoves = myKitCells.flatMap((kc) => kc.matchups.map((m) => m.move.name));
    expect(myMoves).toEqual(['Astral Barrage']);
  });
});
