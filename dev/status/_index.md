# Track index

The orchestrator reads this file at the start of every run to know which
tracks are active. Each row points to a `dev/status/<track>.md` file. New
tracks are added in the same PR that introduces their `feat-<track>.md`
agent definition.

| Track  | Status file                | Agent              | Current milestone |
|--------|----------------------------|--------------------|-------------------|
| engine | dev/status/engine.md       | feat-engine        | M1–M3 merged; idle until v2 |

## Tracks not yet started

| Track   | Will own                              | Starts after | Design docs |
|---------|---------------------------------------|--------------|-------------|
| priors  | M4 — set priors (simple) + M4.5 — threshold-probability layer | M3 landed (it has) | `dev/plans/03-priors-design.md`, `dev/research/pikalytics-2026-04-27.md` |
| vision  | M5 — vision input                     | M3 landed (it has; parallel-able with priors) | — |
| cli     | M6 — `pva` CLI                        | M5 lands     | — |
| web     | M7 — interactive UI                   | M6 lands     | — |
