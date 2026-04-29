# Track index

The orchestrator reads this file at the start of every run to know which
tracks are active. Each row points to a `dev/status/<track>.md` file. New
tracks are added in the same PR that introduces their `feat-<track>.md`
agent definition.

| Track       | Status file                | Agent            | Current milestone |
|-------------|----------------------------|------------------|-------------------|
| engine      | dev/status/engine.md       | feat-engine      | M1–M3 + M3.5 + kit-aware-speed merged; idle until v2 |
| priors      | dev/status/priors.md       | feat-priors      | M4 + M4.5 merged; idle until v2. See `dev/plans/03-priors-design.md` |
| recommender | dev/status/recommender.md  | feat-recommender | M6.5.0–M6.5.3 + M6.5.2 merged; track complete for v1 scope. See `dev/plans/06-recommender-design.md` |
| vision      | dev/status/vision.md       | feat-vision      | M5.0 — vision package, simple slice (IN_PROGRESS). See `dev/plans/05-vision-design.md` |

## Tracks not yet started

| Track         | Will own                                      | Starts after | Design docs |
|---------------|-----------------------------------------------|--------------|-------------|
| live-capture  | M5.5 — Electron capture-card frontend         | M5 lands (vision.extract callable) | `dev/plans/04-live-capture.md`, `dev/research/champions-ui-team-preview-2026-04-28.md` |
| cli           | M6 — `pva` CLI                                | M5 lands     | — |
| web           | M7 — interactive UI                           | M6 lands     | — |
