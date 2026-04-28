import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../src/index.js';
import { experimentBundle } from './helpers/experiment-fixture.js';

describe('buildPrompt — Tabuyo Charizard X experiment fixture', () => {
  it('matches snapshot for the canonical input', () => {
    const bundle = experimentBundle();
    const prompt = buildPrompt({
      format: 'gen9championsvgc2026regma',
      sheetMode: 'open',
      myTeam: bundle.myTeam,
      oppTeam: bundle.oppTeam,
      matrix: bundle.matchupMatrix,
      speedRanking: bundle.speed,
      scoreBaseline: bundle.baseline,
    });

    // High-level structural assertions (cheap, won't drift on damage-calc
    // version bumps): every section header is present in the expected
    // order, format-specific text appears, and the strategic-notes
    // section was populated by `selectFacts`.
    const sectionsInOrder = [
      '## Role',
      '## Format',
      '## My team',
      '## Strategic notes',
      '## Opp team',
      '## Speed tiers',
      '## Damage matrix — my team attacks opp',
      '## Damage matrix — opp attacks my team',
      '## Deterministic-score baseline',
      '## Task',
      '## Output schema',
    ];
    let cursor = 0;
    for (const heading of sectionsInOrder) {
      const idx = prompt.indexOf(heading, cursor);
      expect(idx, `section "${heading}" missing or out of order`).toBeGreaterThanOrEqual(cursor);
      cursor = idx + heading.length;
    }

    // Format-specific text only renders for the Reg M-A keyed entry.
    expect(prompt).toContain('Regulation M-A');
    expect(prompt).toContain('Mega Evolution only');

    // Strategic notes triggered for this matchup (Sneasler+Charizard X,
    // Annihilape+Incineroar Defiant interaction, Indeedee-F priority,
    // Mega Clause from two Mega stones, etc.). Spot-check the keys we
    // know fire — exact set covered by facts.test.ts.
    expect(prompt).toContain('annihilape-defiant-vs-intimidate');
    expect(prompt).toContain('sneasler-coaching-on-mega-setup');
    expect(prompt).toContain('indeedee-f-follow-me-priority');
    expect(prompt).toContain('mega-clause-one-per-team');
    expect(prompt).toContain('charizard-x-dragon-dance-archetype');

    // Inline snapshot of the role + format + output schema sections —
    // the load-bearing prompt-shape pieces. Damage matrix and team
    // sections are skipped from the snapshot because they depend on
    // calc internals (item names, etc.) and would couple this test to
    // upstream calc data.
    const roleStart = prompt.indexOf('## Role');
    const formatStart = prompt.indexOf('## Format');
    const role = prompt.slice(roleStart, formatStart).trim();
    expect(role).toMatchInlineSnapshot(`
      "## Role

      You are a Pokémon VGC doubles expert acting as a recommendation engine.
      Given a structured matchup context (team sets, speed tiers, damage matrix, deterministic-score baseline), recommend the best 4-of-6 bring, opening lead pair, key opp threats, and per-scenario lead plays. Apply tactical reasoning the deterministic score cannot capture: setup synergy, archetype recognition, threat-priority sequencing, ability/move tactical interactions."
    `);

    const outputSchemaIdx = prompt.indexOf('## Output schema');
    const outputSchemaText = prompt.slice(outputSchemaIdx).trim();
    expect(outputSchemaText).toMatchInlineSnapshot(`
      "## Output schema

      Return a single JSON object with these exact keys (no extra fields, no comments):

      \`\`\`json
      {
        \"bring\": [\"S1\", \"S2\", \"S3\", \"S4\"],
        \"lead\": [\"S1\", \"S2\"],
        \"back\": [\"S3\", \"S4\"],
        \"primaryWinCondition\": \"1-2 sentence summary\",
        \"keyOppThreats\": [{\"opp\": \"Species\", \"why\": \"rationale\"}],
        \"leadScenarios\": [{\"ifOppLeads\": [\"A\", \"B\"], \"weLead\": [\"C\", \"D\"], \"turn1Play\": \"...\", \"turn2Play\": \"...\", \"turn3Play\": \"...\"}],
        \"deviatesFromScoreBaseline\": true,
        \"deviationRationale\": \"required iff deviates\",
        \"confidence\": \"high\" | \"medium\" | \"low\",
        \"rationale\": \"free-form, 2-4 paragraphs\"
      }
      \`\`\`

      Use Showdown-canonical species names (e.g. \"Indeedee-F\", \"Landorus-Therian\"). Output the JSON only — no surrounding prose, no markdown code fence."
    `);
  });

  it('omits series notes section when notes is empty/undefined', () => {
    const bundle = experimentBundle();
    const prompt = buildPrompt({
      format: 'gen9championsvgc2026regma',
      sheetMode: 'open',
      myTeam: bundle.myTeam,
      oppTeam: bundle.oppTeam,
      matrix: bundle.matchupMatrix,
      speedRanking: bundle.speed,
      scoreBaseline: bundle.baseline,
    });
    expect(prompt).not.toContain('Series-level facts');
  });

  it('includes series notes section when notes is non-empty', () => {
    const bundle = experimentBundle();
    const prompt = buildPrompt({
      format: 'gen9championsvgc2026regma',
      sheetMode: 'open',
      myTeam: bundle.myTeam,
      oppTeam: bundle.oppTeam,
      matrix: bundle.matchupMatrix,
      speedRanking: bundle.speed,
      scoreBaseline: bundle.baseline,
      notes: ['Game 1 — opp brought Volcarona + Indeedee-F; Volcarona had Quiver Dance.'],
    });
    expect(prompt).toContain('## Series-level facts revealed so far');
    expect(prompt).toContain('Volcarona had Quiver Dance');
  });
});
