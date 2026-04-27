import { describe, expect, it } from 'vitest';
import { Field, Move, Pokemon, calc, getGeneration } from '../src/index.js';

const gen = getGeneration();

describe('calc — Gen 9 known calcs', () => {
  it('Choice Band Rillaboom Wood Hammer vs 4 HP / 0 Def Flutter Mane (singles)', () => {
    const result = calc(
      gen,
      new Pokemon(gen, 'Rillaboom', {
        item: 'Choice Band',
        ability: 'Grassy Surge',
        nature: 'Adamant',
        evs: { atk: 252 },
      }),
      new Pokemon(gen, 'Flutter Mane', {
        nature: 'Timid',
        evs: { hp: 4, spe: 252 },
      }),
      new Move(gen, 'Wood Hammer'),
    );
    expect(result.damage).toMatchInlineSnapshot(`
      {
        "koChance": 1,
        "max": 597,
        "min": 507,
        "notation": "guaranteed OHKO",
      }
    `);
  });

  it('Choice Specs Calyrex-Shadow Astral Barrage vs 0 HP Urshifu-Rapid-Strike (doubles, spread halved)', () => {
    const result = calc(
      gen,
      new Pokemon(gen, 'Calyrex-Shadow', {
        item: 'Choice Specs',
        ability: 'As One (Spectrier)',
        nature: 'Timid',
        evs: { spa: 252, spe: 252 },
      }),
      new Pokemon(gen, 'Urshifu-Rapid-Strike', {
        nature: 'Jolly',
        evs: { hp: 0, spd: 0 },
      }),
      new Move(gen, 'Astral Barrage'),
      new Field({ gameType: 'Doubles' }),
    );
    expect(result.damage).toMatchInlineSnapshot(`
      {
        "koChance": 1,
        "max": 469,
        "min": 399,
        "notation": "guaranteed OHKO",
      }
    `);
  });

  it('Incineroar Knock Off vs 252 HP / 252+ Def Assault Vest Rillaboom (item-bonus 1.5x)', () => {
    const result = calc(
      gen,
      new Pokemon(gen, 'Incineroar', {
        ability: 'Intimidate',
        nature: 'Adamant',
        evs: { atk: 252 },
      }),
      new Pokemon(gen, 'Rillaboom', {
        item: 'Assault Vest',
        nature: 'Impish',
        evs: { hp: 252, def: 252 },
      }),
      new Move(gen, 'Knock Off'),
    );
    expect(result.damage).toMatchInlineSnapshot(`
      {
        "koChance": 0.59326171875,
        "max": 147,
        "min": 124,
        "notation": "59.3% chance to 3HKO",
      }
    `);
  });

  it('Iron Hands Drain Punch vs 0 HP Chien-Pao (super-effective)', () => {
    const result = calc(
      gen,
      new Pokemon(gen, 'Iron Hands', {
        ability: 'Quark Drive',
        nature: 'Adamant',
        evs: { atk: 252 },
      }),
      new Pokemon(gen, 'Chien-Pao', {
        ability: 'Sword of Ruin',
        nature: 'Jolly',
        evs: { spe: 252 },
      }),
      new Move(gen, 'Drain Punch'),
    );
    expect(result.damage).toMatchInlineSnapshot(`
      {
        "koChance": 1,
        "max": 808,
        "min": 684,
        "notation": "guaranteed OHKO",
      }
    `);
  });

  it('Miraidon Electro Drift vs 4 HP Iron Valiant in Electric Terrain (terrain boost + contact bonus)', () => {
    const result = calc(
      gen,
      new Pokemon(gen, 'Miraidon', {
        item: 'Choice Specs',
        ability: 'Hadron Engine',
        nature: 'Timid',
        evs: { spa: 252, spe: 252 },
      }),
      new Pokemon(gen, 'Iron Valiant', {
        ability: 'Quark Drive',
        nature: 'Naive',
        evs: { hp: 4, spd: 0 },
      }),
      new Move(gen, 'Electro Drift'),
      new Field({ terrain: 'Electric' }),
    );
    expect(result.damage).toMatchInlineSnapshot(`
      {
        "koChance": 1,
        "max": 865,
        "min": 735,
        "notation": "guaranteed OHKO",
      }
    `);
  });
});
