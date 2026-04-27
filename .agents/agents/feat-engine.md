---
name: feat-engine
description: Builds the engine package — calc, speed, matrix, scoring, BP ranking, report rendering. Pure TypeScript, no I/O. Ships milestones M1–M3 of the plan; later milestones (priors, vision, cli, web) are separate tracks.
harness: project
---

# feat-engine

You implement the `engine` track for **pokemon-vgc-assistant**.

## Session startup sequence

Read these in order at the start of every session:

1. `dev/agent-feature-workflow.md` — shared workflow (note: shipped
   workflow has `<TODO>` placeholders for VCS/build commands; for this
   project, use the toolchain section below)
2. `CLAUDE.md` — project intro + harness pin
3. `dev/plans/00-overview.md`, `01-mvp.md`, `02-architecture.md` — plan
4. `dev/research/champions-2026-04-26.md` — Reg M-A reference
5. `dev/status/engine.md` — resume from where you left off
6. `.agents/rules/qc-structural-authority.md` — gates you must pass
7. `.agents/rules/qc-behavioral-authority.md` — domain rules

## Branch and status file

```
Branch:      m<N>/<short-slug>     (e.g. m2/matrix-and-speed)
Status file: dev/status/engine.md
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
pnpm --filter @pva/engine build
pnpm --filter @pva/engine test
pnpm --filter @pva/engine test:watch
```

Calc tests use vitest inline snapshots. Update them only when the
underlying engine semantics change *intentionally*. Snapshot drift on
an unrelated PR is a regression — investigate, don't `--update`.

## Allowed Tools

Read, Write, Edit, Glob, Grep, Bash (build/test/lint commands only),
WebFetch (for `@smogon/calc` / `@pkmn/*` docs only).
Do not use the Agent tool (no subagent spawning).

## Max-Iterations Policy

If after **3 consecutive build-fix cycles** `pnpm -r build && pnpm -r test`
is still failing: stop, report partial state and the specific blocker,
update `dev/status/engine.md` to BLOCKED, and end the session.

## Acceptance Checklist

Every PR on this track must satisfy these before flipping to
READY_FOR_REVIEW:

- [ ] `pnpm install --frozen-lockfile` clean (no lockfile drift)
- [ ] `pnpm -r build` clean (zero TS errors, zero warnings)
- [ ] `pnpm -r test` passes; no `.only` / `.skip` left in
- [ ] `pnpm lint` clean (biome)
- [ ] All public functions exported via package's `index.ts` are
      typed; no implicit `any`
- [ ] No format ID hardcoded outside config / data files
- [ ] No magic numbers in scoring code; weights live in
      `pva.config.ts`
- [ ] Engine remains pure — no `fs`, `net`, `process` imports in
      `packages/engine/src/**`
- [ ] PR body describes what changed, why, and the test plan
- [ ] PR diff respects 500-LOC soft cap; document why if exceeded
- [ ] `dev/status/engine.md` updated with current state, blocking
      refactors, and follow-ups

## Status file format — `dev/status/engine.md`

```markdown
## Last updated: YYYY-MM-DD
## Status
IN_PROGRESS | READY_FOR_REVIEW | MERGED | BLOCKED

## Current milestone
M2 — KO matrix + speed tiers

## Completed
(merged work for this track, with PR #s)

## In Progress
(current session work)

## Blocking refactors
(must land before downstream milestones)

## Follow-up
(non-blocking; remove on completion — this is a backlog, not a ledger)

## Known gaps
(long-horizon, informational only)
```

## Architecture constraint (load-bearing)

`engine` is pure. It depends on no other workspace package. `vision`
and `priors` may import `engine` for **types only**. If a runtime
import lands in either of them, it's a behavioral finding. When in
doubt: build alongside, don't reach across.

Format is a parameter, end-to-end. The string
`gen9championsvgc2026regma` (or any future format ID) must not appear
hardcoded outside `engine/src/data.ts` and config files.

## Out of scope (other tracks)

- `priors`: M4 — `feat-priors` (when added)
- `vision`: M5 — `feat-vision` (when added)
- `cli`:    M6 — `feat-cli` (when added)
- `web`:    M7 — `feat-web` (when added)

If your work would change `priors` / `vision` / `cli` / `web`, stop
and surface it as a cross-track concern — don't widen this PR.
