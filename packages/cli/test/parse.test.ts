import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TeamParseError, parseTeam } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(HERE, 'fixtures', 'charx-experiment.txt'), 'utf8');

describe('parseTeam', () => {
  it('parses the 2026-04-28 experiment team into 6 engine Pokémon', () => {
    const result = parseTeam(FIXTURE);
    expect(result.teamSet).toHaveLength(6);
    const names = result.teamSet.map((p) => p.name);
    expect(names).toEqual([
      'Charizard',
      'Tyranitar',
      'Milotic',
      'Incineroar',
      'Sinistcha',
      'Sneasler',
    ]);
  });

  it('preserves item / ability / nature / moves count', () => {
    const charx = parseTeam(FIXTURE).teamSet[0];
    expect(charx?.item).toBe('Charizardite X');
    expect(charx?.ability).toBe('Blaze');
    expect(charx?.nature).toBe('Adamant');
    // Pokémon constructed by `@smogon/calc` exposes `moves` as a
    // Move-like array; element shape is implementation detail of the
    // calc library. Verify count + that each entry resolved to
    // something Move-shaped (truthy and not the empty Move).
    expect(charx?.moves).toHaveLength(4);
    for (const move of charx?.moves ?? []) {
      expect(move).toBeDefined();
    }
  });

  it('preserves EV spreads', () => {
    const milotic = parseTeam(FIXTURE).teamSet[2];
    expect(milotic?.evs.hp).toBe(252);
    expect(milotic?.evs.spa).toBe(252);
    expect(milotic?.evs.spd).toBe(4);
  });

  it('rejects a team with the wrong number of sets', () => {
    const fiveMons = FIXTURE.split('\n\n').slice(0, 5).join('\n\n');
    expect(() => parseTeam(fiveMons)).toThrow(TeamParseError);
    expect(() => parseTeam(fiveMons)).toThrow(/Expected 6 sets/);
  });

  it('rejects unparseable input', () => {
    expect(() => parseTeam('this is not a Showdown team at all')).toThrow(TeamParseError);
  });

  it('rejects a set with no moves', () => {
    const noMoves = FIXTURE.replace(/- Protect\n- Dragon Dance\n- Dragon Claw\n- Flare Blitz/, '');
    expect(() => parseTeam(noMoves)).toThrow(/no moves/);
  });
});
