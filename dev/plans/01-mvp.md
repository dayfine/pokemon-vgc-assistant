# 01 — MVP plan

## v1 success criterion

Run one command:

```
pvg recommend --my my-team.txt --opp opp-preview.png
```

Get back a markdown report with:

- Top 3 BP picks (4 mons each), with one-line rationale per pick.
- Per-matchup table: my 6 × opp 6, marked with 1HKO / 2HKO / outsped /
  outspeeds, both directions.
- Per opp mon: 2–3 bullet "watch out" notes (likely SP spread, key threats,
  Mega risk if applicable).

Acceptable v1 latency: <30 s per report (one vision call + N calc runs).

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

### M4 — Set priors

- Package `priors/` — fetch + cache Pikalytics (or Smogon chaos JSON when
  available) per format.
- For each species, return top-N (SP spread, nature, ability, item, moves)
  combos with probability weights.
- Apply: when opp set is fully known (open sheet) but SP/nature not, use
  priors to pick most likely spread for calc. Surface uncertainty in
  report ("75% Bulky AV, 20% Offensive, 5% other").

**Done when:** priors layer plugs into calc, report shows confidence.

### M5 — Vision input

- Package `vision/` — given opp team-preview screenshot, return 6
  `OppMonPreview` records (species, ability, item, moves, Tera).
- Use Claude vision API. Prompt with field schema; parse JSON response.
- Validation: every extracted field must exist in `gen9champions` legal
  data; reject + retry on invalid extraction.
- Tests: 5 hand-collected screenshots, golden expected JSON.

**Done when:** screenshot → JSON works on test fixtures + 1 live game.

### M6 — CLI glue

- Package `cli/` — `pvg recommend --my <file> --opp <png>` runs the full
  pipeline, prints markdown.
- My-team input v1: typed `.txt` in Showdown export format (parsed by
  `@pkmn/sets`).
- Add `--format` flag (default `gen9championsvgc2026regma`).

**Done when:** one command produces a usable report end-to-end.

### M7 (post-MVP) — Web UI

- Package `web/` — Vite + React. Engine imports as workspace dep.
- Upload screenshot, paste team, get interactive report. Toggle assumptions
  (Mega scenarios, "what if opp Choice Scarfed", weather).

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
4. Pikalytics — does it expose a structured API or do we have to scrape
   HTML? Check ToS before scraping.

## Non-goals (explicit)

- Not optimizing past "good enough". Score function will be simple and
  legible; resist ML temptations.
- Not a teambuilder.
- Not solving the "Mega bluff" metagame layer; assume opp brings their
  most-used Mega.
- No replay scraping in v1 — priors come from Pikalytics/Smogon dumps,
  not raw replays.
