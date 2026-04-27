# 01 — MVP plan

## v1 success criterion

Run one command:

```
pva recommend --my my-team.txt --opp opp-preview.png
```

Get back a markdown report with:

- **Pre-computed damage preview**: full my-6 × opp-6 matrix, both
  directions, every relevant move, marked 1HKO / 2HKO / 3HKO / outsped /
  outspeeds. This is the *index* of the report — every other section
  cites cells from it. Computed once up front for all candidate kits, not
  lazily per pick.
- Top 3 BP picks (4 mons each), with one-line rationale per pick that
  references matrix cells.
- Per opp mon: 2–3 bullet "watch out" notes — likely sets (with weights),
  key threats, Mega risk if applicable. Under closed-sheet input, "likely
  sets" is the load-bearing line.

Acceptable v1 latency: <30 s per report (one vision call + matrix
pre-compute + ranking).

## Milestones

### M1 — Engine skeleton (no UI)

- Package `engine/` with stub types: `Pokemon`, `Move`, `Item`, `TeamSet`,
  `Matchup`.
- Load `gen9champions` mod data from `@pkmn/dex` (or shell out to Showdown
  data files if mod isn't published in `@pkmn/*` yet — see open question).
- Damage calc wrapper around `@smogon/calc`, parameterized for M-A
  (no Tera, Mega only).
- Tests: 5 known calcs (Incineroar Knock Off vs. Rillaboom, etc.) match
  Showdown's calc within rounding.

**Done when:** can call `engine.calc(attacker, defender, move) → DamageRange`
from a Node REPL and reproduce known values.

### M2 — KO matrix + speed tiers

- `engine.matrix(myTeam, oppTeam) → MatchupMatrix` — full grid of damage
  ranges in both directions, all relevant moves.
- `engine.speedTiers(allMons, modifiers) → SpeedRanking` — accounts for
  Tailwind, Trick Room, Choice Scarf, +1, paralysis.
- Tests: golden matrix for one well-known matchup (e.g., Miraidon vs.
  Calyrex-Shadow archetype) — pinned values, not approximations.

**Done when:** matrix + speed tiers print sensibly for a hand-typed pair
of teams.

### M3 — BP scoring

- `engine.score(combo, oppTeam, matrix, speed) → Score` — picks 4 of 6.
- v1 score is dumb but transparent: weighted sum of (1HKO threats I have)
  + (speed control) + (defensive answers) - (1HKOs I take) - (role gaps).
- `engine.recommendBP(myTeam, oppTeam) → RankedPicks` — top 3 of C(6,4)=15.
- Tests: hand-graded scenarios where the right answer is obvious (e.g.,
  4 Steel-types into a Fairy spam team should score lower than a balanced
  bring).

**Done when:** picks pass eyeball test on 3+ hand-built scenarios.

### M4 — Set priors, simple (load-bearing under closed sheet)

See `dev/plans/03-priors-design.md` for the full design and the M4 / M4.5
split rationale.

- Package `priors/` — fetch + cache Pikalytics per format via the
  `/ai/pokedex/<format>/<species>` Markdown endpoints (no HTML scraping;
  site allows ClaudeBot, see `dev/research/pikalytics-2026-04-27.md`).
- For each **species**, return `KitCandidate[]` bucketed by **item** —
  Pikalytics' AI endpoints don't expose spreads/nature/Tera, so v1
  attaches a hand-curated representative spread per item-role bucket
  (see §M4 in the design doc).
- Apply: matrix + scoring iterate over kit candidates per opp mon, weight
  outcomes by prior probability (binary 1HKO yes/no per kit in M4;
  real-valued in M4.5). Report surfaces top set(s) per mon
  ("60% Choice Band, 25% AV, 15% Sitrus") and flags decisions that flip
  across plausible kits.
- Open-sheet input collapses the prior to a single known kit (minus
  SP/nature) — same code path, narrower distribution.

**Done when:** species → ranked kit candidates feeds matrix; report shows
per-mon set distribution with weights; one Pikalytics fixture-driven
golden test passes.

### M4.5 — Threshold-probability layer

Replaces M4's binary cell payload with a probability-of-outcome model.
Per (attacker_kit, defender_kit, move, field), pre-compute the
offensive-stat threshold T₁ that guarantees a 1HKO and integrate against
a coarse hand-curated plausible-stat distribution per species. Same
matrix shape, real-valued cells; `score` reads expected-count
contributions instead of binary ones.

See `dev/plans/03-priors-design.md` §M4.5 for the math, the threshold
solver options, and the cache shape.

**Done when:** thresholds cached per (kit-pair, move, field); plausible
stat distributions for ≥10 hand-curated species; `recommendBP` ordering
is stable through the binary→real-valued migration.

### M5 — Vision input

- Package `vision/` — given opp team-preview screenshot, return 6
  `OppMonPreview` records.
- Default mode (ranked, closed sheet): species only.
- Open-sheet mode (tournament input): species + ability + item + moves +
  Tera. Same pipeline, richer schema.
- Use Claude vision API. Prompt with field schema; parse JSON response.
- Validation: every extracted field must exist in `gen9champions` legal
  data; reject + retry on invalid extraction.
- Tests: 5 hand-collected ranked screenshots (species only) + 2
  open-sheet screenshots, golden expected JSON.

**Done when:** screenshot → JSON works on closed-sheet fixtures + 1 live
ranked game; open-sheet path has at least one passing fixture.

### M6 — CLI glue

- Package `cli/` — `pva recommend --my <file> --opp <png>` runs the full
  pipeline, prints markdown.
- My-team input v1: typed `.txt` in Showdown export format (parsed by
  `@pkmn/sets`).
- Add `--format` flag (default `gen9championsvgc2026regma`).

**Done when:** one command produces a usable report end-to-end.

### M7 (post-MVP) — Web UI + scenario notes

- Package `web/` — Vite + React. Engine imports as workspace dep.
- Upload screenshot, paste team, get interactive report. Toggle assumptions
  (Mega scenarios, "what if opp Choice Scarfed", weather, lead pairs).
- **Per-opp note overrides**: as the series reveals info ("Incineroar
  used Knock Off", "locked into Make It Rain"), pin those facts and
  re-narrow the prior. Notes persist per opp / session so the model
  refines across games 2 and 3 of a series.
- Recompute matrix + picks live under the refined kit distribution.

## Open questions to resolve before M1

1. Is `gen9champions` mod data available in `@pkmn/dex` / `@pkmn/data` npm
   packages, or do we need to point at the Showdown repo's
   `data/mods/gen9champions/` directly? (`@pkmn/*` updates lag Showdown
   master.)
2. Does `@smogon/calc` already understand M-A's Mega list, or do we need
   to register the Champions-exclusive Megas (Mega Meganium, Mega Greninja,
   Mega Feraligatr, …) ourselves?
3. SP → stat-line conversion: is there a published formula? If not, derive
   from in-game observation or community tools.
4. ~~Pikalytics — does it expose a structured API or do we have to scrape
   HTML? Check ToS before scraping.~~ **Resolved 2026-04-27**: use the
   `/ai/pokedex/<format>/<species>` Markdown endpoints. ClaudeBot
   explicitly allowed in `robots.txt`. Spreads / nature / Tera are not
   exposed there; M4.5 handles that with a threshold-probability layer
   (see `dev/plans/03-priors-design.md` and
   `dev/research/pikalytics-2026-04-27.md`).

## Non-goals (explicit)

- Not optimizing past "good enough". Score function will be simple and
  legible; resist ML temptations.
- Not a teambuilder.
- Not solving the "Mega bluff" metagame layer; assume opp brings their
  most-used Mega.
- No replay scraping in v1 — priors come from Pikalytics/Smogon dumps,
  not raw replays.
- Not hardcoding Reg M-A. Format is a config knob from M1; rotation to
  M-B/M-C/etc. is a data + config change, not a code rewrite.
