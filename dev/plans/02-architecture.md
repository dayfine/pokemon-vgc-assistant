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

Closed sheet (ranked) is the default; vision returns species only and the
priors layer expands each species into weighted candidate kits.

```
opp-preview.png ──> vision ──> OppTeamPreview
                                  (closed: 6 species)
                                  (open:   6 species + ability + item
                                           + moves + Tera)
                                    │
my-team.txt ──> @pkmn/sets ──> MyTeam (6 full sets)
                                    │
                                    ▼
priors ──> per opp species: ranked candidate kits w/ weights ──┐
           (open-sheet input collapses to one known kit per mon)│
                                                                ▼
                                            engine.matrix (full preview)
                                                                │
                                                                ▼
                                            engine.recommendBP
                                                                │
                                                                ▼
                                                          RankedPicks
                                                                │
                                                                ▼
                                            report.markdown ──> stdout
```

The matrix is computed once, up front, across kit candidates and is the
spine of the report — picks/notes both cite into it.

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
    schema.ts          # JSON schemas: ClosedSheet (species only),
                       #               OpenSheet  (full kit minus SP)
    validate.ts        # cross-check against legal-data for active format
    index.ts
  test/
    fixtures/*.png     # hand-collected previews (closed + open)
    extract.test.ts    # golden JSON per fixture
```

`extract` takes a `sheetMode: 'closed' | 'open'` parameter; default
`closed`. API key from env (`ANTHROPIC_API_KEY`). No key committed.

## Priors module shape

Priors do most of the heavy lifting under closed-sheet input — they map a
species to a ranked list of plausible full kits.

```
priors/
  src/
    pikalytics.ts      # fetch + parse Pikalytics (per-format)
    smogon.ts          # fetch + parse Smogon chaos JSON (per-format)
    cache.ts           # local fs cache w/ per-format TTL
    expand.ts          # species → KitCandidate[] (weighted)
    refine.ts          # narrow KitCandidate[] given observed facts
                       # (notes from web UI: "used Knock Off",
                       #  "Choice-locked", item revealed, etc.)
    types.ts           # KitCandidate, SpreadPrior, ItemPrior, …
    index.ts
  test/
    fixtures/*.json    # cached responses for offline tests
```

`refine` is what makes per-opp notes (M7) actionable: each new
observation prunes or reweights candidates so subsequent recomputes
converge on the real kit.

## Config

- One root config: `pva.config.ts` at repo root (or `~/.config/pva/`).
- Knobs: `format`, `sheetMode`, `priorsCacheTtl`, `claudeModel`,
  `scoreWeights`.
- All scoring weights live here, not hardcoded.

## Format rotation (built-in, not bolted on)

Champions formats rotate every few months. The architecture treats
`format` as a first-class parameter end-to-end:

- `engine.data.load(format)` returns the legal species/move/item set for
  that format. No hardcoded `gen9championsvgc2026regma` outside
  config/data files.
- `priors` caches per `(format, source)` pair. Cache key includes
  format; switching formats does not invalidate other formats' caches.
- `vision.validate` checks against the active format's legal data.
- `score.ts` weights are per-format-overridable (some formats may want
  different role priors).
- Adding M-B: drop the new format ID + data refs into config, fetch new
  Pikalytics page, ship. No code changes in `engine`/`vision`/`priors`.

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
