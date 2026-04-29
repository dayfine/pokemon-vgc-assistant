# 07 — M6: CLI design

This doc covers the `cli` track in more detail than `01-mvp.md` §M6.
Read `01-mvp.md` §M6 first. Pairs with the four upstream packages —
`engine`, `priors`, `vision`, `recommender` — which are all merged
and idle by the time CLI work starts.

## TL;DR

- Package `packages/cli/` exposes a single binary `pva` (Node script
  via `bin` in package.json).
- Primary command: `pva recommend --my-team <id|path> --opp <png>` —
  runs the full pipeline and prints a markdown report to stdout.
- **My-team is a stored asset** referenced by ID. v1 stores teams as
  Showdown-export `.txt` files in a `<teamsDir>` resolvable via flag,
  env var, XDG-style path, or repo-local fallback.
- **Opp is per-game**: a screenshot file path that vision extracts to
  species-only (closed sheet) or full kits (open sheet) on each run.
- Markdown rendering layered in the CLI itself; the recommender's
  JSON `AgentRecommendation` is the structured input.

## User journey (v1)

1. **One-time setup per team**: user types their team in Showdown
   export format and saves it as `<teamsDir>/<id>.txt`. (Builder-screen
   vision — capturing 12 screenshots per team, two per Pokémon, one
   for moves+items and one for EVs+nature — is deferred to **M5.7**
   and writes to the same `<teamsDir>` location once landed.)
2. **Per ranked game**: user screenshots the opponent's team-preview
   on the Switch and copies it locally, then runs:
   ```sh
   pva recommend --my-team charx-vgc --opp ./opp-2026-05-01-001.png
   ```
3. CLI prints a markdown report covering the BP recommendation,
   per-opp threat notes, lead scenarios.
4. (M7 territory) — user pastes notes from earlier games of a series
   into a re-run; recommender's `notes?` parameter narrows the prior.

## CLI surface

```
pva recommend
  --my-team <id-or-path>      required; team ID or path to .txt
  --opp <png-path>            required; path to opp team-preview screenshot
  --format <format-id>        default: gen9championsvgc2026regma
  --sheet-mode <closed|open>  default: closed
  --teams-dir <path>          override the team-storage lookup
  --json                      emit raw AgentRecommendation JSON instead of markdown
  --notes <line>...           optional series-level notes (repeatable)
  --no-vision                 skip vision; --opp must point to a stored .txt instead

pva teams list                # list known team IDs
pva teams show <id>           # print the stored team contents
pva teams validate <id>       # parse + legality-check the stored team
```

The `teams` subcommand exists so we never make the user open a JSON
or hunt down a path during a ladder session — they can sanity-check
their stored team between matches.

## My-team resolution

`--my-team <value>` accepts:

- **Path-like input** (contains `/`, `\\`, `.`, or starts with `~`):
  treat as a file path. Resolve relative paths against `cwd`. Read
  the file directly.
- **Bare ID** (alphanumerics, hyphens, underscores): resolve to
  `<teamsDir>/<id>.txt`.

`<teamsDir>` resolution order, first match wins:

1. `--teams-dir <path>` flag
2. `$PVA_TEAMS_DIR` env var
3. `$XDG_CONFIG_HOME/pva/teams/` if `$XDG_CONFIG_HOME` is set
4. `~/.config/pva/teams/`
5. `./teams/` (repo-local fallback for dev / first-run)

Missing teams emit a clear "no team found at `<resolved-path>`; place
a Showdown-export `.txt` there or pass `--my-team <path>`" rather
than a generic file-not-found.

## Storage format

**Showdown export** parsed by `@pkmn/sets`. Already what the project
plan calls for, and it round-trips through Showdown's web damage
calc and other community tools without a custom schema.

```
Charizard @ Charizardite X
Ability: Blaze
Level: 50
EVs: 252 Atk / 4 Def / 252 Spe
Adamant Nature
- Dragon Dance
- Flare Blitz
- Dragon Claw
- Protect

Tyranitar @ Tyranitarite
...
```

A team file is **6 sets** separated by blank lines. The CLI rejects
files with anything else (5 mons, 7 mons, malformed sets) and points
the user at the offending line.

`pva teams validate <id>` cross-checks every kit against the
`@pva/showdown-data` snapshot — same legality engine vision uses.

## Pipeline shape

Per the architecture doc, CLI is the *only* package that depends on
all of `engine`, `priors`, `vision`, `recommender` simultaneously.

```
recommend()
  ├─ load my-team           (@pkmn/sets parser → engine TeamSet)
  ├─ vision.extract(opp)    (closed-sheet: species-only; open: full kits)
  ├─ priors.expand(opp)     (per-species kit candidates with weights)
  ├─ engine.matrix(my, opp) (full damage grid both directions)
  ├─ engine.speedTiers(...)  (speed-control aware)
  ├─ engine.recommendBP(...) (top-N picks + breakdown)
  ├─ recommender.recommend(...)
  │    (Anthropic call wrapping the deterministic baseline)
  └─ render(rec)             (markdown — CLI-side, not in recommender)
```

Each upstream package already ships with its public API stable;
the CLI is glue + I/O.

## Markdown rendering

Stays in `packages/cli/`, not in recommender. Reasons:

- The recommender's job is to produce structured `AgentRecommendation`
  JSON — that's what the M7 web UI will consume directly without
  re-rendering.
- Markdown is presentation; presentation belongs to the consumer.
- Different CLI flags want different shapes (verbose, short, JSON).

Renderer takes the inputs the recommender already fed on (matrix +
speed + score baseline) plus the recommendation, and emits sections:

- **Bring** — the picked 4-of-6 with a one-line rationale per pick
- **Lead** + **back**
- **Win condition** — the recommender's `primaryWinCondition`
- **Key opp threats** — bullet list with rationale per threat
- **Lead scenarios** — expandable per scenario
- **Damage matrix** — full grid (collapsible in M7's web UI; just
  printed in the CLI)
- **Confidence** + **deviation rationale** when it differs from the
  deterministic top-1

## Phases

### M6.0 — CLI scaffold + recommend (typed-team only)

- Package `packages/cli/` skeleton mirroring the recommender pattern.
- `pva recommend --my-team <id|path> --opp <png>` end-to-end.
- `pva teams list` / `show` / `validate`.
- My-team is **typed Showdown-export `.txt`** only (no builder
  vision yet).
- Mock-driven offline tests for the orchestration: stub vision (or
  pass a recorded fixture image + recorded recommender response),
  walk the pipeline, assert markdown output.
- Live opt-in test (`RUN_LIVE_TESTS=1`) that hits both the Vision
  and recommender APIs against a committed fixture screenshot —
  same opt-in pattern recommender and vision use.

**Done when**: `pva recommend` against the 2026-04-28 experiment
fixture (typed my-team + the zh-TW opp screenshot) produces a
markdown report end-to-end.

### M6.1 — Markdown polish + scenario notes

- Refine the markdown rendering based on first-week ladder use.
- Wire `--notes` flag through to `recommender.recommend()`'s
  `notes?` parameter.
- Add `pva replay` for offline re-running of a saved fixture (handy
  for prompt-tuning iterations on the recommender side).

### M6.2 — Caching

- Per-call request hash → cached `AgentRecommendation` so an
  accidental re-run doesn't re-bill the API. Cache key:
  `(my-team, opp-team-extraction, format, sheetMode, notes)` →
  `~/.cache/pva/runs/<hash>.json`.
- `--no-cache` and `--refresh` flags.

### M6.3 — `pva teams import` (deferred)

When **M5.7 builder-screen vision** lands (separate vision-track
follow-up), add `pva teams import --from <png>...` that takes the
12-screenshot-per-team capture set and writes a stored
Showdown-export `.txt`. M6's `--my-team` shape doesn't change; only
the team-creation path gets a new entry point.

## Out of scope (v1)

- **Interactive editing** of stored teams from the CLI — users edit
  the `.txt` files directly in their preferred editor.
- **Multi-format teams** — one `.txt` per team per format. If two
  formats need the same kit, make two team files (`charx-ma.txt`,
  `charx-mb.txt`).
- **Live capture-card integration** — that's M5.5 and a separate
  Electron app.
- **Bo3 series tracking** — the `notes` parameter is the only series
  affordance in v1; the actual series state-machine (game 1 → game 2
  → game 3) belongs to M7's web UI.
- **Auto-detection of sheet mode** — caller sets `--sheet-mode`
  explicitly. Auto-detect lives in M5.6.

## Dependencies

- `@pva/engine` — types + runtime calls (this is the only package
  besides `web` that depends on engine at runtime per architecture).
- `@pva/priors` — runtime; expand-by-species.
- `@pva/vision` — runtime; opp screenshot extraction.
- `@pva/recommender` — runtime; the orchestrating LLM call.
- `@pkmn/sets` — parses the Showdown-export `.txt` storage format.
- Node stdlib only beyond that — no extra runtime deps for the CLI
  glue.

## Open questions to resolve before M6.0

1. **Argument parsing**: hand-roll, `commander`, `yargs`, or
   `mri`? The CLI surface is small (~3 subcommands × handful of
   flags). Lean toward `mri` (1.4 KB) or hand-rolled — adding a
   parser dep for ~3 commands is overkill. Decision logged in the
   M6.0 PR.
2. **Output format default**: markdown (default) or JSON? Markdown
   reads better in a terminal; JSON is what the M7 UI will pipe.
   v1 default is markdown; `--json` opts into the structured shape.
3. **Closed-sheet fixture for tests**: needed for the closed-sheet
   end-to-end test path in M6.0. Either reuse the open-sheet fixture
   with `--sheet-mode closed` (artificial — the screenshot still
   shows full kits) or wait for a real closed-sheet capture. Decision
   logged in M6.0; mock-driven tests cover both modes regardless.
