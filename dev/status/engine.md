# engine track

## Last updated: 2026-04-27

## Status
MERGED

## Current milestone
None — engine track is feature-complete for v1 through M3. Next
milestones (M4 priors, M5 vision) are owned by separate tracks. Re-open
this track only for M3 follow-ups (see below) or v2 work.

## Completed
- M1: engine skeleton + calc wrapper + 5 pinned Gen 9 calcs (PR #2, merged)
- M2: KO matrix + speed tiers + Side / StatStage explicit types (PRs #6, #7-CI)
- M3: BP scoring — `engine.score(combo, oppTeam, matrix, speed, weights) → Score`
  and `engine.recommendBP(myTeam, oppTeam, weights) → RankedPicks` (top 3 of
  C(6,4)=15). v1 scoring is dumb-but-transparent: weighted sum of (1HKO
  threats I have) + (speed control) + (defensive answers) − (1HKOs I take)
  − (role gaps). Weights live in `pva.config.ts` (new, repo root); engine
  owns the `ScoreWeights` type but never reads the file. Three hand-graded
  scenarios + four guard-semantics unit tests. (PR #8, merged.)

## In Progress
(none)

## Blocking refactors
(none)

## Follow-up
- Wire `gen9champions` mod data into `engine/src/data.ts:getGeneration()`
  once plan open Q1/Q2/Q3 are resolved (M1.5 — separate slice).
- Add a Node REPL example to README showing `engine.calc(...)` /
  `engine.matrix(...)` / `engine.recommendBP(...)` to make the
  M1/M2/M3 "done when" criteria runnable from a copy-paste.
- Speed-tie handling: `speedTiers` is a stable sort; it does *not* model
  the 50/50 coin flip. M3's `score.pickedOutspeedOpp` counts only
  strictly-faster mons — equal-effective-speed ties are not flagged in
  the score breakdown. Surface ties to the report layer (M6) so
  rationale text can call them out.
- Matrix's "all relevant moves" = every non-status move on
  `pokemon.moves`. M4 (priors) iterates over kit candidates per opp mon
  and aggregates; matrix cell payload may shift from `Matchup[]` to
  `KitCell[] = { weight, matchups }[]` per
  `dev/plans/03-priors-design.md`. Additive.
- `pva.config.ts` ships with `scoreWeights` only in M3; the other
  tunables (`format`, `sheetMode`, `priorsCacheTtl`, `claudeModel`) are
  scaffolded as TODO-typed and left to their respective milestones.

## Known gaps
- No SP→stat conversion yet; calc currently uses vanilla Gen 9 EV math.
  Champions uses SP, not EVs. Real Reg M-A calcs require the SP path.
- No M-A Mega list; calc currently has Gen 9 base Megas, not Champions'
  expanded list.
- No format-rotation test — engine is parameterized by `format` but the
  only format wired is `gen9championsvgc2026regma`. Adding a second
  format (even a stub) would force-test the format-agnostic claim.
- Speed module ignores ability-driven multipliers (Swift Swim in rain,
  Chlorophyll in sun, Sand Rush, Slush Rush, Surge Surfer, Quark Drive
  with Booster Energy, Protosynthesis). Add when those abilities show
  up in real M-A scoring scenarios; matrix already passes field state
  to `@smogon/calc` for damage purposes.
- M3 scoring uses a single concrete opp kit per mon. Set-priors
  integration (weighting score across candidate kits per opp mon)
  lands in M4.
