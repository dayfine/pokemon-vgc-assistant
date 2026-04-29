import {
  Field,
  type Format,
  type MatchupMatrix,
  type OppSlotPriors,
  type RankedPicks,
  type ScoreWeights,
  type SpeedRanking,
  type TeamSet,
  getGeneration,
  matrix,
  recommendBP,
  recommendBPFromSpecies,
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
import { type PriorsClient, createDefaultPriorsClient } from './priors.js';
import { oppSlotPriorsFromVision } from './teams/from-vision-closed.js';
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
 * client mocks or pre-recorded responses; production wires the real
 * Anthropic SDK clients in `vision.createDefaultClient` /
 * `recommender.createDefaultClient` / `createDefaultPriorsClient`.
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
  // Priors injection seam (closed-sheet only).
  readonly priorsClient?: PriorsClient;
}

/**
 * Result of an end-to-end run. The recommender's structured
 * `AgentRecommendation` is the primary payload; the engine artifacts
 * (matrix / speed / baseline) ride along so the renderer doesn't have
 * to recompute them.
 *
 * `oppTeam` carries the representative `Pokemon[]` for the matrix's
 * row labels. Under closed sheet, these are the highest-weight kits
 * from the priors expansion; under open sheet, they're built directly
 * from the vision-extracted kits (1:1 with `extracted.oppTeam`).
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
 *   vision.extract(opp screenshot)         → species (closed) or kits (open)
 *   priors.expand                          → OppSlotPriors[]   (closed-sheet only)
 *   build opp TeamSet from kits            (open-sheet)
 *   engine.matrix + speedTiers + recommendBP[FromSpecies]  → deterministic baseline
 *   recommender.recommend                  → AgentRecommendation
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
  const { oppTeam, matchupMatrix, speedRanking, scoreBaseline } =
    extracted.sheetMode === 'closed'
      ? await runClosedSheet(opts, extracted, gen)
      : runOpenSheet(opts, extracted, gen);

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

interface PipelineArtifacts {
  readonly oppTeam: TeamSet;
  readonly matchupMatrix: MatchupMatrix;
  readonly speedRanking: SpeedRanking;
  readonly scoreBaseline: RankedPicks;
}

function runOpenSheet(
  opts: OrchestrateOptions,
  extracted: ExtractedTeamPreview,
  gen: ReturnType<typeof getGeneration>,
): PipelineArtifacts {
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
  return { oppTeam, matchupMatrix, speedRanking, scoreBaseline };
}

async function runClosedSheet(
  opts: OrchestrateOptions,
  extracted: ExtractedTeamPreview,
  gen: ReturnType<typeof getGeneration>,
): Promise<PipelineArtifacts> {
  const priorsClient =
    opts.priorsClient ?? createDefaultPriorsClient({ format: opts.format, sheetMode: 'closed' });
  const oppSlots: readonly OppSlotPriors[] = await oppSlotPriorsFromVision(
    extracted,
    gen,
    priorsClient,
  );
  const oppTeam = oppSlots.map((s) => s.representative);
  const oppKits = oppSlots.map((s) => s.kits);
  const matchupMatrix = matrix(gen, opts.myTeam, oppTeam, { field: DOUBLES, oppKits });
  const speedRanking = speedTiers(
    [
      ...opts.myTeam.map((p) => ({ pokemon: p, side: 'my' as const })),
      ...oppTeam.map((p) => ({ pokemon: p, side: 'opp' as const })),
    ],
    {},
  );
  const scoreBaseline = recommendBPFromSpecies(gen, opts.myTeam, oppSlots, DEFAULT_WEIGHTS, {
    field: DOUBLES,
  });
  return { oppTeam, matchupMatrix, speedRanking, scoreBaseline };
}
