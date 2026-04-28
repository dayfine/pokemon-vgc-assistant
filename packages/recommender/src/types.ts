import type { Format, MatchupMatrix, RankedPicks, SpeedRanking, TeamSet } from '@pva/engine';

/**
 * Whether the opp's full kit is visible at team preview (open) or only
 * species (closed). Mirrors `priors.SheetMode` but stays decoupled — the
 * recommender doesn't depend on `@pva/priors`.
 */
export type SheetMode = 'closed' | 'open';

/**
 * One opp threat the agent considers high-priority to remove or play
 * around. Free-form `why` so the agent can cite tempo / setup / redirection
 * reasoning the deterministic matrix can't see.
 */
export interface KeyThreat {
  /** Showdown-canonical species name. Caller validates legality. */
  readonly opp: string;
  /** 1-2 sentence rationale. */
  readonly why: string;
}

/**
 * One "if opp leads X+Y, we lead A+B" turn-by-turn scenario. The agent's
 * primary value-add over the deterministic recommender — concrete
 * sequencing, not just a matchup score.
 */
export interface LeadScenario {
  readonly ifOppLeads: readonly [string, string];
  readonly weLead: readonly [string, string];
  readonly turn1Play: string;
  readonly turn2Play?: string;
  readonly turn3Play?: string;
}

/**
 * Public output of `recommend()`. Schema-validated at the package boundary;
 * malformed JSON from the model raises a `RecommenderError`.
 */
export interface AgentRecommendation {
  /** 4 species names (Showdown-canonical). */
  readonly bring: readonly [string, string, string, string];
  /** 2 of the 4 brings, sent out at lead. */
  readonly lead: readonly [string, string];
  /** The other 2 brings, kept in the back. */
  readonly back: readonly [string, string];
  /** 1-2 sentence summary of the path to victory. */
  readonly primaryWinCondition: string;
  /** 3-5 entries typical; not bounded by schema. */
  readonly keyOppThreats: readonly KeyThreat[];
  /** 2-4 entries typical; not bounded by schema. */
  readonly leadScenarios: readonly LeadScenario[];
  /** True iff `bring` differs from `scoreBaseline.picks[0].combo`. */
  readonly deviatesFromScoreBaseline: boolean;
  /** Required iff `deviatesFromScoreBaseline === true`. */
  readonly deviationRationale?: string;
  readonly confidence: 'high' | 'medium' | 'low';
  /** Free-form rationale, 2-4 paragraphs. */
  readonly rationale: string;
}

/**
 * Minimal Anthropic-client surface the recommender needs. Lets tests
 * inject a mock without pulling in the SDK's full type surface (which
 * is large). The shape matches what `client.ts` builds around
 * `@anthropic-ai/sdk`.
 */
export interface AnthropicClient {
  /**
   * Send the prompt and return the model's raw text response. Implementations
   * are expected to throw on transport errors; the recommender wraps those
   * in `RecommenderError({ kind: 'api-error' })`.
   */
  complete(input: { prompt: string; model: string }): Promise<string>;
}

export interface RecommendOptions {
  readonly format: Format;
  readonly sheetMode: SheetMode;
  readonly myTeam: TeamSet;
  readonly oppTeam: TeamSet;
  readonly matrix: MatchupMatrix;
  readonly speedRanking: SpeedRanking;
  /** Top-N from `engine.recommendBP` — the priming baseline. */
  readonly scoreBaseline: RankedPicks;
  /**
   * Optional series-level facts the user has accumulated (M6.5.2 hook).
   * v1 ignores beyond plumbing: the prompt builder appends them as a
   * "Series-level facts" section if non-empty, but no UI populates them
   * yet.
   */
  readonly notes?: readonly string[];
  /** Override the Anthropic client (tests inject mocks). */
  readonly client?: AnthropicClient;
  /**
   * Bypass the client entirely with a recorded response. Used by
   * mock-replay tests; the recommender parses + validates this string as
   * if it came from the model.
   */
  readonly mockResponse?: string;
  /** Defaults to `claude-sonnet-4-6` per design doc §"Open questions" Q1. */
  readonly anthropicModel?: string;
}

/**
 * Categories of recommender failure. The schema/JSON pipeline raises
 * these; the agent contract requires consumers to switch on `kind`
 * rather than parse error message text.
 */
export type RecommenderErrorKind =
  | 'invalid-json'
  | 'schema-mismatch'
  | 'illegal-species'
  | 'api-error';

export class RecommenderError extends Error {
  readonly kind: RecommenderErrorKind;
  readonly raw?: string;

  constructor(kind: RecommenderErrorKind, message: string, raw?: string) {
    super(message);
    this.name = 'RecommenderError';
    this.kind = kind;
    if (raw !== undefined) {
      this.raw = raw;
    }
  }
}
