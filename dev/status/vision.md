# vision track

## Last updated: 2026-04-29

## Status
READY_FOR_REVIEW (M5.0 simple slice in PR)

## Current milestone
M5.0 — vision package, simple slice

## Completed
(none yet — M5.0 in flight)

## In Progress
- **M5.0 simple slice** — scaffold `packages/vision/`. Public
  `extract(image, opts)` returns a typed `ExtractedTeamPreview`.
  Mock-driven offline tests for both sheet modes; opt-in live
  test against the existing `data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg`
  open-sheet fixture (gated on `RUN_LIVE_TESTS=1`).

  Lifts the M6.5.3 snapshot loader from
  `packages/recommender/test/helpers/showdown-snapshot.ts` into a
  new `@pva/showdown-data` workspace package so vision's validator
  (production code) and the recommender's tests can share authoritative
  data. Loader extended to walk alt-form learnsets / abilities
  (Salamence ↔ Salamence-Mega, Indeedee ↔ Indeedee-F, etc.) so kits
  with Mega-form abilities or form-specific moves validate
  correctly.

  Anthropic SDK (`^0.65.0`) reused from the recommender package as
  the only new runtime dep. `process.env` access scoped to
  `client.ts`. Format ID literals scoped to `prompt.ts`'s
  `formatLine()` and schema templates.

## Blocking refactors
(none)

## Follow-up
- **M5.0 closed-sheet fixture** — when a closed-sheet screenshot is
  collected, add `data/fixtures/champions-en-us-closed-001.jpg` (or
  similar) and a closed-sheet branch to `live.test.ts`. Mock-driven
  tests already cover both sheet modes; the live test only exercises
  open-sheet today.
- **M5.5 live-capture frontend** — Electron app that streams from a
  capture card, screenshots the team-preview moment, calls
  `vision.extract`, hands the result to the rest of the pipeline.
  Separate track once M5.0 lands. See `dev/plans/04-live-capture.md`.
- **M5.6 auto-detect + retry** — image classifier inside the
  live-capture app to recognize the team-preview screen plus an
  auto-retry path on `confidence: low`. Belongs to the live-capture
  track per the design.

## Known gaps
- **Closed-sheet screenshot not yet collected.** Mock tests cover
  the path; live test cannot exercise it until a fixture lands.
- **Bundle size.** `@pva/showdown-data` pulls ~13 MB of vendored
  data into anything depending on it (vision included). Acceptable
  for the CLI / single-developer use case; if the web UI ever needs
  client-side validation, extract a smaller derived allow-list at
  build time.
- **No retry path in v1.** `validateExtraction` throws on the first
  illegal field; the design defers retry-with-correction to a future
  milestone (M5.6 or earlier if usage demands).
