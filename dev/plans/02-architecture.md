# 02 — Architecture

## Stack

- **Language**: TypeScript (strict). Node 20+.
- **Package manager**: pnpm (workspaces).
- **Test**: vitest.
- **Lint/format**: biome (one tool, fast).
- **Build**: tsc per package; no bundler in v1.

Rationale for TS: the calc + game-data ecosystem (`@smogon/calc`,
`@pkmn/dex`, `@pkmn/sets`, Showdown source) is all TS/JS. Any other
language means re-binding it.

## Monorepo layout

```
pokemon-vgc-assistant/
  packages/
    engine/        # pure: calc, speed, score, types — no I/O
    priors/        # set/spread distribution loader (Pikalytics, Smogon)
    vision/        # screenshot → typed opp team
    cli/           # dev CLI; thin glue around engine + vision + priors
    web/           # (M7) react UI; imports engine
  data/
    cache/         # local cache of priors JSON, gitignored
    fixtures/      # test fixtures: screenshots + expected JSON
  dev/
    plans/         # this dir
    research/      # findings, format snapshots
  package.json     # workspace root
  pnpm-workspace.yaml
  biome.json
  tsconfig.base.json
```

## Package boundaries (dependency rules)

```
cli ─┬─> engine
     ├─> vision
     └─> priors

web ─┬─> engine
     ├─> vision (or browser equiv)
     └─> priors

priors ──> engine (types only)
vision ──> engine (types only)
engine ──> (no internal deps)
```

`engine` is the only package both `vision` and `priors` depend on, and
only for shared types (`Pokemon`, `TeamSet`, `MatchupMatrix`, …).
`engine` itself depends on no other workspace package — keeps it pure +
testable in isolation + re-usable.

## Data flow (v1 / CLI)

```
opp-preview.png ──> vision ──> OppTeamPreview (6 mons, full kit minus SP)
                                    │
my-team.txt ──> @pkmn/sets ──> MyTeam (6 full sets)
                                    │
                                    ▼
priors ──> SpreadPriors per opp mon ──┐
                                       ▼
                              engine.recommendBP
                                       │
                                       ▼
                                 RankedPicks
                                       │
                                       ▼
                              report.markdown ──> stdout
```

## Engine module shape

```
engine/
  src/
    types.ts           # Pokemon, Move, Item, TeamSet, OppMonPreview, ...
    data.ts            # load gen9champions data (species, moves, items)
    calc.ts            # damage calc wrapper around @smogon/calc
    speed.ts           # speed tier ranking with modifiers
    matrix.ts          # full matchup matrix
    score.ts           # scoring function for a (combo, opp, matrix)
    bp.ts              # enumerate C(6,4), score, rank
    report.ts          # MatchupMatrix + RankedPicks → markdown
    index.ts           # public API
  test/
    calc.test.ts
    speed.test.ts
    matrix.test.ts
    score.test.ts
    bp.test.ts
```

Every function in `engine` is **pure** — same inputs, same outputs, no
network, no fs. Loading data happens once at startup via `data.ts`;
everything downstream takes data as an argument.

## Vision module shape

```
vision/
  src/
    extract.ts         # screenshot → OppTeamPreview (calls Claude API)
    schema.ts          # JSON schema for vision response
    validate.ts        # cross-check against legal-data
    index.ts
  test/
    fixtures/*.png     # hand-collected previews
    extract.test.ts    # golden JSON per fixture
```

API key from env (`ANTHROPIC_API_KEY`). No key committed.

## Priors module shape

```
priors/
  src/
    pikalytics.ts      # fetch + parse Pikalytics
    smogon.ts          # fetch + parse Smogon chaos JSON
    cache.ts           # local fs cache w/ TTL
    types.ts           # SpreadPrior, ItemPrior, MoveDistribution
    index.ts
  test/
    fixtures/*.json    # cached responses for offline tests
```

## Config

- One root config: `pvg.config.ts` at repo root (or `~/.config/pvg/`).
- Knobs: `format`, `priorsCacheTtl`, `claudeModel`, `scoreWeights`.
- All scoring weights live here, not hardcoded.

## Open architecture questions

1. **Showdown data refresh**: pin a specific commit of
   `smogon/pokemon-showdown` as a git submodule, or trust `@pkmn/dex`
   release cadence? Pin gives reproducibility, submodule adds friction.
2. **SP encoding**: extend `@smogon/calc`'s stat input to accept SP, or
   convert SP → EV-equivalent at the boundary? Boundary conversion is
   simpler if conversion is lossless.
3. **Caching strategy for priors**: per-format, per-day? Per-format,
   per-week? Indianapolis 2026-05-29 will shift the meta — need flexible
   TTL.
