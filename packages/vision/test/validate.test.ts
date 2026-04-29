import { describe, expect, it } from 'vitest';
import { type ExtractedTeamPreview, ExtractionError, validateExtraction } from '../src/index.js';

function buildExtraction(overrides: Partial<ExtractedTeamPreview> = {}): ExtractedTeamPreview {
  return {
    sheetMode: 'open',
    myTeam: [
      {
        species: 'Charizard',
        gender: 'M',
        item: 'Charizardite X',
        ability: 'Blaze',
        moves: ['Dragon Dance', 'Flare Blitz', 'Dragon Claw', 'Protect'],
      },
    ],
    oppTeam: [
      {
        species: 'Indeedee-F',
        gender: 'F',
        item: 'Psychic Seed',
        ability: 'Psychic Surge',
        moves: ['Follow Me', 'Expanding Force', 'Dazzling Gleam', 'Helping Hand'],
      },
    ],
    confidence: 'high',
    ...overrides,
  };
}

describe('validateExtraction', () => {
  it('accepts a fully-populated open-sheet extraction with M-A-legal kits', () => {
    expect(() => validateExtraction(buildExtraction(), 'gen9championsvgc2026regma')).not.toThrow();
  });

  it('accepts a closed-sheet extraction (no kit fields on opp)', () => {
    const closed = buildExtraction({
      sheetMode: 'closed',
      oppTeam: [{ species: 'Indeedee-F', gender: 'F' }],
    });
    expect(() => validateExtraction(closed, 'gen9championsvgc2026regma')).not.toThrow();
  });

  describe('species', () => {
    it('rejects an unknown species', () => {
      const bad = buildExtraction({
        oppTeam: [{ species: 'Charizmander', gender: 'M' }],
      });
      expect(() => validateExtraction(bad, 'gen9championsvgc2026regma')).toThrowError(
        /Charizmander/,
      );
    });

    it('rejects a misformatted form suffix', () => {
      // "Indeedee Female" is not the Showdown-canonical form; should be
      // "Indeedee-F". Vision must surface the model's mistake rather
      // than silently coerce.
      const bad = buildExtraction({
        oppTeam: [{ species: 'Indeedee Female' }],
      });
      expect(() => validateExtraction(bad, 'gen9championsvgc2026regma')).toThrowError(/species/);
    });
  });

  describe('item', () => {
    it('rejects an unknown item', () => {
      const bad = buildExtraction({
        myTeam: [{ species: 'Charizard', item: 'Definitely Not An Item' }],
      });
      expect(() => validateExtraction(bad, 'gen9championsvgc2026regma')).toThrowError(/item/);
    });

    it('accepts a Mega Stone', () => {
      const ok = buildExtraction({
        myTeam: [
          {
            species: 'Salamence',
            item: 'Salamencite',
            ability: 'Aerilate',
            moves: ['Hyper Voice', 'Dragon Claw', 'Earthquake', 'Protect'],
          },
        ],
      });
      expect(() => validateExtraction(ok, 'gen9championsvgc2026regma')).not.toThrow();
    });
  });

  describe('ability', () => {
    it('rejects an ability the species cannot have', () => {
      const bad = buildExtraction({
        myTeam: [{ species: 'Charizard', ability: 'Levitate' }],
      });
      expect(() => validateExtraction(bad, 'gen9championsvgc2026regma')).toThrowError(/ability/);
    });
  });

  describe('moves', () => {
    it('rejects a move the species does not learn', () => {
      // Charizard does not learn Hydro Pump (Water-type move on a
      // Fire/Flying mon — clear non-learnset case).
      const bad = buildExtraction({
        myTeam: [
          {
            species: 'Charizard',
            moves: ['Dragon Dance', 'Flare Blitz', 'Hydro Pump', 'Protect'],
          },
        ],
      });
      expect(() => validateExtraction(bad, 'gen9championsvgc2026regma')).toThrowError(/Hydro Pump/);
    });

    it('accepts a full M-A-legal moveset', () => {
      const ok = buildExtraction({
        myTeam: [
          {
            species: 'Hitmontop',
            ability: 'Intimidate',
            moves: ['Wide Guard', 'Quick Guard', 'Fake Out', 'Helping Hand'],
          },
        ],
      });
      expect(() => validateExtraction(ok, 'gen9championsvgc2026regma')).not.toThrow();
    });
  });

  describe('tera under M-A', () => {
    it('rejects any tera under M-A (no-Tera format)', () => {
      const bad = buildExtraction({
        myTeam: [{ species: 'Charizard', tera: 'Fire' }],
      });
      expect(() => validateExtraction(bad, 'gen9championsvgc2026regma')).toThrowError(/tera/);
    });

    it('rejects any tera under M-B (TBD, treated as no-Tera)', () => {
      const bad = buildExtraction({
        myTeam: [{ species: 'Charizard', tera: 'Fire' }],
      });
      expect(() => validateExtraction(bad, 'gen9championsvgc2026regmb')).toThrowError(/tera/);
    });
  });

  describe('error kind', () => {
    it('every legality failure carries kind=illegal-field', () => {
      const bad = buildExtraction({
        oppTeam: [{ species: 'NotAMon' }],
      });
      try {
        validateExtraction(bad, 'gen9championsvgc2026regma');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExtractionError);
        expect((e as ExtractionError).kind).toBe('illegal-field');
      }
    });
  });
});
