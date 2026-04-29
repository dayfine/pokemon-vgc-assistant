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

  it('omits series notes section when notes is undefined', () => {
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

  it('omits series notes section when notes is the empty array', () => {
    // Distinct from the undefined branch — the M7 UI may pass `[]`
    // before any notes accumulate. Rendering an empty section header
    // would burn a slot and confuse the model.
    const bundle = experimentBundle();
    const prompt = buildPrompt({
      format: 'gen9championsvgc2026regma',
      sheetMode: 'open',
      myTeam: bundle.myTeam,
      oppTeam: bundle.oppTeam,
      matrix: bundle.matchupMatrix,
      speedRanking: bundle.speed,
      scoreBaseline: bundle.baseline,
      notes: [],
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

  it('renders multiple notes preserving caller-supplied order', () => {
    // The notes array is the M7 UI's primary lever for narrowing the
    // prior across games of a series. Order is part of the contract:
    // newer information typically lands later, and the model reads
    // them sequentially. A reorder would change recommendations.
    const bundle = experimentBundle();
    const notes = [
      'Game 1 turn 3 — opp Incineroar revealed Knock Off (not Flare Blitz).',
      'Game 1 turn 5 — opp Volcarona used Heat Wave under sun (confirms sun-team archetype).',
      'Game 2 turn 1 — opp led Tatsugiri + Dondozo (Commander pair confirmed).',
    ];
    const prompt = buildPrompt({
      format: 'gen9championsvgc2026regma',
      sheetMode: 'open',
      myTeam: bundle.myTeam,
      oppTeam: bundle.oppTeam,
      matrix: bundle.matchupMatrix,
      speedRanking: bundle.speed,
      scoreBaseline: bundle.baseline,
      notes,
    });
    const sectionStart = prompt.indexOf('## Series-level facts revealed so far');
    expect(sectionStart).toBeGreaterThanOrEqual(0);
    let cursor = sectionStart;
    for (const note of notes) {
      const idx = prompt.indexOf(note, cursor);
      expect(idx, `note "${note.slice(0, 40)}…" missing or out of order`).toBeGreaterThanOrEqual(
        cursor,
      );
      cursor = idx + note.length;
    }
  });

  it('pins the series-notes section format', () => {
    // Inline snapshot covers the exact rendered shape of the section —
    // any drift in heading, bullet style, or whitespace fails the
    // snapshot. Prevents accidental schema changes that would silently
    // shift how the model reads notes.
    const bundle = experimentBundle();
    const prompt = buildPrompt({
      format: 'gen9championsvgc2026regma',
      sheetMode: 'open',
      myTeam: bundle.myTeam,
      oppTeam: bundle.oppTeam,
      matrix: bundle.matchupMatrix,
      speedRanking: bundle.speed,
      scoreBaseline: bundle.baseline,
      notes: ['Game 1 — opp Volcarona had Quiver Dance.', 'Game 2 — opp led TR (Hatterene).'],
    });
    const start = prompt.indexOf('## Series-level facts revealed so far');
    // Section bodies contain `\n\n` between heading and bullets, so the
    // section terminator is the next section heading (`\n\n## …`), not
    // the first blank line.
    const end = prompt.indexOf('\n\n## ', start);
    const section = prompt.slice(start, end);
    expect(section).toMatchInlineSnapshot(`
      "## Series-level facts revealed so far

      - Game 1 — opp Volcarona had Quiver Dance.
      - Game 2 — opp led TR (Hatterene)."
    `);
  });

  it('renders the M-B stub format rules when format=gen9championsvgc2026regmb', () => {
    const bundle = experimentBundle();
    const prompt = buildPrompt({
      format: 'gen9championsvgc2026regmb',
      sheetMode: 'open',
      myTeam: bundle.myTeam,
      oppTeam: bundle.oppTeam,
      matrix: bundle.matchupMatrix,
      speedRanking: bundle.speed,
      scoreBaseline: bundle.baseline,
    });
    // Stub-specific marker — picks up that the M-B branch was hit, not M-A.
    expect(prompt).toContain('Regulation M-B (stub)');
    expect(prompt).not.toContain('Regulation M-A.');
  });
});
