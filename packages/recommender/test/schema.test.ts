import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type AgentRecommendation,
  RecommenderError,
  parseAgentRecommendation,
  validateAgainstLegalSpecies,
} from '../src/index.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const recordedJson = readFileSync(join(FIXTURES, 'tabuyo-charx-vs-vibe.json'), 'utf8');
const recordedObject = JSON.parse(recordedJson) as Record<string, unknown>;

/** Mutate one field in the canonical fixture and re-stringify. */
function mutate(patch: Record<string, unknown>): string {
  return JSON.stringify({ ...recordedObject, ...patch });
}

describe('parseAgentRecommendation — happy path', () => {
  it('round-trips the canonical fixture', () => {
    const rec = parseAgentRecommendation(recordedJson);
    expect(rec.bring).toEqual(['Charizard', 'Sneasler', 'Sinistcha', 'Incineroar']);
    expect(rec.confidence).toBe('medium');
  });
});

describe('parseAgentRecommendation — invalid JSON', () => {
  it('throws invalid-json when input is not JSON', () => {
    try {
      parseAgentRecommendation('this is not JSON {');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RecommenderError);
      expect((err as RecommenderError).kind).toBe('invalid-json');
      expect((err as RecommenderError).raw).toContain('not JSON');
    }
  });

  it('throws schema-mismatch when input is JSON but not an object (array)', () => {
    try {
      parseAgentRecommendation('[]');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as RecommenderError).kind).toBe('schema-mismatch');
    }
  });

  it('throws schema-mismatch when input is JSON but not an object (string)', () => {
    try {
      parseAgentRecommendation('"hello"');
      expect.fail('expected throw');
    } catch (err) {
      expect((err as RecommenderError).kind).toBe('schema-mismatch');
    }
  });
});

describe('parseAgentRecommendation — wrong shape', () => {
  it('rejects bring array of length != 4', () => {
    expect(() =>
      parseAgentRecommendation(mutate({ bring: ['Charizard', 'Sneasler', 'Sinistcha'] })),
    ).toThrow(RecommenderError);
  });

  it('rejects lead array of length != 2', () => {
    expect(() => parseAgentRecommendation(mutate({ lead: ['Charizard'] }))).toThrow(
      RecommenderError,
    );
  });

  it('rejects missing rationale', () => {
    const obj = { ...recordedObject };
    Reflect.deleteProperty(obj, 'rationale');
    expect(() => parseAgentRecommendation(JSON.stringify(obj))).toThrow(RecommenderError);
  });

  it('rejects invalid confidence value', () => {
    expect(() => parseAgentRecommendation(mutate({ confidence: 'super-high' }))).toThrow(
      RecommenderError,
    );
  });

  it('rejects keyOppThreats entry missing why', () => {
    expect(() =>
      parseAgentRecommendation(mutate({ keyOppThreats: [{ opp: 'Garchomp' }] })),
    ).toThrow(RecommenderError);
  });

  it('rejects leadScenarios entry missing turn1Play', () => {
    expect(() =>
      parseAgentRecommendation(
        mutate({
          leadScenarios: [{ ifOppLeads: ['A', 'B'], weLead: ['C', 'D'] }],
        }),
      ),
    ).toThrow(RecommenderError);
  });
});

describe('parseAgentRecommendation — cross-field invariants', () => {
  it('rejects lead member not in bring', () => {
    expect(() =>
      parseAgentRecommendation(
        mutate({
          bring: ['Charizard', 'Sneasler', 'Sinistcha', 'Incineroar'],
          lead: ['Charizard', 'Tyranitar'],
          back: ['Sinistcha', 'Incineroar'],
        }),
      ),
    ).toThrow(/lead member "Tyranitar" not in bring/);
  });

  it('rejects back member not in bring', () => {
    expect(() =>
      parseAgentRecommendation(
        mutate({
          bring: ['Charizard', 'Sneasler', 'Sinistcha', 'Incineroar'],
          lead: ['Charizard', 'Sneasler'],
          back: ['Sinistcha', 'Milotic'],
        }),
      ),
    ).toThrow(/back member "Milotic" not in bring/);
  });

  it('rejects mon appearing in both lead and back', () => {
    expect(() =>
      parseAgentRecommendation(
        mutate({
          bring: ['Charizard', 'Sneasler', 'Sinistcha', 'Incineroar'],
          lead: ['Charizard', 'Sneasler'],
          back: ['Sneasler', 'Sinistcha'],
        }),
      ),
    ).toThrow(/appears in both lead and back/);
  });

  it('rejects deviatesFromScoreBaseline=true with no deviationRationale', () => {
    const obj = { ...recordedObject, deviatesFromScoreBaseline: true };
    Reflect.deleteProperty(obj, 'deviationRationale');
    expect(() => parseAgentRecommendation(JSON.stringify(obj))).toThrow(
      /deviationRationale required/,
    );
  });

  it('accepts deviatesFromScoreBaseline=false without deviationRationale', () => {
    const obj = { ...recordedObject, deviatesFromScoreBaseline: false };
    Reflect.deleteProperty(obj, 'deviationRationale');
    const rec = parseAgentRecommendation(JSON.stringify(obj));
    expect(rec.deviatesFromScoreBaseline).toBe(false);
    expect(rec.deviationRationale).toBeUndefined();
  });
});

describe('validateAgainstLegalSpecies', () => {
  const rec: AgentRecommendation = parseAgentRecommendation(recordedJson);

  it('passes when every cited species is in the legal set', () => {
    const legal = new Set([
      'Charizard',
      'Sneasler',
      'Sinistcha',
      'Incineroar',
      'Indeedee-F',
      'Annihilape',
      'Garchomp',
      'Volcarona',
      'Mewtwo', // included; the experiment cites Mewtwo even though M-A bans it
    ]);
    expect(() => validateAgainstLegalSpecies(rec, legal)).not.toThrow();
  });

  it('rejects with illegal-species kind when a cited species is missing', () => {
    // Drop Mewtwo to simulate a stricter format-legality enforcement.
    const legal = new Set([
      'Charizard',
      'Sneasler',
      'Sinistcha',
      'Incineroar',
      'Indeedee-F',
      'Annihilape',
      'Garchomp',
      'Volcarona',
    ]);
    try {
      validateAgainstLegalSpecies(rec, legal);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RecommenderError);
      expect((err as RecommenderError).kind).toBe('illegal-species');
      expect((err as Error).message).toContain('Mewtwo');
    }
  });
});
