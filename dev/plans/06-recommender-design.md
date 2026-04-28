# 06 — M6.5: LLM recommender package

This doc covers the `recommender` track. Read `01-mvp.md` first; this
sits between M5/M5.5 (vision input) and M6 (CLI glue). It's a v1 layer
that wraps Claude's reasoning around the deterministic engine output.

Sibling research note: `dev/research/recommender-experiment-2026-04-28.md`
captures the one-shot experiment that validated the architecture.

## TL;DR

- New package `packages/recommender/` exposes one function:
  `recommend({ myTeam, oppTeam, matrix, speedRanking, scoreBaseline,
   format, notes? }) → AgentRecommendation`.
- Wraps the Anthropic SDK with a structured-output prompt. Returns a
  parsed JSON `AgentRecommendation` plus free-form rationale.
- The deterministic `engine.score` still runs and feeds **its top-N
  brings as input** to the recommender — the agent reacts to the
  baseline rather than reinventing it.
- Same key-handling pattern as `vision`: mocked client by default,
  `RUN_LIVE_TESTS=1` opt-in for real calls, repo secret for CI,
  end-user OS keychain.

## Why this design exists

The 2026-04-28 experiment (`dev/research/recommender-experiment-2026-04-28.md`)
showed the agent recommending **a completely different bring** from the
deterministic top — and being right about it. Specifically:

- Deterministic top: `Tyranitar + Milotic + Incineroar + Sneasler` —
  plays for trades, doesn't include the team's win condition.
- Agent top: `Charizard + Sneasler + Sinistcha + Incineroar` — sets up
  a +2 DD Charizard sweep, applies Coaching's defensive shift,
  recognises the team's archetype.

The deterministic score will not catch:

- **Setup synergy** (Coaching → DD Charizard, Trick Room flip,
  Helping Hand, Beat Up + Justified, etc.)
- **Archetype recognition** (this is the Tabuyo team / a TR core / a
  rain stack — pre-trained Pokemon knowledge)
- **Threat-priority sequencing** (kill Indeedee-F before opp's setup
  turns; remove redirection first; etc.)
- **Negative-tactical interactions** (don't Intimidate Annihilape
  because Defiant boosts; don't Knock Off a Choice-locked mon, etc.)
- **Per-scenario turn-by-turn play** ("if opp leads X+Y, T1 Fake Out
  on Z, T2 Coaching, T3 sweep")

Encoding all of this into a deterministic score is plausibly
intractable. An LLM with structured matchup context already has the
knowledge.

The deterministic `engine.score` doesn't go away — it's:

- **Fast** (sub-second; ~$0 per call).
- **Reproducible** (same input = same output).
- **Auditable** (every term explainable).
- **The right input for the agent** (priming; gives the agent a
  baseline to react to).

## Module shape

```
packages/recommender/
  package.json
  tsconfig.json
  src/
    types.ts             # AgentRecommendation, KeyThreat, LeadScenario,
                         # RecommendOptions, RecommenderError
    prompt.ts            # build the prompt from inputs (parameterized
                         # by format; snapshot-pinned per format)
    facts.ts             # hand-curated strategic facts per kit, e.g.
                         #   "Sneasler Coaching boosts ally Atk+Def by 1
                         #    stage; commonly used pre-DD on a Mega"
                         #   "Annihilape Defiant — DO NOT Intimidate"
                         # Plug into the prompt's "Strategic notes"
                         # section.
    extract.ts           # public recommend() — orchestrates Anthropic
                         # call + JSON parse + retry on malformed
    schema.ts            # Zod (or hand-rolled) schema validation for
                         # the AgentRecommendation JSON output
    client.ts            # thin Anthropic SDK wrapper, injectable
                         # for offline tests
    index.ts
  test/
    fixtures/
      tabuyo-charx-vs-vibe.md   # the 2026-04-28 experiment, prompt +
                                # recorded response (mock-replay test)
    extract.test.ts             # offline: feed fixture → mock client →
                                # assert parsed JSON shape
    schema.test.ts              # reject malformed responses
    prompt.test.ts              # snapshot the built prompt per format
    facts.test.ts               # facts table sanity (every entry
                                # references an M-A-legal mon /
                                # ability / move)
```

## Public API

```ts
import type {
  Format, MatchupMatrix, OutcomeProbabilityFn, RankedPicks,
  SpeedRanking, TeamSet,
} from '@pva/engine';

type SheetMode = 'closed' | 'open';

interface KeyThreat {
  readonly opp: string;            // Showdown-canonical species
  readonly why: string;            // 1-2 sentence rationale
}

interface LeadScenario {
  readonly ifOppLeads: readonly [string, string];
  readonly weLead: readonly [string, string];
  readonly turn1Play: string;
  readonly turn2Play?: string;
  readonly turn3Play?: string;
}

interface AgentRecommendation {
  readonly bring: readonly [string, string, string, string];   // 4 species names
  readonly lead: readonly [string, string];                    // 2 species names
  readonly back: readonly [string, string];                    // 2 species names
  readonly primaryWinCondition: string;                        // 1-2 sentences
  readonly keyOppThreats: readonly KeyThreat[];                // 3-5 items typical
  readonly leadScenarios: readonly LeadScenario[];             // 2-4 items typical
  readonly deviatesFromScoreBaseline: boolean;
  readonly deviationRationale?: string;                        // present iff deviates
  readonly confidence: 'high' | 'medium' | 'low';
  readonly rationale: string;                                  // free-form, 2-4 paragraphs
}

interface RecommendOptions {
  readonly format: Format;
  readonly sheetMode: SheetMode;
  readonly myTeam: TeamSet;
  readonly oppTeam: TeamSet;
  readonly matrix: MatchupMatrix;
  readonly speedRanking: SpeedRanking;
  readonly scoreBaseline: RankedPicks;       // top-N from engine.recommendBP
  readonly notes?: readonly string[];        // optional series-level facts (M7)
  readonly client?: AnthropicClient;         // for testing
  readonly mockResponse?: string;            // for testing
  readonly anthropicModel?: string;          // default 'claude-sonnet-4-6' or hot model
}

interface RecommenderError extends Error {
  readonly kind: 'invalid-json' | 'schema-mismatch' | 'illegal-species' | 'api-error';
  readonly raw?: string;
}

declare function recommend(opts: RecommendOptions): Promise<AgentRecommendation>;
```

`recommender` imports `@pva/engine` for **types only** (same rule as
`priors` and `vision`). Implementation calls `@anthropic-ai/sdk` and
nothing else from pva.

## Prompt structure

Per `dev/research/recommender-experiment-2026-04-28.md` §"Prompt
structure", the prompt has these sections:

1. **Role** — VGC doubles expert, recommendation engine.
2. **Format** — rules, banned categories, format-illegality flags
   for any species in the input that violate.
3. **My team** — full sets.
4. **Strategic notes** — facts from `facts.ts` for the relevant kits.
5. **Opp team** — full sets, with legality flags inline.
6. **Speed tiers** — sorted, both sides.
7. **Damage matrix — my attacks opp** — non-empty rows.
8. **Damage matrix — opp attacks my** — non-empty rows.
9. **Score baseline** — top-N brings + breakdowns + reason for top
   pick (lets the agent disagree on grounds).
10. **Notes** (optional) — series-level facts from the user.
11. **Task** — produce JSON + rationale.
12. **Output schema** — strict.

The prompt builder is parameterized: format, sheet mode, score
baseline depth, facts subset. Snapshot-pinned per format so prompt
drift is deliberate.

## `facts.ts` — hand-curated tactical facts

Per the experiment, **the strategic notes section was load-bearing** —
without it the agent reverted to recommending the deterministic top.
Facts encode:

- Per-species ability interactions (Defiant + Intimidate, Competitive
  + Intimidate, Soundproof + Roar, Justified + Beat Up, etc.)
- Per-move tactical patterns (Coaching's role on Mega DD setups, Rage
  Powder's redirection scope, Fake Out + setup combos, Knock Off
  contraindications on Choice-locked mons, etc.)
- Per-archetype recognition (Trick Room cores, sun, rain, Eternatus
  pivots, Indeedee-F screens setup, etc.)

Example shape:

```ts
type FactKey = string;  // e.g. 'sneasler-coaching', 'annihilape-defiant'

interface Fact {
  readonly key: FactKey;
  readonly applies: (myTeam: TeamSet, oppTeam: TeamSet) => boolean;
  readonly text: string;  // 1-3 sentences, slot into prompt §4
  readonly format?: Format;  // restrict if format-specific
}
```

Initial coverage: ~20-30 facts spanning M-A's top-played mons. Extend
incrementally — facts.ts is data, not architecture; PRs that add
facts are routine maintenance.

## Cost & API key

Same three-tier pattern as `vision` (see
`dev/plans/05-vision-design.md` §"API key & cost"):

- CI: `secrets.ANTHROPIC_API_KEY` (already documented; not yet set).
- Local dev: `.env`.
- M5.5 end-user: OS keychain via `keytar`.

Per-call cost: ~$0.05–0.15 with the full prompt context (~3-5 KB
input + ~3-5 KB output). At ranked-ladder use (one recommendation per
game), ~$0.50–1.50/month for heavy single-user use. Negligible.

## Phases

### M6.5.0 — recommender package, simple slice

- Public `recommend()` callable. Mocked-client tests using the
  2026-04-28 experiment fixture.
- `facts.ts` with ≥10 hand-curated facts covering the top-played M-A
  species.
- Prompt snapshot test pinned per format.
- Schema validation rejects malformed JSON.

**Done when**: `recommend(...)` on the experiment fixture (with mock
client returning the recorded response) produces a valid
`AgentRecommendation` matching the experiment's output, AND a real
live test (opt-in) hits the API and produces a *plausible*
recommendation (manually graded, not regression-tested).

### M6.5.1 — facts expansion

- Cover ≥30 M-A species' ability/move tactical interactions.
- Add format-rotation handling (per-format facts subsetting).

### M6.5.2 — series-level notes integration (M7 hook)

- `notes?: readonly string[]` parameter feeds into a "Series-level
  facts revealed so far" prompt section.
- M7 web UI populates notes; the recommender re-runs as notes
  accumulate. Prior runs' recommendations cached so the comparison
  shows what the new note changed.

## CLI / web integration

`packages/cli/` (M6) calls `recommender.recommend()` after assembling
the input bundle from `vision.extract` + `priors.expand` +
`engine.recommendBPFromSpecies`. The CLI prints the
`AgentRecommendation`'s `rationale` + a structured summary.

`apps/live-capture/` (M5.5) shows the agent recommendation in its
result panel — that's the user-facing output, not the deterministic
score. The score breakdown is available via a "show details" toggle
for the curious.

## What the recommender does NOT do

- **It doesn't replace `engine.score`.** Score is the priming input
  and audit trail.
- **It doesn't handle multi-game series state.** Notes integration
  (M6.5.2) is the hook; M7 owns the notes layer.
- **It doesn't validate format legality.** That's `vision.validate`'s
  job; recommender trusts its inputs.
- **It doesn't model in-battle decisions** (turn-by-turn during the
  game). The recommendation is for team preview / opening pair only.
- **It doesn't generate fresh sets** ("you should have run Knock Off
  instead of Throat Chop"). Build advice is out of scope.
- **It doesn't run a fact-table linter** — facts are hand-curated and
  stay that way; no fact-validity QC.

## Open questions

1. **Anthropic model choice.** Sonnet-4.6 vs Opus-4.7 for production?
   Opus's longer reasoning may help on edge cases; Sonnet is cheaper
   and the experiment used Sonnet successfully. Default Sonnet, allow
   override per-call.
2. **Streaming output.** Current design returns a single resolved
   `AgentRecommendation` after JSON parse. Streaming the rationale to
   the UI is M5.5/M7 concern, not recommender's.
3. **Caching by input hash.** Repeated calls with identical inputs
   (same teams, same matrix) should hit cache. Skip for v1; revisit
   when CLI/web layers expose retry buttons.
4. **Adversarial prompt resilience.** What if a user puts hostile
   text in the `notes` parameter? Sanitize, or treat notes as
   user-trust input only (CLI/M5.5 are single-user, so trust is
   acceptable). Document the threat model.
5. **Fact discovery from replays / Pikalytics.** Long-term: auto-mine
   facts from Pikalytics top-team data ("teams running Sneasler 87%
   pair with Mega DD setup mons → Coaching is the bridge"). Out of
   scope for v1; facts.ts stays hand-curated.

## Dependencies

- `@pva/engine` for types (Format, MatchupMatrix, SpeedRanking, RankedPicks).
- `@anthropic-ai/sdk` for Claude calls.
- The `data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg`
  fixture and the 2026-04-28 experiment are the v1 test bedrock.
- `process.env.ANTHROPIC_API_KEY` (CI repo secret) for live tests.

## Track ownership

- `dev/status/recommender.md` — to be added when `feat-recommender.md`
  ships.
- Agent contract `feat-recommender.md` — analogous to
  `feat-priors.md` / `feat-vision.md` shape; written when the track
  starts (one PR for agent + status, then dispatches).
