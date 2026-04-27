# engine track

## Last updated: 2026-04-27

## Status
READY_FOR_REVIEW

## Current milestone
M2 — KO matrix + speed tiers

## Completed
- M1: engine skeleton + calc wrapper + 5 pinned Gen 9 calcs (PR #2, merged)

## In Progress
- M2: `engine.matrix(myTeam, oppTeam) → MatchupMatrix` + `engine.speedTiers`
  with Tailwind / Trick Room / Choice Scarf / boost / paralysis modifiers.
  Hardened `engine.calc` so 0-damage matchups (type immunities) return a
  clean `{ min: 0, max: 0, notation: 'no damage' }` cell instead of
  letting `kochance()` throw — required so the matrix can iterate every
  move on a set without the caller pre-filtering immunities.
  Pinned golden matrix snapshot for a Calyrex-Shadow + Incineroar vs.
  Miraidon + Flutter Mane archetype matchup at L50, doubles, Electric
  Terrain.

## Blocking refactors
(none)

## Follow-up
- Wire `gen9champions` mod data into `engine/src/data.ts:getGeneration()`
  once plan open Q1/Q2/Q3 are resolved (M1.5 — separate slice).
- Add a Node REPL example to README showing `engine.calc(...)` /
  `engine.matrix(...)` to make the M1/M2 "done when" criteria runnable
  from a copy-paste.
- Speed-tie handling: `speedTiers` is a stable sort; it does *not* model
  the 50/50 coin flip. Surface ties to the report layer when M3 lands so
  rationale text can call them out.
- Matrix's "all relevant moves" = every non-status move on
  `pokemon.moves`. Once `priors` lands (M4), iterate over kit candidates
  per opp mon and aggregate; matrix shape is already cell-list-of-moves
  so the change is additive.

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
