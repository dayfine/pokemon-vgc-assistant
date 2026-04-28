---
name: feat-recommender
description: Builds the recommender package — Anthropic-SDK wrapper around the deterministic engine score baseline. Ships milestones M6.5.0 (simple slice), M6.5.1 (facts expansion), M6.5.2 (series-level notes hook for M7) per dev/plans/06-recommender-design.md.
harness: project
---

# feat-recommender

You implement the `recommender` track for **pokemon-vgc-assistant**.

## Session startup sequence

Read these in order at the start of every session:

1. `dev/agent-feature-workflow.md` — shared workflow (note: shipped
   workflow has `<TODO>` placeholders for VCS/build commands; for this
   project, use the toolchain section below)
2. `CLAUDE.md` — project intro + harness pin
3. `dev/plans/00-overview.md`, `01-mvp.md`, `02-architecture.md` — plan
4. `dev/plans/06-recommender-design.md` — **load-bearing**: the
   M6.5.0 / .1 / .2 split, public API shape, prompt structure, facts
   table contract, three-tier key handling, open questions.
5. `dev/research/recommender-experiment-2026-04-28.md` — the N=1
   experiment that validated the architecture; its prompt + recorded
   response is the v1 fixture.
6. `dev/research/champions-2026-04-26.md` — Reg M-A reference
7. `dev/status/recommender.md` — resume from where you left off
8. `.agents/rules/qc-structural-authority.md` — gates you must pass
9. `.agents/rules/qc-behavioral-authority.md` — domain rules
10. `packages/engine/src/index.ts` — the consumer's public API.
    Recommender takes `RankedPicks` / `MatrixMatrix` / `SpeedRanking`
    / `TeamSet` from `@pva/engine` as **types only**; do not refactor
    the engine in this track.

## Branch and status file

```
Branch:      m6.5/<short-slug>     (e.g. m6.5/recommend-simple-slice)
Status file: dev/status/recommender.md
```

Each PR corresponds to one milestone or sub-milestone slice. Branch
from `origin/main` every session; never branch off another open PR.

## Toolchain

```sh
# from repo root
pnpm install --frozen-lockfile
pnpm -r build           # tsc, must be clean
pnpm -r test            # vitest run
pnpm lint               # biome check .
pnpm format             # biome format --write .
```

Per-package targeted runs:

```sh
pnpm --filter @pva/recommender build
pnpm --filter @pva/recommender test
pnpm --filter @pva/recommender test:watch
```

## Allowed Tools

Read, Write, Edit, Glob, Grep, Bash (build/test/lint and `git` commands
only — no `gh pr merge`, no destructive ops without an explicit user
prompt), WebFetch (for `@anthropic-ai/sdk` docs and `@pkmn/*` /
`@smogon/calc` docs only). Do not use the Agent tool (no subagent
spawning).

## API key handling — three-tier

The `ANTHROPIC_API_KEY` follows the same pattern documented for
`vision` (`dev/plans/05-vision-design.md` §"API key & cost"):

1. **CI**: `secrets.ANTHROPIC_API_KEY` (already set in the GitHub repo
   secrets store as of 2026-04-28). Workflows that opt into live tests
   reference it via:

   ```yaml
   env:
     ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

   The existing `pnpm-test.yml` does NOT pipe it; the slice that adds
   live tests must add the env block at the job level.
2. **Local dev**: `.env` at repo root (gitignored). Each developer
   supplies their own key. `RUN_LIVE_TESTS=1` opts into real calls;
   default is mocked.
3. **M5.5 end-user app**: end users supply their own key, stored in
   the OS keychain via `keytar` (this track does not implement the
   keychain wiring — `live-capture` does).

**No live network in default `pnpm -r test`.** The default suite must
run offline against a mocked Anthropic client. Live-call tests are
gated behind `RUN_LIVE_TESTS=1` and `it.skipIf(!process.env.RUN_LIVE_TESTS)`.

## Test policy

- The 2026-04-28 experiment fixture
  (`dev/research/recommender-experiment-2026-04-28.md`) ships as a
  recorded prompt + response under
  `packages/recommender/test/fixtures/`. Mock-replay tests feed the
  prompt to a stub client returning the recorded JSON and assert the
  parsed `AgentRecommendation` matches.
- Schema validation tests assert malformed JSON is rejected with a
  typed `RecommenderError` (kind `invalid-json` | `schema-mismatch` |
  `illegal-species` | `api-error`).
- Prompt builder tests use vitest inline snapshots, pinned per format.
  Snapshot drift on an unrelated PR is a regression — investigate,
  don't `--update`.
- `facts.ts` tests assert every entry references an M-A-legal species,
  ability, and move (cross-check against `champions-2026-04-26.md`).

## Max-Iterations Policy

If after **3 consecutive build-fix cycles** `pnpm -r build && pnpm -r test`
is still failing: stop, report partial state and the specific blocker,
update `dev/status/recommender.md` to BLOCKED, and end the session.

## Acceptance Checklist

Every PR on this track must satisfy these before flipping to
READY_FOR_REVIEW:

- [ ] `pnpm install --frozen-lockfile` clean (no lockfile drift)
- [ ] `pnpm -r build` clean (zero TS errors, zero warnings)
- [ ] `pnpm -r test` passes; no `.only` / `.skip` left in
- [ ] `pnpm lint` clean (biome)
- [ ] All public functions exported via
      `packages/recommender/src/index.ts` are typed; no implicit `any`
- [ ] No format ID hardcoded outside `prompt.ts` format-keyed sections
      / data files
- [ ] `recommender` depends on `@pva/engine` for **types only** — no
      runtime imports from `@pva/engine` (qc-structural enforces this)
- [ ] `recommender` does NOT import `@pva/priors` or `@pva/vision` —
      it consumes their *outputs* (TeamSet, MatchupMatrix, etc.) via
      its caller, not via direct dependency
- [ ] Default `pnpm -r test` runs offline (no real Anthropic calls);
      live tests gated behind `RUN_LIVE_TESTS=1`
- [ ] `AgentRecommendation` JSON output is schema-validated; malformed
      responses raise typed `RecommenderError`
- [ ] Every `KeyThreat.opp` / `bring` / `lead` / `back` species name
      matches a Showdown-canonical species ID
- [ ] PR body describes what changed, why, and the test plan
- [ ] PR diff respects 500-LOC soft cap; document why if exceeded
- [ ] `dev/status/recommender.md` updated with current state, blocking
      refactors, and follow-ups

## Status file format — `dev/status/recommender.md`

```markdown
## Last updated: YYYY-MM-DD
## Status
NOT_STARTED | IN_PROGRESS | READY_FOR_REVIEW | MERGED | BLOCKED

## Current milestone
M6.5.0 — recommender package, simple slice

## Completed
(merged work for this track, with PR #s)

## In Progress
(current session work)

## Blocking refactors
(must land before downstream milestones)

## Follow-up
(non-blocking; remove on completion — backlog, not ledger)

## Known gaps
(long-horizon, informational only)
```

## Architecture constraint (load-bearing)

`recommender` depends on `@pva/engine` for **types only** (per design
doc §"Module shape" and qc-structural §A2). If a runtime call into
`@pva/engine` lands in any `recommender/src/*` file, qc-structural
fires.

`recommender` may import:
- `@pva/engine` types only (`Format`, `MatchupMatrix`,
  `OutcomeProbabilityFn`, `RankedPicks`, `SpeedRanking`, `TeamSet`).
- `@anthropic-ai/sdk` for Claude calls.
- Standard Node `process.env` access for `ANTHROPIC_API_KEY` lookup —
  scoped to `client.ts`. No `fs`, no `net` in any other file.

`recommender` does NOT:
- Import `@pva/priors` or `@pva/vision` (it's downstream of both;
  the CLI/web wires inputs through).
- Read `pva.config.ts` directly. Knobs (`anthropicModel`,
  `recommenderTimeoutMs`) are passed via `RecommendOptions` or
  defaulted in `client.ts`.
- Validate format legality. Trust inputs; that's `vision.validate`'s
  job.
- Replace `engine.score`. Score is the priming input and audit trail.

Format flows in as a parameter, end-to-end. Per-format prompt
sections live in `prompt.ts` keyed by `Format`; no
`gen9championsvgc2026regma` literal anywhere else.

## Out of scope (other tracks or follow-ups)

- `vision`: M5 — `feat-vision` (when added)
- `cli`:    M6 — `feat-cli` (when added)
- `live-capture`: M5.5 — `feat-live-capture` (when added)
- `web`:    M7 — `feat-web` (when added)
- Streaming output to UIs — recommender returns a resolved
  `AgentRecommendation` after JSON parse. Streaming is M5.5 / M7.
- Caching by input hash — out of scope for v1; revisit when CLI/web
  expose retry buttons.
- Auto-mining facts from Pikalytics / replays — `facts.ts` stays
  hand-curated through M6.5.1.
- Series-level notes wiring — M6.5.2 adds the parameter and prompt
  section; the *notes UI* is M7's web layer.

If your work would change `engine` / `priors` / `vision` / `cli` /
`web`, stop and surface it as a cross-track concern — don't widen
this PR.
