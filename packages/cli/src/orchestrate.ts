import {
  Field,
  type Format,
  type MatchupMatrix,
  type RankedPicks,
  type ScoreWeights,
  type SpeedRanking,
  type TeamSet,
  getGeneration,
  matrix,
  recommendBP,
  speedTiers,
} from '@pva/engine';
import {
  type AgentRecommendation,
  type AnthropicClient,
  type RecommendOptions as RecommenderOptions,
  recommend as recommenderCall,
} from '@pva/recommender';
import {
  type AnthropicVisionClient,
  type ExtractedTeamPreview,
  type SheetMode,
  type VisionImage,
  extract as visionExtract,
} from '@pva/vision';
import { oppTeamFromVision } from './teams/from-vision.js';

/**
 * Score weights for v1. Same values the M3 design and the
 * 2026-04-28 recommender experiment used. CLI hard-codes them
 * because v1 doesn't expose tuning knobs; M6.x can wire a config
 * loader if scoring tuning becomes a per-user concern.
 */
const DEFAULT_WEIGHTS: ScoreWeights = {
  ohkoThreats: 3,
  speedControl: 2,
  defensiveAnswers: 2,
  ohkoTaken: 3,
  roleGap: 3,
};

const DOUBLES = new Field({ gameType: 'Doubles' });

/**
 * Inputs the orchestrator needs from the CLI layer. Tests inject
 * `visionClient` / `recommenderClient` (mocks) or `mockVisionResponse`
 * / `mockRecommenderResponse` (recorded strings); production wires
 * them from the default Anthropic SDK clients in
 * `vision.createDefaultClient` and `recommender.createDefaultClient`.
 */
export interface OrchestrateOptions {
  readonly myTeam: TeamSet;
  readonly oppImage: VisionImage;
  readonly format: Format;
  readonly sheetMode: SheetMode;
  readonly notes?: readonly string[];
  // Vision injection seams.
  readonly visionClient?: AnthropicVisionClient;
  readonly mockVisionResponse?: string;
  // Recommender injection seams.
  readonly recommenderClient?: AnthropicClient;
  readonly mockRecommenderResponse?: string;
}

/**
 * Result of an end-to-end run. The recommender's structured
 * `AgentRecommendation` is the primary payload; the engine artifacts
 * (matrix / speed / baseline) ride along so the renderer doesn't have
 * to recompute them.
 */
export interface OrchestrateResult {
  readonly recommendation: AgentRecommendation;
  readonly extracted: ExtractedTeamPreview;
  readonly oppTeam: TeamSet;
  readonly matchupMatrix: MatchupMatrix;
  readonly speedRanking: SpeedRanking;
  readonly scoreBaseline: RankedPicks;
}

/**
 * Run the full pipeline:
 *
 *   vision.extract(opp screenshot)   →  open-sheet kits
 *   build opp TeamSet from kits       (closed-sheet defers to M6.0b)
 *   engine.matrix + speedTiers + recommendBP  →  deterministic baseline
 *   recommender.recommend            →  AgentRecommendation
 *
 * Returns the structured payload + engine artifacts. Markdown
 * rendering is the caller's job (CLI-side) so the M7 web UI can
 * consume the same orchestrator result without re-parsing markdown.
 */
export async function orchestrate(opts: OrchestrateOptions): Promise<OrchestrateResult> {
  const extracted = await visionExtract(opts.oppImage, {
    sheetMode: opts.sheetMode,
    format: opts.format,
    ...(opts.visionClient !== undefined ? { client: opts.visionClient } : {}),
    ...(opts.mockVisionResponse !== undefined ? { mockResponse: opts.mockVisionResponse } : {}),
  });

  const gen = getGeneration();
  const oppTeam = oppTeamFromVision(extracted, gen);

  const matchupMatrix = matrix(gen, opts.myTeam, oppTeam, { field: DOUBLES });
  const speedRanking = speedTiers(
    [
      ...opts.myTeam.map((p) => ({ pokemon: p, side: 'my' as const })),
      ...oppTeam.map((p) => ({ pokemon: p, side: 'opp' as const })),
    ],
    {},
  );
  const scoreBaseline = recommendBP(gen, opts.myTeam, oppTeam, DEFAULT_WEIGHTS, {
    field: DOUBLES,
  });

  const recommenderOpts: RecommenderOptions = {
    format: opts.format,
    sheetMode: opts.sheetMode,
    myTeam: opts.myTeam,
    oppTeam,
    matrix: matchupMatrix,
    speedRanking,
    scoreBaseline,
    ...(opts.notes !== undefined && opts.notes.length > 0 ? { notes: opts.notes } : {}),
    ...(opts.recommenderClient !== undefined ? { client: opts.recommenderClient } : {}),
    ...(opts.mockRecommenderResponse !== undefined
      ? { mockResponse: opts.mockRecommenderResponse }
      : {}),
  };
  const recommendation = await recommenderCall(recommenderOpts);

  return {
    recommendation,
    extracted,
    oppTeam,
    matchupMatrix,
    speedRanking,
    scoreBaseline,
  };
}
