# priors track

## Last updated: 2026-04-27

## Status
READY_FOR_REVIEW

## Current milestone
M4.5 — threshold-probability layer

## Completed
- M4 simple slice (PR merged) — `packages/priors/` scaffolded with the
  Pikalytics AI-endpoint client, Markdown parser, item-bucketed
  KitCandidate expansion, on-disk cache with mtime-based TTL, and the
  open-sheet collapse-to-known-kit code path. Five committed fixtures
  under `test/fixtures/pikalytics/`.
- (this PR) M4.5 threshold-probability layer — `solveThreshold`
  (binary-search T1/T2 solver, ~9 calc calls per kit-pair), hand-curated
  `STAT_DISTRIBUTIONS` covering 11 M-A-legal species, `outcomeProbability`
  integrator producing `{ pOhko, pTwoHko }` cell payloads, and the
  threshold cache (kit-fingerprint + field-fingerprint composite key,
  format-stable, 30-day default TTL). 76 new tests, 97 priors tests
  passing total.

## In Progress
(none — awaiting review on M4.5 PR)

## Blocking refactors
(none)

## Follow-up
- ~~**Engine matrix-payload swap.** With `outcomeProbability` validated
  in isolation, the next slice migrates the engine matrix cell payload
  from `Matchup[]` to a real-valued representation that carries
  `OutcomeProbability` per (attacker_kit, defender_kit, move). Lives on
  the engine track, not priors. Score function then sums expected
  counts instead of binary indicators (per design doc §M4.5).~~ Shipped
  on the engine track as M3.5 (`recommendBPFromSpecies` + `KitCell`
  matrix payload). Engine takes `outcomeProbability` as an injected
  function param (`OutcomeProbabilityFn`) so the priors→engine
  types-only edge stays clean — the CLI / web layer wires
  `priors.outcomeProbability` through at call time.
- **Smogon chaos JSON** — still not published for
  `gen9championsvgc2026regma` as of 2026-04-27. `sources/smogon.ts`
  follow-up once chaos has M-A data; first plausible drop is early
  May 2026 for April data per
  `dev/research/champions-2026-04-26.md`.
- **`refine.ts`** — narrow KitCandidate[] / threshold cells given
  observed facts. Deferred to M7 with per-opp notes.
- **SP→stat conversion** — Champions uses Stat Points, not EVs. The
  M4-simple representative spreads and the M4.5 stat distributions both
  use EV-equivalent buckets; SP path is a sibling slice (M3.5/M4.0).
  Threshold solver works on raw stat numbers, so it ports to SP cleanly
  once the EV→SP boundary lands.
- ~~**`LEGAL_ABILITIES` table** — still scoped to the five M4 fixture
  species.~~ **Coverage parity restored** in the qc-followups slice
  (PR #15): added Rillaboom, Amoonguss, Dragonite, Tyranitar,
  Annihilape. Tornadus was initially included but **removed** —
  confirmed banned in M-A (Forces of Nature are Legendary; research
  doc explicitly says "All Legendaries banned"). The threshold-solver
  test fixture and one outcome-test fixture that referenced Tornadus
  were retargeted to Pelipper / Whimsicott in the same slice.
  `STAT_DISTRIBUTIONS` is now 10 species — still ≥10 per M4.5
  acceptance criteria. When `@pkmn/dex` ships gen9champions data, both
  tables collapse to a runtime lookup.
- **Distribution coverage expansion.** 11 species today; broaden to
  the full M-A top-30 once Pikalytics indices stabilise post-Indianapolis
  (Regionals 2026-05-29 will shift the meta).
- **Threshold cache eviction.** No automatic GC; the 30-day TTL
  prevents indefinite growth but doesn't prune unused entries. Add an
  `evict-stale` CLI hook in M6.

## Known gaps
- **Hardcoded format ID stays scoped to `sources/pikalytics.ts`.**
  Verified by the format-ID-not-hardcoded test in
  `stat-distributions.test.ts`; new src files (`threshold.ts`,
  `outcome.ts`, `stat-distributions.ts`) are clean.
- **`priors → engine` runtime-import decision (M4.5).** The threshold
  solver calls `@smogon/calc.calculate` directly rather than
  `engine.calc()` — the wrapper is ~10 LOC and duplicating it keeps the
  qc-structural §A2 "types-only" rule intact. If the duplication grows,
  lift to a shared util and revisit. PR body documents the call.
- Pikalytics' "Common Abilities" data is still contaminated for some
  species; M4-simple's `pickLegalAbility` heuristic remains the workaround.
