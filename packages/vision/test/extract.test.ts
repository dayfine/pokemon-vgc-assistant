import { describe, expect, it, vi } from 'vitest';
import {
  type AnthropicVisionClient,
  type ExtractedTeamPreview,
  ExtractionError,
  type VisionImage,
  extract,
} from '../src/index.js';

const STUB_IMAGE: VisionImage = {
  bytes: Buffer.from('not a real image, but the mock client never reads it'),
  mediaType: 'image/jpeg',
};

const VALID_OPEN_RESPONSE = JSON.stringify({
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

const VALID_CLOSED_RESPONSE = JSON.stringify({
  sheetMode: 'closed',
  myTeam: [
    {
      species: 'Charizard',
      item: 'Charizardite X',
      ability: 'Blaze',
      moves: ['Dragon Dance', 'Flare Blitz', 'Dragon Claw', 'Protect'],
    },
  ],
  oppTeam: [{ species: 'Indeedee-F' }],
  confidence: 'high',
});

describe('extract — open sheet', () => {
  it('returns a valid ExtractedTeamPreview from a recorded response', async () => {
    const result = await extract(STUB_IMAGE, {
      sheetMode: 'open',
      format: 'gen9championsvgc2026regma',
      mockResponse: VALID_OPEN_RESPONSE,
    });
    expect(result.sheetMode).toBe('open');
    expect(result.myTeam).toHaveLength(1);
    expect(result.oppTeam).toHaveLength(1);
    expect(result.confidence).toBe('high');
  });

  it('passes through to the injected client when no mockResponse', async () => {
    const callMock = vi.fn().mockResolvedValue(VALID_OPEN_RESPONSE);
    const client: AnthropicVisionClient = { call: callMock };
    await extract(STUB_IMAGE, {
      sheetMode: 'open',
      format: 'gen9championsvgc2026regma',
      client,
    });
    expect(callMock).toHaveBeenCalledOnce();
    const [system, user, image] = callMock.mock.calls[0] ?? [];
    expect(system).toContain('You are a Pokémon team-preview extractor');
    expect(user).toContain('Sheet mode: **open**');
    expect(image).toBe(STUB_IMAGE);
  });
});

describe('extract — closed sheet', () => {
  it('returns species-only opp entries from a closed-sheet response', async () => {
    const result = await extract(STUB_IMAGE, {
      sheetMode: 'closed',
      format: 'gen9championsvgc2026regma',
      mockResponse: VALID_CLOSED_RESPONSE,
    });
    expect(result.sheetMode).toBe('closed');
    expect(result.oppTeam[0]).toEqual({ species: 'Indeedee-F' });
  });
});

describe('extract — error paths', () => {
  it('throws low-confidence when model returns confidence="low"', async () => {
    const lowConf = JSON.stringify({
      sheetMode: 'open',
      myTeam: [],
      oppTeam: [],
      confidence: 'low',
      notes: 'Too dark to read sprites',
    });
    await expect(
      extract(STUB_IMAGE, {
        sheetMode: 'open',
        format: 'gen9championsvgc2026regma',
        mockResponse: lowConf,
      }),
    ).rejects.toMatchObject({
      kind: 'low-confidence',
    });
  });

  it('surfaces invalid-response on parse failure', async () => {
    await expect(
      extract(STUB_IMAGE, {
        sheetMode: 'open',
        format: 'gen9championsvgc2026regma',
        mockResponse: 'not valid json at all',
      }),
    ).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('surfaces illegal-field on a banned species', async () => {
    const illegal = JSON.stringify({
      sheetMode: 'open',
      myTeam: [{ species: 'NotAMon' }],
      oppTeam: [],
      confidence: 'high',
    });
    await expect(
      extract(STUB_IMAGE, {
        sheetMode: 'open',
        format: 'gen9championsvgc2026regma',
        mockResponse: illegal,
      }),
    ).rejects.toMatchObject({
      kind: 'illegal-field',
    });
  });

  it('surfaces api-error when the injected client fails', async () => {
    const client: AnthropicVisionClient = {
      call: vi.fn().mockRejectedValue(new ExtractionError('api-error', 'simulated SDK failure')),
    };
    await expect(
      extract(STUB_IMAGE, {
        sheetMode: 'open',
        format: 'gen9championsvgc2026regma',
        client,
      }),
    ).rejects.toMatchObject({
      kind: 'api-error',
    });
  });
});

describe('extract — wiring sanity', () => {
  it('open-sheet extraction is shape-compatible with engine TeamSet (species names)', async () => {
    // The engine's `recommendBPFromSpecies` takes species names. The
    // extracted team's `species` strings should be the canonical names
    // the engine expects. Spot-check by reading them back as a
    // species-only array — same shape the CLI will pass to the engine.
    const result: ExtractedTeamPreview = await extract(STUB_IMAGE, {
      sheetMode: 'open',
      format: 'gen9championsvgc2026regma',
      mockResponse: VALID_OPEN_RESPONSE,
    });
    const oppSpeciesArray = result.oppTeam.map((m) => m.species);
    expect(oppSpeciesArray).toEqual(['Indeedee-F']);
    // Form-suffixed canonical names (Indeedee-F, Salamence-Mega) must
    // round-trip through extraction without coercion.
    expect(oppSpeciesArray[0]).toContain('-');
  });
});
