# recommender track

## Last updated: 2026-04-28

## Status
NOT_STARTED

## Current milestone
M6.5.0 — recommender package, simple slice

## Completed
(none — track initialised in scaffolding PR; no code shipped yet)

## In Progress
(none)

## Blocking refactors
(none)

## Follow-up
- **M6.5.0 simple slice** — scaffold `packages/recommender/` per
  `dev/plans/06-recommender-design.md` §"Module shape": `recommend()`
  public entry, mocked-client tests using the 2026-04-28 experiment
  fixture, ≥10 hand-curated facts in `facts.ts`, prompt snapshot pinned
  per format, schema validation rejects malformed JSON. Done when the
  fixture replay produces a valid `AgentRecommendation` and an opt-in
  live test (`RUN_LIVE_TESTS=1`) hits the API and produces a plausible
  recommendation (manually graded).
- **M6.5.1 facts expansion** — broaden `facts.ts` to ≥30 M-A species'
  ability/move tactical interactions; add format-rotation handling
  (per-format facts subsetting).
- **M6.5.2 series-level notes (M7 hook)** — wire the
  `notes?: readonly string[]` parameter into the prompt's
  "Series-level facts revealed so far" section. The notes UI itself
  belongs to M7.
- **CI live-test job** — when M6.5.0 lands, add a workflow (or extend
  `pnpm-test.yml`) that runs the `RUN_LIVE_TESTS=1` suite on a manual
  trigger or weekly cron, with `env: ANTHROPIC_API_KEY:
  ${{ secrets.ANTHROPIC_API_KEY }}` at the job level. The repo secret
  is already configured (2026-04-28); the workflow plumbing is the
  remaining work.
- **Anthropic model default** — design doc §"Open questions" Q1
  proposes Sonnet-4.6 as the default with per-call override. Confirm
  during M6.5.0 implementation; revisit if Opus reasoning materially
  improves edge-case picks.

## Known gaps
- **Vision not landed.** Track design assumes `vision.extract` will
  feed the team-preview path, but recommender is unblocked from
  vision: it takes `TeamSet` as input regardless of source. M6.5.0
  uses fixtures directly, so vision can land in parallel.
- **Adversarial prompt resilience.** Design doc Q4 — `notes`
  parameter is user-trust input only (single-user CLI / M5.5).
  Document the threat model when M6.5.2 lands; no sanitization for
  v1.
- **Caching.** No request-hash cache in v1; repeated identical inputs
  re-call the API. Revisit when CLI/web expose retry/refresh buttons.
- **Cost ceiling.** Per-call ~$0.05–0.15; ladder use ~$0.50–1.50/month
  for a heavy single-user. No enforced budget cap; document the
  expected envelope and let the user notice.
