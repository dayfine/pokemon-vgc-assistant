# Showdown-Champions data snapshot

Pinned subset of `smogon/pokemon-showdown` data files. Backs the
deterministic facts-data gate (M6.5.3) — every machine-checkable
claim in `packages/recommender/src/facts.ts` (species learns move,
species has ability, item exists, etc.) is verified at CI time
against this snapshot.

## What's vendored

```
data/showdown-snapshot/
  PINNED_COMMIT.txt           # upstream SHA we currently track
  base/                       # base gen-9 data (Champions inherits)
    learnsets.ts              # ~100k lines, every species' move pool
    pokedex.ts                # species data: abilities, types, baseStats
    items.ts                  # all gen-9 items
    formats-data.ts           # tier flags
  champions/                  # `data/mods/champions/` overlay
    learnsets.ts              # mod additions / overrides
    items.ts                  # Champions-exclusive items (Mega Stones)
    formats-data.ts           # M-A tier markers
    moves.ts                  # mod move additions
```

No mod-overlay `pokedex.ts` — Champions inherits the base pokedex
unmodified. New Mega forms are pulled in via the existing base
entries.

## Type-annotation strip

Source files declare types via
`export const Foo: import('../sim/dex-species').LearnsetDataTable = {...}`.
We don't ship the Showdown sim package, so the import would dangle.
The refresh script rewrites the annotation to `: any` — data shape
unchanged, the loader (`packages/recommender/test/lib/showdown-snapshot.ts`)
re-imposes types at the seams.

## Refresh

```sh
./scripts/refresh-showdown-snapshot.sh                # uses pinned SHA
SHOWDOWN_SHA=<sha-or-ref> ./scripts/refresh-showdown-snapshot.sh
```

The script clones upstream, copies the eight files, strips type
annotations, and updates `PINNED_COMMIT.txt`. Manual cadence —
refresh deliberately when M-B research lands or upstream
announces a learnset change. Surprise upstream churn shouldn't
break our CI.

## Why pinned (not live-fetched)

CI offline-friendly. Pinned snapshot means a test failure is a
bug in our facts, not upstream churn.
