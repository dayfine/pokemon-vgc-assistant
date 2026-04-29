# Showdown-Champions data snapshot

Pinned subset of `smogon/pokemon-showdown` data files. Backs the
loader at `packages/showdown-data/src/index.ts`, which is consumed
by:

- `@pva/recommender` tests — the M6.5.3 facts-data gate verifies
  every machine-checkable claim in `facts.ts` against this snapshot.
- `@pva/vision` tests — extraction validation cross-checks species /
  ability / item / move legality against authoritative data.

## What's vendored

```
packages/showdown-data/snapshot/
  PINNED_COMMIT.txt           # upstream SHA we currently track
  base/                       # base gen-9 data (Champions inherits)
    learnsets.ts              # ~100k lines, every species' move pool
    pokedex.ts                # species data: abilities, types, baseStats
    items.ts                  # all gen-9 items
    formats-data.ts           # tier flags
  gen9champions/              # `data/mods/champions/` overlay
    learnsets.ts              # mod additions / overrides
    items.ts                  # Champions-exclusive items (Mega Stones)
    formats-data.ts           # M-A tier markers
    moves.ts                  # mod move additions (excluded from tsc — see below)
```

The local directory name (`gen9champions`) matches the mod-ID
naming used in format strings (`gen9championsvgc2026regma`); the
on-disk upstream directory is just `champions/` — Showdown
generates the `gen9` prefix from the mod's manifest.

No mod-overlay `pokedex.ts` — Champions inherits the base pokedex
unmodified. New Mega forms are pulled in via the existing base
entries.

## Refresh-script transforms

The refresh script applies two normalizations so the vendored files
are standalone-loadable under our strict TypeScript config:

1. **Strip type imports.** Source files declare types via
   `export const Foo: import('../sim/dex-species').LearnsetDataTable = {...}`.
   We don't ship the Showdown sim package, so the import would dangle.
   The script rewrites the annotation to `: any` — data shape
   unchanged; the loader (`src/index.ts`) re-imposes types at the
   seams.
2. **Prepend `// @ts-nocheck`.** Some entries (e.g. `items.ts`'s
   `whiteherb` hooks, `moves.ts` `onModifyMove` callbacks) carry
   runtime function bodies referencing Showdown sim types
   (`Pokemon`, `Move`, `this.queue`, `this.effectState`). Under our
   strict config those bodies don't typecheck even with the surrounding
   `: any`. We don't call any of them — the loader only reads static
   fields — so disabling type-checking on the file is the right
   escape hatch. Vendored data, not our code to type.

`gen9champions/moves.ts` is additionally excluded from tsc compilation
via `tsconfig.json` — `// @ts-nocheck` doesn't suppress every error
mode (e.g. unresolved type names in callback signatures), and we don't
read moves.ts from the loader at all. It stays on disk for future use.

## Refresh

```sh
./scripts/refresh-showdown-snapshot.sh                # uses pinned SHA
SHOWDOWN_SHA=<sha-or-ref> ./scripts/refresh-showdown-snapshot.sh
```

The script clones upstream, copies the eight files, applies the two
transforms above, and updates `PINNED_COMMIT.txt`. Manual cadence —
refresh deliberately when M-B research lands or upstream announces
a learnset change. Surprise upstream churn shouldn't break our CI.

## Why pinned (not live-fetched)

CI offline-friendly. Pinned snapshot means a test failure is a bug
in our consumers, not upstream churn.
