# priors track

## Last updated: 2026-04-27

## Status
READY_FOR_REVIEW

## Current milestone
M4 — set priors, simple

## Completed
- (this PR) M4 simple slice — `packages/priors/` scaffolded with the
  Pikalytics AI-endpoint client, Markdown parser, item-bucketed
  KitCandidate expansion, on-disk cache with mtime-based TTL, and the
  open-sheet collapse-to-known-kit code path. Five committed fixtures
  under `test/fixtures/pikalytics/`. 21 tests passing.

## In Progress
(none — awaiting review)

## Blocking refactors
(none)

## Follow-up
- After this PR lands, the engine matrix cell payload should shift from
  `Matchup[]` to `KitCell[] = { weight, matchups }[]` to carry per-kit
  contributions through to `score`. That's an engine-track follow-up
  (re-open the engine track for one slice), not a priors task.
- The five-species fixture coverage substituted **Sneasler /
  Archaludon / Garchomp** for the dispatch's originally-listed
  Iron Hands / Calyrex-Shadow / Flutter Mane. The latter three are
  banned in Reg M-A (Paradox + Restricted) so Pikalytics returns
  HTTP 404 for them under the `championspreview` slug. The
  substitutes are all top-10 species in M-A's `championspreview`
  index. Note in the design doc / agent file if future dispatches
  should pick from a format-aware species list to avoid this.
- `LEGAL_ABILITIES` in `priors/src/spreads.ts` is a static fallback
  table covering only the five fixture species. Replace with a
  `@pkmn/dex` gen9champions lookup when the mod ships (mirrors the
  same TODO already on `engine/src/data.ts`).
- Pikalytics' "Common Abilities" data is contaminated for some species
  (Whimsicott shows "Trace 0.343%", Sneasler shows "Pressure 1.763%"
  even though featured-team data clearly indicates Prankster /
  Unburden). The `pickLegalAbility` heuristic falls back to the
  species' allow-listed top ability, but a long-term fix is to weight
  Featured Teams' kits separately or email contact@pikalytics.com
  about the data quality.
- M4.5 — threshold-probability layer (binary search solver,
  per-species plausible-stat distribution). See
  `dev/plans/03-priors-design.md` §M4.5.

## Known gaps
- M-A spread data is unavailable from Pikalytics' AI endpoints (see
  `dev/research/pikalytics-2026-04-27.md`). M4-simple uses hand-curated
  representative spreads per item-bucket; M4.5 replaces this with the
  threshold-probability model.
- Smogon chaos JSON for `gen9championsvgc2026regma` not yet published.
  Add `sources/smogon.ts` as a follow-up once chaos has M-A data.
- `refine.ts` (narrow KitCandidate[] given observed facts) is deferred
  to M7 (per-opp notes), not part of M4 or M4.5.
- Champions uses Stat Points (SP), not EVs. The representative spreads
  in `spreads.ts` are EV-equivalent placeholders, per design doc Open
  Question 1. SP→stat conversion is a sibling slice (M3.5/M4.0).
