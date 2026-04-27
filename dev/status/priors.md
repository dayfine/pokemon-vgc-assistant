# priors track

## Last updated: 2026-04-27

## Status
NOT_STARTED

## Current milestone
M4 — set priors, simple (next)

## Completed
(none yet)

## In Progress
(none — track introduced 2026-04-27 with `feat-priors.md` agent and the
`dev/plans/03-priors-design.md` design doc; awaiting first dispatch)

## Blocking refactors
(none)

## Follow-up
- After M4 lands, the engine matrix cell payload should shift from
  `Matchup[]` to `KitCell[] = { weight, matchups }[]` to carry per-kit
  contributions through to `score`. That's an engine-track follow-up
  (re-open the engine track for one slice), not a priors task.

## Known gaps
- M-A spread data is unavailable from Pikalytics' AI endpoints (see
  `dev/research/pikalytics-2026-04-27.md`). M4-simple uses hand-curated
  representative spreads per item-bucket; M4.5 replaces this with the
  threshold-probability model.
- Smogon chaos JSON for `gen9championsvgc2026regma` not yet published.
  Add `sources/smogon.ts` as a follow-up once chaos has M-A data.
- `refine.ts` (narrow KitCandidate[] given observed facts) is deferred
  to M7 (per-opp notes), not part of M4 or M4.5.
