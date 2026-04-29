# cli track

## Last updated: 2026-04-29

## Status
NOT_STARTED — design merged, scaffolding next

## Current milestone
M6.0 — CLI scaffold + recommend (typed-team only)

## Completed
(none)

## In Progress
(none — M6.0 implementation kicks off after the design lands)

## Blocking refactors
(none)

## Follow-up
- **M6.1 markdown polish + scenario notes** — refine rendering
  based on first-week ladder use; wire `--notes` flag through to
  `recommender.recommend()`'s `notes?` parameter; add `pva replay`
  for offline re-running of saved fixtures
- **M6.2 caching** — request-hash → cached `AgentRecommendation`
  to avoid double-billing on accidental re-runs;
  `~/.cache/pva/runs/<hash>.json`; `--no-cache` and `--refresh`
  flags
- **M6.3 `pva teams import`** — once vision M5.7 (builder-screen
  vision) lands, add a CLI entry point that takes the
  12-screenshot-per-team capture set and writes a stored
  Showdown-export `.txt` to `<teamsDir>`. M6.0's `--my-team` shape
  doesn't change — only the team-creation path gets a new entry
  point

## Known gaps
- **Hand-typed teams only in v1.** Builder-screen vision (M5.7)
  is a prerequisite for vision-driven team capture; M6.0 ships
  with typed Showdown-export `.txt` files only. See
  `dev/plans/07-cli-design.md` §"User journey (v1)".
- **No live-test job in CI.** `RUN_LIVE_TESTS=1` runs locally
  against the user's API key. Wiring a `workflow_dispatch` job
  using the existing GitHub repo secret is a tracked
  follow-up — relevant once M6.0 lands and end-to-end live
  verification becomes a thing we do regularly.
- **No closed-sheet fixture screenshot.** Mock-driven tests cover
  the path; live-test path can only exercise open-sheet against
  the existing zh-TW fixture until a closed-sheet capture is
  collected.
