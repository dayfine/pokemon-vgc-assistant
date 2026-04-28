# Track index

The orchestrator reads this file at the start of every run to know which
tracks are active. Each row points to a `dev/status/<track>.md` file. New
tracks are added in the same PR that introduces their `feat-<track>.md`
agent definition.

| Track  | Status file                | Agent              | Current milestone |
|--------|----------------------------|--------------------|-------------------|
| engine | dev/status/engine.md       | feat-engine        | M1–M3 merged; idle until v2 |
| priors | dev/status/priors.md       | feat-priors        | M4 (next) — see `dev/plans/03-priors-design.md` |

## Tracks not yet started

| Track         | Will own                                      | Starts after | Design docs |
|---------------|-----------------------------------------------|--------------|-------------|
| vision        | M5 — vision input                             | M3 landed (it has; parallel-able with priors) | (sibling design doc TBD; see `dev/research/champions-ui-team-preview-2026-04-28.md` for UI implications) |
| live-capture  | M5.5 — Electron capture-card frontend         | M5 lands (vision.extract callable) | `dev/plans/04-live-capture.md`, `dev/research/champions-ui-team-preview-2026-04-28.md` |
| cli           | M6 — `pva` CLI                                | M5 lands     | — |
| web           | M7 — interactive UI                           | M6 lands     | — |
