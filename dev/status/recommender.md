# recommender track

## Last updated: 2026-04-29

## Status
RECOMMENDER TRACK COMPLETE for v1 scope (no open PR)

All M6.5.x milestones merged. The recommender package ships the
public `recommend()` callable, 38 hand-curated facts gated against
a pinned Showdown-Champions snapshot at CI, format-rotation
handling, and the series-level `notes?` parameter wired into the
prompt. Track is idle until v2 needs (e.g. recommender-side
caching of prior runs for M7 diff display, or expanding facts
beyond ≥30 once meta data accumulates).

## Current milestone
(none — track idle)

## Completed
- **M6.5.0 simple slice** (PR #23) — scaffolded
  `packages/recommender/` per `dev/plans/06-recommender-design.md`:
  `recommend()` public entry with mocked-client + injected-client
  tests against the 2026-04-28 experiment fixture, 13 hand-curated
  facts in `facts.ts` (>= 10 floor), prompt builder with role/format/
  team/notes/matrix/baseline/task/schema sections, inline snapshot
  pinned for the role and output-schema sections, hand-rolled JSON
  schema validator with typed `RecommenderError` (`invalid-json` |
  `schema-mismatch` | `illegal-species` | `api-error`) on every
  malformed-input path, opt-in live-call test gated on
  `RUN_LIVE_TESTS=1`. Anthropic SDK (`^0.65.0`) added as the only new
  runtime dep; `process.env` access scoped to `client.ts`; format ID
  literal scoped to `prompt.ts` `FORMAT_RULES` map.
- **M6.5.1 facts expansion** (PR #25) — `facts.ts` grew from 12 to
  38 hand-curated facts and from ~21 to 38 unique M-A-legal species
  referenced across predicates. New coverage spans redirection
  (Amoonguss, Whimsicott Prankster, Gholdengo Good as Gold), weather
  (Pelipper Drizzle, Torkoal/Ninetales Drought, Alolan Ninetales
  Aurora Veil), priority blocks (Wide Guard, Quick Guard), item
  triggers (Safety Goggles, Covert Cloak, Eject Pack, Focus Sash,
  Choice-locked Knock Off trade), pseudo-legendary kits (Dragonite
  Multiscale, Salamence Aerilate, Metagross Tough Claws, Baxcalibur
  Glaive Rush, Hydreigon Levitate), and archetype recognition
  (Tatsugiri / Dondozo Commander, Body Press / Iron Defense, sun /
  Chlorophyll, Tailwind window). Format-rotation handling exercised
  via a `gen9championsvgc2026regmb`-restricted stub fact
  (`regmb-restricted-mega-list-stub`); test asserts it filters out
  under M-A and surfaces under M-B. Coverage assertions added to
  `facts.test.ts`: `FACTS.length >= 30`, `SPECIES_USED.length >= 30`
  with cross-check that every entry appears in facts source. Every
  new species/ability/item cross-checked against
  `champions-2026-04-26.md` for M-A legality.
- **M6.5.3 facts data gate** (PRs #28 + #29) — vendor a pinned
  Showdown-Champions data snapshot at `data/showdown-snapshot/`
  (base gen-9 + `gen9champions/` mod overlay,
  `PINNED_COMMIT.txt = cbe2e8b`, refreshed via
  `scripts/refresh-showdown-snapshot.sh`). Test-only loader at
  `packages/recommender/test/helpers/showdown-snapshot.ts` exposes
  `speciesLearnsMoveGen9`, `speciesHasAbility`, `itemExists`,
  `megaStoneTriggers`. Migrate 30 of 38 facts to populate
  `Fact.claims?: readonly FactClaim[]`. New table-driven gate
  `facts-claims.test.ts` iterates every claim × snapshot — 89
  generated tests, all green. Closed bug class: M6.5.1 needed
  three QC rework cycles to manually catch what's now caught
  mechanically at CI. Aurora-veil form bug (Kantonian vs Alolan
  Ninetales) surfaced during migration and fixed in PR #31.
- **M6.5.2 series-level notes** (PR #33 + earlier scaffolding) —
  `notes?: readonly string[]` parameter wired through the public
  `recommend()` signature into the prompt builder's
  "Series-level facts revealed so far" section. Plumbing landed
  during M6.5.0; M6.5.2 hardens with multi-note ordering test,
  empty-array branch test, and an inline-snapshot pin of the
  rendered section format. M7 will populate notes from the web
  UI; recommender side is complete.

## In Progress
(none)

## Blocking refactors
(none)

## Follow-up
(none for v1)
- **CI live-test job** — when M6.5.0 lands, add a workflow (or extend
  `pnpm-test.yml`) that runs the `RUN_LIVE_TESTS=1` suite on a manual
  trigger or weekly cron, with `env: ANTHROPIC_API_KEY:
  ${{ secrets.ANTHROPIC_API_KEY }}` at the job level. The repo secret
  is already configured (2026-04-28); the workflow plumbing is the
  remaining work.
- **Anthropic model default** — design doc §"Open questions" Q1
  proposes Sonnet-4.6 as the default with per-call override. Confirm
  during M6.5.0 implementation; revisit if Opus reasoning materially
  improves edge-case picks.

## Known gaps
- **Vision not landed.** Track design assumes `vision.extract` will
  feed the team-preview path, but recommender is unblocked from
  vision: it takes `TeamSet` as input regardless of source. M6.5.0
  uses fixtures directly, so vision can land in parallel.
- **Adversarial prompt resilience.** Design doc Q4 — `notes`
  parameter is user-trust input only (single-user CLI / M5.5).
  Document the threat model when M6.5.2 lands; no sanitization for
  v1.
- **Caching.** No request-hash cache in v1; repeated identical inputs
  re-call the API. Revisit when CLI/web expose retry/refresh buttons.
- **Cost ceiling.** Per-call ~$0.05–0.15; ladder use ~$0.50–1.50/month
  for a heavy single-user. No enforced budget cap; document the
  expected envelope and let the user notice.
