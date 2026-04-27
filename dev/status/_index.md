# Track index

The orchestrator reads this file at the start of every run to know which
tracks are active. Each row points to a `dev/status/<track>.md` file. New
tracks are added in the same PR that introduces their `feat-<track>.md`
agent definition.

| Track  | Status file                | Agent              | Current milestone |
|--------|----------------------------|--------------------|-------------------|
| engine | dev/status/engine.md       | feat-engine        | M2 (next)         |

## Tracks not yet started

| Track   | Will own           | Starts after |
|---------|--------------------|--------------|
| priors  | M4 — set priors    | M3 lands     |
| vision  | M5 — vision input  | M3 lands (parallel-able with priors) |
| cli     | M6 — `pva` CLI     | M5 lands     |
| web     | M7 — interactive UI| M6 lands     |
