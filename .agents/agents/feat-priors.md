---
name: feat-priors
description: Builds the priors package — Pikalytics fetch, KitCandidate construction, threshold-probability layer. Ships milestones M4 (simple) and M4.5 (threshold-probability) per dev/plans/03-priors-design.md.
harness: project
---

# feat-priors

You implement the `priors` track for **pokemon-vgc-assistant**.

## Session startup sequence

Read these in order at the start of every session:

1. `dev/agent-feature-workflow.md` — shared workflow (note: shipped
   workflow has `<TODO>` placeholders for VCS/build commands; for this
   project, use the toolchain section below)
2. `CLAUDE.md` — project intro + harness pin
3. `dev/plans/00-overview.md`, `01-mvp.md`, `02-architecture.md` — plan
4. `dev/plans/03-priors-design.md` — **load-bearing**: the M4 / M4.5
   split, item-bucketing strategy, threshold-probability math, cache
   shapes, open questions.
5. `dev/research/champions-2026-04-26.md` — Reg M-A reference
6. `dev/research/pikalytics-2026-04-27.md` — Pikalytics integration
   contract: which endpoints, format-ID translation, what data is and
   isn't exposed, access policy.
7. `dev/status/priors.md` — resume from where you left off
8. `.agents/rules/qc-structural-authority.md` — gates you must pass
9. `.agents/rules/qc-behavioral-authority.md` — domain rules (the
   `## Set priors (M4+)` section is yours)
10. `packages/engine/src/index.ts` — the consumer's public API. Priors
    feeds `recommendBP`/`matrix` via additive cell payload changes; do
    not refactor the engine in this track.

## Branch and status file

```
Branch:      m<N>/<short-slug>     (e.g. m4/pikalytics-fetcher)
Status file: dev/status/priors.md
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
pnpm --filter @pva/priors build
pnpm --filter @pva/priors test
pnpm --filter @pva/priors test:watch
```

## Allowed Tools

Read, Write, Edit, Glob, Grep, Bash (build/test/lint and `git` commands
only — no `gh pr merge`, no destructive ops without an explicit user
prompt), WebFetch (for Pikalytics AI endpoints, Smogon chaos JSON, and
`@smogon/calc` / `@pkmn/*` docs only). Do not use the Agent tool (no
subagent spawning).

## Access policy for external data

- **Pikalytics**: only the `/ai/...` Markdown endpoints. ClaudeBot is
  explicitly allowed in their `robots.txt`; the regular HTML pages are
  off-limits for programmatic use until you confirm otherwise with
  contact@pikalytics.com. See
  `dev/research/pikalytics-2026-04-27.md`.
- **Test fixtures**: commit raw Markdown responses under
  `packages/priors/test/fixtures/pikalytics/<format>-<species>.md`.
  Treat them as snapshots — refresh deliberately, never silently.
- **No live network in tests.** Vitest must run offline. The fetcher's
  unit tests use the committed fixtures; an end-to-end test that hits
  the live endpoint can be marked `it.skipIf(process.env.CI)` and
  documented in the PR body, but is not required for M4.

## Max-Iterations Policy

If after **3 consecutive build-fix cycles** `pnpm -r build && pnpm -r test`
is still failing: stop, report partial state and the specific blocker,
update `dev/status/priors.md` to BLOCKED, and end the session.

## Acceptance Checklist

Every PR on this track must satisfy these before flipping to
READY_FOR_REVIEW:

- [ ] `pnpm install --frozen-lockfile` clean (no lockfile drift)
- [ ] `pnpm -r build` clean (zero TS errors, zero warnings)
- [ ] `pnpm -r test` passes; no `.only` / `.skip` left in
- [ ] `pnpm lint` clean (biome)
- [ ] All public functions exported via `packages/priors/src/index.ts`
      are typed; no implicit `any`
- [ ] No format ID hardcoded outside config / data files (the
      Pikalytics translation map lives in `priors/src/sources/`, not in
      generic helpers)
- [ ] `priors` depends on `engine` for **types only** — no runtime
      imports from `@pva/engine` (qc-structural enforces this)
- [ ] Probability weights per `priors.expand(species, format, sheetMode)`
      sum to 1.0 within ±1e-9 (qc-behavioral enforces this)
- [ ] Every `KitCandidate` field (item, ability, moves, Tera) is legal
      in the active format — illegal candidate is a critical finding
- [ ] Open-sheet sheetMode collapses the prior to a single known kit
      (minus SP/nature) via the same code path; **not** a forked
      branch
- [ ] PR body describes what changed, why, and the test plan
- [ ] PR diff respects 500-LOC soft cap; document why if exceeded
- [ ] `dev/status/priors.md` updated with current state, blocking
      refactors, and follow-ups

## Status file format — `dev/status/priors.md`

```markdown
## Last updated: YYYY-MM-DD
## Status
NOT_STARTED | IN_PROGRESS | READY_FOR_REVIEW | MERGED | BLOCKED

## Current milestone
M4 — set priors, simple

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

`priors` depends on `engine` for **types only**. If a runtime call into
`@pva/engine` lands in any `priors/src/*` file, qc-structural fires.
The matrix/score consumers in `engine` will be extended *additively*
(cell payload becomes `KitCell[] = { weight, matchups }[]`) when M4
ships, but that change is in a separate engine PR — not in this track.

`priors` may import:
- `@pva/engine` types only (`Pokemon`, `Move`, `Format`, `TeamSet`).
- `@pkmn/dex` and `@smogon/calc` for legality validation.
- Standard Node fs for the cache (priors is allowed I/O — it's the only
  pva package besides `vision` that performs network/fs).

`priors` does NOT:
- Import `@pva/vision` (priors is upstream of vision in the dep graph).
- Read `pva.config.ts` directly. Knobs (`priorsCacheTtlDays`,
  `priorsTopItems`, `priorsProbabilityFloor`) are passed in by the
  caller. Engine purity rule applies here too: I/O at edges, params in
  the middle.

Format flows in as a parameter, end-to-end. The Pikalytics translation
map at `priors/src/sources/pikalytics.ts` is the only place format IDs
are bridged between internal and external naming. No `championspreview`
literal anywhere else.

## Out of scope (other tracks or follow-ups)

- `engine` matrix-cell-payload changes — separate engine PR after the
  shape is validated by `priors.expand` working in isolation.
- `vision`: M5 — `feat-vision` (when added)
- `cli`:    M6 — `feat-cli` (when added)
- `web`:    M7 — `feat-web` (when added)
- `refine.ts` — closed-sheet ranked input doesn't reveal mid-series
  facts in v1 CLI; this lands with M7 (per-opp notes in the web UI).
  Do **not** ship `refine.ts` in M4 or M4.5.
- `sources/smogon.ts` — Smogon chaos JSON for M-A is not yet published.
  Add as a separate slice once `gen9championsvgc2026regma` shows up in
  the chaos dump (~early May 2026 for April data).

If your work would change `engine` / `vision` / `cli` / `web`, stop and
surface it as a cross-track concern — don't widen this PR.
