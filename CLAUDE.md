# pokemon-vgc-assistant — AI agent instructions

This file is auto-loaded by Claude Code (and other agentic CLIs) at session
start. Read it first; it points at everything else you need.

## What this project is

A personal assistant for **Pokémon Champions VGC 2026 Reg M-A** ranked play.
Given my full team and an opponent's team-preview screenshot, recommends
which 4 of 6 to bring, surfaces likely opponent sets, and computes the
matchup matrix. Single user, public repo.

Plan, status, format research:

- `dev/plans/00-overview.md` — goals, inputs, outputs, scope
- `dev/plans/01-mvp.md` — milestones M1–M7
- `dev/plans/02-architecture.md` — package layout, dependency rules
- `dev/research/champions-2026-04-26.md` — Reg M-A snapshot
- `dev/status/_index.md` — active tracks
- `README.md` — public-facing summary + dev quickstart

## Stack

TypeScript (strict), Node 20+, pnpm workspaces, vitest, biome. No bundler.
See `dev/plans/02-architecture.md` for the package boundaries.

```sh
pnpm install --frozen-lockfile
pnpm -r build
pnpm -r test
pnpm lint
```

## Agent harness

This repo is wired to the [`agent-harness`](https://github.com/dayfine/agent-harness)
template (orchestration scaffolding for parallel agentic feature
development).

**Pinned upstream commit:** `d83147fca0ef86b765a0747a1e82f2eacb75a0b4`
(agent-harness `v0.1.0`, 2026-04-27).

The three layers, per the harness contract:

- **`reusable`** — generic harness files copied verbatim from upstream.
  Do not edit; edits cause sync drift.
- **`template`** — skeletons that consuming projects fill in (e.g.
  `feat-agent-template.md`).
- **`project`** — pva-specific (this repo only). All authority files,
  `feat-<track>.md` agents, and `dev/status/*` belong here.

### Syncing from upstream

Only `bin/agent-harness-check.sh` is vendored locally (the
`Harness Check` CI workflow runs it directly). The other harness CLI
scripts are not vendored — run them from a temp clone:

```sh
cd /tmp && git clone --depth 1 https://github.com/dayfine/agent-harness
cd ~/Projects/pokemon-vgc-assistant
sh /tmp/agent-harness/bin/agent-harness sync
```

`sync` walks `harness: reusable` files and prompts y/N/skip per drift.
Pin a specific upstream tag via `AGENT_HARNESS_TAG=v0.1.0`.

When discovering your role, read `.agents/agents/*.md` for agent
definitions and `.agents/rules/*.md` for rule files. Agent files are
tagged with their layer in the YAML frontmatter `harness:` field.

### Active agents in this repo

- `feat-engine` (project) — engine track (M2 next).

### Authority files (project)

- `.agents/rules/qc-structural-authority.md` — pva's lints, build
  gates, architecture rules. Pairs with the reusable
  `.agents/agents/qc-structural.md`.
- `.agents/rules/qc-behavioral-authority.md` — pva's domain rules,
  fixture conventions. Pairs with the reusable
  `.agents/agents/qc-behavioral.md`.

### Workflow status

- `Harness Check` (`.github/workflows/harness-check.yml`) — **enabled**;
  lints frontmatter on every PR (project layer).
- `pnpm test` (`.github/workflows/pnpm-test.yml`) — **enabled**;
  build + test + lint on push to main and on every PR.

The harness's reusable `Daily orchestrator` and `Weekly deep health
scan` workflows were intentionally removed. They were trading-system
specific (referenced a `trading-devcontainer` image, jj VCS, and the
`lead-orchestrator` / `health-scanner` agents that don't apply here).
For pva's single-developer cadence the autonomous-loop pattern
(`ScheduleWakeup` + on-demand `pva-orchestrator` runs) covers the same
use case more responsively. Re-introduce a pva-specific orchestrator
workflow only if cron-driven background runs become valuable.

## Project conventions

- **Format-agnostic by construction.** The string
  `gen9championsvgc2026regma` (and any future format ID) lives in
  config and data files only — never hardcoded in `engine/src/calc.ts`,
  `engine/src/score.ts`, etc.
- **Engine is pure.** No `fs`, `net`, `process` imports under
  `packages/engine/src`. Loading data happens at startup via
  `engine/src/data.ts`; everything else takes data as an argument.
- **Calc tests use vitest inline snapshots.** Update only when the
  underlying engine semantics change intentionally.
- **One module per PR** when possible; soft cap 500 LOC.
- **Showdown is the source of truth** for legality and damage calc;
  `@smogon/calc` for math.

## When the harness contract is in tension with the project

If a `harness: reusable` file says something that doesn't apply here
(e.g. lead-orchestrator references trading-specific paths), do not
edit the reusable file. Either:

1. Override behavior in a project-layer file, or
2. File an upstream issue against `dayfine/agent-harness` proposing a
   genericization.

Editing reusable files breaks sync semantics — that's the whole point
of the layer model.
