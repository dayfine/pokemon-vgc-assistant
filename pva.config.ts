/**
 * Root config for pokemon-vgc-assistant.
 *
 * Per `dev/plans/02-architecture.md` §Config, this file is the single home
 * for every tunable in the system: format selection, sheet mode, prior cache
 * TTL, the Claude model id, and BP scoring weights. Engine code reads none
 * of this directly — engine is pure, so the CLI/web layer loads this config
 * and passes the relevant slice (e.g. `scoreWeights`) into engine functions.
 *
 * M3 ships `scoreWeights` cleanly. The other knobs are scaffolded as
 * TODO-typed shapes so adding M4/M5/M6 doesn't have to relitigate where
 * config lives — just fill in the type and the value.
 *
 * The `ScoreWeights` *interface* lives in `@pva/engine` (engine owns the
 * type so it can type-check its scoring function). This file owns the
 * *values*, per `qc-behavioral-authority.md` §Scoring: "Weights live in
 * `pva.config.ts`, not in code."
 */

import type { ScoreWeights } from '@pva/engine';

/**
 * v1 weights. Chosen to make the three hand-built test scenarios produce
 * the obvious answer:
 *   - 1HKO offense matters most (each gained 1HKO is worth a full role).
 *   - Speed control and defensive answers each weighted slightly less
 *     than offense — they only convert to wins via offense.
 *   - Taking a 1HKO is symmetric with landing one (zero-sum on the calc
 *     side), so penalty equals reward.
 *   - Missing a role costs roughly one OHKO-threat-credit, so a bring with
 *     two missing roles is dominated by any bring with the same offense
 *     but full role coverage.
 *
 * These are tunable. The tests in `engine/test/score.test.ts` and
 * `engine/test/bp.test.ts` assert *ordering* under these weights, not
 * exact totals — adjust freely as the meta surfaces edge cases.
 */
export const scoreWeights: ScoreWeights = {
  ohkoThreats: 3,
  speedControl: 2,
  defensiveAnswers: 2,
  ohkoTaken: 3,
  roleGap: 3,
};

/**
 * Top-level config shape. Only `scoreWeights` is wired in M3; the rest are
 * declared so the file's surface area is stable across milestones.
 */
export interface PvaConfig {
  readonly scoreWeights: ScoreWeights;
  // TODO(M4): priors cache TTL — see dev/plans/01-mvp.md §M4.
  readonly priorsCacheTtl?: number;
  // TODO(M5): Claude vision model id — see dev/plans/01-mvp.md §M5.
  readonly claudeModel?: string;
  // TODO(M6): default format + sheetMode — see dev/plans/01-mvp.md §M6.
  readonly format?: string;
  readonly sheetMode?: 'closed' | 'open';
}

const config: PvaConfig = {
  scoreWeights,
};

export default config;
