# engine track

## Last updated: 2026-04-26

## Status
IN_PROGRESS

## Current milestone
M2 — KO matrix + speed tiers

## Completed
- M1: engine skeleton + calc wrapper + 5 pinned Gen 9 calcs (PR #2, merged)

## In Progress
(none — M2 not yet started)

## Blocking refactors
(none)

## Follow-up
- Wire `gen9champions` mod data into `engine/src/data.ts:getGeneration()`
  once plan open Q1/Q2/Q3 are resolved (M1.5 — could be folded into M2 or
  done as a separate slice).
- Add a Node REPL example to README showing `engine.calc(...)` to make
  the M1 "done when" criterion runnable from a copy-paste.

## Known gaps
- No SP→stat conversion yet; calc currently uses vanilla Gen 9 EV math.
  Champions uses SP, not EVs. Real Reg M-A calcs require the SP path.
- No M-A Mega list; calc currently has Gen 9 base Megas, not Champions'
  expanded list.
- No format-rotation test — engine is parameterized by `format` but the
  only format wired is `gen9championsvgc2026regma`. Adding a second
  format (even a stub) would force-test the format-agnostic claim.
