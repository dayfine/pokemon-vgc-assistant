import { describe, expect, it } from 'vitest';
import { ExtractionError, parseAndValidate } from '../src/index.js';

const VALID_OPEN = JSON.stringify({
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
});

const VALID_CLOSED = JSON.stringify({
  sheetMode: 'closed',
  myTeam: [
    {
      species: 'Charizard',
      item: 'Charizardite X',
      ability: 'Blaze',
      moves: ['Dragon Dance', 'Flare Blitz', 'Dragon Claw', 'Protect'],
    },
  ],
  oppTeam: [{ species: 'Indeedee-F', gender: 'F' }],
  confidence: 'high',
});

describe('parseAndValidate', () => {
  describe('happy path', () => {
    it('parses an open-sheet response', () => {
      const result = parseAndValidate(VALID_OPEN, 'open');
      expect(result.sheetMode).toBe('open');
      expect(result.myTeam).toHaveLength(1);
      expect(result.oppTeam).toHaveLength(1);
      expect(result.confidence).toBe('high');
      expect(result.myTeam[0]?.species).toBe('Charizard');
      expect((result.oppTeam[0] as { item?: string }).item).toBe('Psychic Seed');
    });

    it('parses a closed-sheet response', () => {
      const result = parseAndValidate(VALID_CLOSED, 'closed');
      expect(result.sheetMode).toBe('closed');
      expect(result.oppTeam[0]).toEqual({ species: 'Indeedee-F', gender: 'F' });
    });

    it('strips ```json fences', () => {
      const wrapped = `\`\`\`json\n${VALID_OPEN}\n\`\`\``;
      const result = parseAndValidate(wrapped, 'open');
      expect(result.sheetMode).toBe('open');
    });

    it('strips ``` fences without language tag', () => {
      const wrapped = `\`\`\`\n${VALID_OPEN}\n\`\`\``;
      const result = parseAndValidate(wrapped, 'open');
      expect(result.sheetMode).toBe('open');
    });

    it('preserves optional notes', () => {
      const withNotes = JSON.stringify({
        sheetMode: 'open',
        myTeam: [],
        oppTeam: [],
        confidence: 'medium',
        notes: 'Third opp slot was occluded by the cursor',
      });
      const result = parseAndValidate(withNotes, 'open');
      expect(result.notes).toBe('Third opp slot was occluded by the cursor');
    });
  });

  describe('error: invalid-response', () => {
    it('throws on non-JSON input', () => {
      expect(() => parseAndValidate('not valid json', 'open')).toThrow(ExtractionError);
    });

    it('throws when top-level is not an object', () => {
      expect(() => parseAndValidate('[]', 'open')).toThrowError(/JSON object/);
      expect(() => parseAndValidate('"string"', 'open')).toThrowError(/JSON object/);
    });

    it('throws on missing sheetMode', () => {
      expect(() => parseAndValidate('{}', 'open')).toThrowError(/sheetMode/);
    });

    it('throws when sheetMode disagrees with caller', () => {
      const closedResp = JSON.parse(VALID_CLOSED);
      expect(() => parseAndValidate(JSON.stringify(closedResp), 'open')).toThrowError(
        /sheetMode mismatch/,
      );
    });

    it('throws on missing/invalid confidence', () => {
      const bad = JSON.parse(VALID_OPEN);
      bad.confidence = 'medium-high';
      expect(() => parseAndValidate(JSON.stringify(bad), 'open')).toThrowError(/confidence/);
    });

    it('throws when myTeam is not an array', () => {
      const bad = JSON.parse(VALID_OPEN);
      bad.myTeam = {};
      expect(() => parseAndValidate(JSON.stringify(bad), 'open')).toThrowError(/myTeam/);
    });

    it('throws on missing species in an entry', () => {
      const bad = JSON.parse(VALID_OPEN);
      bad.oppTeam[0].species = '';
      expect(() => parseAndValidate(JSON.stringify(bad), 'open')).toThrowError(/species/);
    });

    it('throws on invalid gender', () => {
      const bad = JSON.parse(VALID_OPEN);
      bad.myTeam[0].gender = 'X';
      expect(() => parseAndValidate(JSON.stringify(bad), 'open')).toThrowError(/gender/);
    });

    it('throws on more than 4 moves', () => {
      const bad = JSON.parse(VALID_OPEN);
      bad.myTeam[0].moves = ['a', 'b', 'c', 'd', 'e'];
      expect(() => parseAndValidate(JSON.stringify(bad), 'open')).toThrowError(/max 4/);
    });

    it('throws when closed-sheet opp entry carries kit fields', () => {
      const bad = JSON.parse(VALID_CLOSED);
      bad.oppTeam[0].item = 'Choice Scarf';
      expect(() => parseAndValidate(JSON.stringify(bad), 'closed')).toThrowError(
        /not allowed under closed sheet/,
      );
    });

    it('throws when notes is not a string', () => {
      const bad = JSON.parse(VALID_OPEN);
      bad.notes = ['array', 'not', 'string'];
      expect(() => parseAndValidate(JSON.stringify(bad), 'open')).toThrowError(/notes/);
    });
  });

  describe('error kind', () => {
    it('every parse failure carries kind=invalid-response', () => {
      try {
        parseAndValidate('not json', 'open');
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExtractionError);
        expect((e as ExtractionError).kind).toBe('invalid-response');
        expect((e as ExtractionError).raw).toBe('not json');
      }
    });
  });
});
