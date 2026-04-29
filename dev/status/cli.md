# cli track

## Last updated: 2026-04-29

## Status
READY_FOR_REVIEW — M6.0b in PR (closed-sheet via priors)

## Current milestone
M6.0b — closed-sheet via priors expansion

## Completed
- **M6.0 simple slice** (PR #36) — scaffold `packages/cli/`. `pva`
  binary with `pva recommend --my-team <id|path> --opp <png>`
  running the full pipeline end-to-end (open-sheet) and
  `pva teams list/show/validate` for stored-team management.
  Hand-rolled arg parser; markdown rendering CLI-side. My-team
  resolves via the `<teamsDir>` lookup chain. Storage is
  Showdown-export `.txt` parsed by `@pkmn/sets`. 34 cli tests
  cover args parsing, my-team resolution chain, Showdown-export
  parsing, full orchestration (mocked vision + recommender, real
  engine), markdown rendering. Closed-sheet input rejected with a
  typed error pointing at M6.0b.

## In Progress
- **M6.0b closed-sheet via priors** — wire `@pva/priors`'s
  `expand({ sheetMode: 'closed', data })` into the orchestrator
  so closed-sheet vision (species-only opp) becomes usable. New
  `src/priors.ts` PriorsClient injection seam wraps
  `priors.fetchPikalytics` + cache layer (default cache root
  `~/.cache/pva/priors`, 7-day TTL). New
  `src/teams/from-vision-closed.ts` builds `OppSlotPriors[]`:
  per-species expansion, highest-weight kit picked as
  representative, full distribution kept for the matrix. Closed
  branch uses `engine.recommendBPFromSpecies`; open branch
  remains on `recommendBP`. Offline test stubs `PriorsClient`
  with synthetic per-species data so the orchestrator unit test
  exercises the closed path without touching the network.

## Blocking refactors
(none)

## Follow-up
- **M6.1 markdown polish + scenario notes** — refine rendering
  based on first-week ladder use; `--notes` flag is already wired
  through to the recommender — M6.1 adds `pva replay` for offline
  re-running of saved fixtures
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
