# engine track

## Last updated: 2026-04-27

## Status
MERGED

## Current milestone
None — engine track is feature-complete for v1 through M3.5. Re-open
only for further M-track follow-ups or v2 work.

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
- M3.5: matrix-payload swap to KitCells + OutcomeProbability (PR #14, merged).
  - Matrix `cells[a][d]` is `readonly KitCell[]` on both sides (each
    KitCell = `{ weight, kit, matchups }`); each `Matchup` carries
    an optional `OutcomeProbability` (`{ pOhko, pTwoHko }`). The kit-cell
    axis enumerates opp kit candidates regardless of side.
  - `score`'s `pickedKoOpp` / `oppKoPicked` / `pickedSurvivesOpp` are
    real-valued expected counts under weighted aggregation across kit
    cells. Falls back to a deterministic binary indicator when a Matchup
    has no `outcome` payload — keeps M3 ordering tests stable.
  - New entry point `recommendBPFromSpecies(gen, myTeam, oppSlots,
    weights, options)` for closed-sheet input. Existing `recommendBP`
    still accepts concrete `TeamSet` opps and reduces to the same
    KitCell shape with weight 1.0 per slot.
  - Dep direction: engine takes an injected
    `outcomeProbability: (input) => OutcomeProbability` function param
    rather than runtime-importing `@pva/priors`.
  - 22 engine tests pass (was 20). qc-behavioral noted the new
    bp-species single-kit test asserted only `toContain('Urshifu')`
    rather than deep-equal vs. the M3 path — tightened in the
    qc-followups slice to a `toEqual(rankedSummary(...))` identity
    assertion across the full RankedPicks output.

## Follow-up (engine)
- Engine M3/M3.5 scenario tests use Tornadus, Iron Hands, Calyrex-Shadow,
  and Flutter Mane on my-team / opp-team for scoring-math testing.
  Strictly these are M-A-banned (Legendary, Paradox, Restricted), but
  engine deliberately doesn't validate format — the tests pin scoring
  math, not legality. Cleanup to use M-A-legal species is a follow-up
  slice when engine adopts legality validation (likely when `@pkmn/dex`
  ships gen9champions data).
- `pickedOutspeedOpp` ignores per-kit speed deltas (Choice Scarf,
  ability-driven multipliers). Speed comparison currently uses the
  slot's `representative` Pokemon. Designed-out separately —
  see PR forthcoming for the kit-aware-speed slice.

## In Progress
(none)

## Blocking refactors
(none)

## Follow-up
- Wire `gen9champions` mod data into `engine/src/data.ts:getGeneration()`
  once plan open Q1/Q2/Q3 are resolved (M1.5 — separate slice).
- Add a Node REPL example to README showing `engine.calc(...)` /
  `engine.matrix(...)` / `engine.recommendBP(...)` /
  `engine.recommendBPFromSpecies(...)` to make the M1/M2/M3/M3.5
  "done when" criteria runnable from a copy-paste.
- Speed-tie handling: `speedTiers` is a stable sort; it does *not* model
  the 50/50 coin flip. M3's `score.pickedOutspeedOpp` counts only
  strictly-faster mons — equal-effective-speed ties are not flagged in
  the score breakdown. Surface ties to the report layer (M6) so
  rationale text can call them out.
- Multi-kit `pickedOutspeedOpp`: currently uses the opp slot's
  *representative* speed only; the kit-cell aggregator ignores per-kit
  speed variation (Choice Scarf vs. no Scarf shifts the speed tier).
  Lift to a kit-aware speed term when `recommendBPFromSpecies` callers
  pass kits with item-driven speed deltas.
- `pva.config.ts` ships with `scoreWeights` only in M3; the other
  tunables (`format`, `sheetMode`, `priorsCacheTtl`, `claudeModel`) are
  scaffolded as TODO-typed and left to their respective milestones.
- `oppKoPicked` aggregates across opp slots with `max-across-slots` to
  bound the per-pick metric in [0, 1] without assuming slot
  independence. M4.5+ may revisit if hand-graded scenarios show
  pessimistic ranking under coordinated multi-OHKO threats.

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
- M3.5 aggregation makes the simplifying assumption that opp kit
  candidates are independent across slots (Σ across opp slots is an
  expected count; we don't model joint scenarios like "if opp kit at
  slot 0 is Specs, slot 3 is more likely Sash"). Documented in
  `dev/plans/03-priors-design.md` and accepted as v1.
