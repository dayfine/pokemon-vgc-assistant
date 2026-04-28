import { describe, expect, it } from 'vitest';
import { recommend } from '../src/index.js';
import { experimentBundle } from './helpers/experiment-fixture.js';

const RUN_LIVE = process.env.RUN_LIVE_TESTS === '1';

describe('recommend — live API call (opt-in)', () => {
  it.skipIf(!RUN_LIVE)(
    'produces a plausible recommendation against the experiment fixture',
    async () => {
      const bundle = experimentBundle();
      const rec = await recommend({
        format: 'gen9championsvgc2026regma',
        sheetMode: 'open',
        myTeam: bundle.myTeam,
        oppTeam: bundle.oppTeam,
        matrix: bundle.matchupMatrix,
        speedRanking: bundle.speed,
        scoreBaseline: bundle.baseline,
      });

      // Plausibility, not regression. Manually graded:
      // 1) The bring is 4 mons from the experiment's myTeam roster.
      // 2) lead and back partition bring.
      // 3) Confidence is one of the three valid values.
      // 4) keyOppThreats and leadScenarios are non-empty.
      const teamNames = new Set(bundle.myTeam.map((p) => p.name));
      for (const m of rec.bring) {
        expect(teamNames.has(m), `bring ${m} not in myTeam`).toBe(true);
      }
      const bringSet = new Set(rec.bring);
      for (const m of [...rec.lead, ...rec.back]) {
        expect(bringSet.has(m), `lead/back ${m} not in bring`).toBe(true);
      }
      expect(['high', 'medium', 'low']).toContain(rec.confidence);
      expect(rec.keyOppThreats.length).toBeGreaterThan(0);
      expect(rec.leadScenarios.length).toBeGreaterThan(0);

      // Log for manual grading — the actual signal of value comes from
      // human review, not regression assertion.
      console.log('--- live recommendation ---');
      console.log(JSON.stringify(rec, null, 2));
    },
    60_000,
  );
});
