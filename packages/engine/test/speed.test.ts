import { describe, expect, it } from 'vitest';
import { Pokemon, getGeneration, speedTiers } from '../src/index.js';

const gen = getGeneration();

// Reg M-A is Level 50; pin it explicitly so speed math doesn't drift if the
// calc default ever changes.
const flutterMane = () =>
  new Pokemon(gen, 'Flutter Mane', {
    level: 50,
    nature: 'Timid',
    evs: { spe: 252 },
  });

const ironHands = () =>
  new Pokemon(gen, 'Iron Hands', {
    level: 50,
    nature: 'Brave',
    ivs: { spe: 0 },
    evs: {},
  });

describe('speedTiers — base ordering', () => {
  it('orders fastest-first under no modifiers', () => {
    const ranking = speedTiers([
      { pokemon: ironHands(), side: 'my' },
      { pokemon: flutterMane(), side: 'opp' },
    ]);
    expect(
      ranking.entries.map((e) => ({
        name: e.pokemon.name,
        side: e.side,
        effective: e.effective,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "effective": 205,
          "name": "Flutter Mane",
          "side": "opp",
        },
        {
          "effective": 49,
          "name": "Iron Hands",
          "side": "my",
        },
      ]
    `);
    expect(ranking.trickRoom).toBe(false);
  });
});

describe('speedTiers — modifiers', () => {
  it('Tailwind doubles speed for the side it covers', () => {
    const ranking = speedTiers(
      [
        { pokemon: ironHands(), side: 'my' },
        { pokemon: flutterMane(), side: 'opp' },
      ],
      { my: { tailwind: true } },
    );
    const ironHandsEntry = ranking.entries.find((e) => e.pokemon.name === 'Iron Hands');
    const flutterEntry = ranking.entries.find((e) => e.pokemon.name === 'Flutter Mane');
    // Brave 0-IV/0-EV Iron Hands @ L50 = 49; floor(49 * 2) = 98.
    expect(ironHandsEntry?.effective).toBe(98);
    // Flutter Mane (Timid, 252+ spe) untouched on the opposing side.
    expect(flutterEntry?.effective).toBe(205);
  });

  it('Trick Room flips ordering — slowest moves first', () => {
    const ranking = speedTiers(
      [
        { pokemon: ironHands(), side: 'my' },
        { pokemon: flutterMane(), side: 'opp' },
      ],
      { my: { trickRoom: true } },
    );
    expect(ranking.trickRoom).toBe(true);
    expect(ranking.entries[0]?.pokemon.name).toBe('Iron Hands');
    expect(ranking.entries[1]?.pokemon.name).toBe('Flutter Mane');
  });

  it('Choice Scarf applies via item field automatically', () => {
    const scarfedHands = new Pokemon(gen, 'Iron Hands', {
      level: 50,
      item: 'Choice Scarf',
      nature: 'Adamant',
      evs: { spe: 252 },
    });
    const ranking = speedTiers([{ pokemon: scarfedHands, side: 'my' }]);
    // Adamant 252+ EV Iron Hands @ L50 = 102; floor(102 * 1.5) = 153.
    expect(ranking.entries[0]?.effective).toBe(153);
  });

  it('paralysis halves speed, +1 boost adds 1.5x; both stack', () => {
    const ranking = speedTiers(
      [{ pokemon: flutterMane(), side: 'my', mods: { paralyzed: true, boost: 1 } }],
      {},
    );
    // 205 * 1.5 = 307.5 -> 307; * 0.5 = 153.5 -> 153.
    expect(ranking.entries[0]?.effective).toBe(153);
  });
});
