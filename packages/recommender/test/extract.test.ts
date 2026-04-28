import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type AnthropicClient, type RecommendOptions, recommend } from '../src/index.js';
import { experimentBundle } from './helpers/experiment-fixture.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const recordedJson = readFileSync(join(FIXTURES, 'tabuyo-charx-vs-vibe.json'), 'utf8');

function makeOpts(extra: Partial<RecommendOptions> = {}): RecommendOptions {
  const bundle = experimentBundle();
  return {
    format: 'gen9championsvgc2026regma',
    sheetMode: 'open',
    myTeam: bundle.myTeam,
    oppTeam: bundle.oppTeam,
    matrix: bundle.matchupMatrix,
    speedRanking: bundle.speed,
    scoreBaseline: bundle.baseline,
    ...extra,
  };
}

describe('recommend — mock-replay (Tabuyo Charizard X vs Vibe)', () => {
  it('parses the recorded JSON to a typed AgentRecommendation via mockResponse', async () => {
    const rec = await recommend(makeOpts({ mockResponse: recordedJson }));
    expect(rec.bring).toEqual(['Charizard', 'Sneasler', 'Sinistcha', 'Incineroar']);
    expect(rec.lead).toEqual(['Charizard', 'Sneasler']);
    expect(rec.back).toEqual(['Sinistcha', 'Incineroar']);
    expect(rec.deviatesFromScoreBaseline).toBe(true);
    expect(rec.deviationRationale).toBeDefined();
    expect(rec.confidence).toBe('medium');
    expect(rec.keyOppThreats.length).toBeGreaterThanOrEqual(3);
    expect(rec.keyOppThreats.length).toBeLessThanOrEqual(5);
    expect(rec.leadScenarios.length).toBeGreaterThanOrEqual(2);
    expect(rec.leadScenarios.length).toBeLessThanOrEqual(4);
    // Spot-check a threat we know is in the recorded response.
    const threats = rec.keyOppThreats.map((t) => t.opp);
    expect(threats).toContain('Indeedee-F');
    expect(threats).toContain('Annihilape');
  });

  it('parses the same JSON via an injected client (no mockResponse)', async () => {
    let receivedPrompt: string | undefined;
    let receivedModel: string | undefined;
    const client: AnthropicClient = {
      async complete({ prompt, model }) {
        receivedPrompt = prompt;
        receivedModel = model;
        return recordedJson;
      },
    };
    const rec = await recommend(makeOpts({ client }));
    expect(rec.bring).toEqual(['Charizard', 'Sneasler', 'Sinistcha', 'Incineroar']);
    expect(receivedPrompt).toBeDefined();
    expect(receivedPrompt).toContain('## My team');
    expect(receivedPrompt).toContain('Tabuyo'.length === 6 ? 'Charizard' : 'never');
    expect(receivedModel).toBe('claude-sonnet-4-6');
  });

  it('honors anthropicModel override', async () => {
    let receivedModel: string | undefined;
    const client: AnthropicClient = {
      async complete({ model }) {
        receivedModel = model;
        return recordedJson;
      },
    };
    await recommend(makeOpts({ client, anthropicModel: 'claude-opus-4-7' }));
    expect(receivedModel).toBe('claude-opus-4-7');
  });

  it('tolerates a fenced JSON response', async () => {
    const fenced = `\`\`\`json\n${recordedJson}\n\`\`\``;
    const rec = await recommend(makeOpts({ mockResponse: fenced }));
    expect(rec.bring).toEqual(['Charizard', 'Sneasler', 'Sinistcha', 'Incineroar']);
  });

  it('wraps client errors as RecommenderError api-error kind', async () => {
    const client: AnthropicClient = {
      async complete() {
        throw new Error('connection reset');
      },
    };
    await expect(recommend(makeOpts({ client }))).rejects.toMatchObject({
      kind: 'api-error',
    });
  });
});
