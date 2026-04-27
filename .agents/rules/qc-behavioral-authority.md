---
name: qc-behavioral-authority
description: Project-specific behavioral-review authority for pokemon-vgc-assistant. Domain rules and correctness criteria that qc-behavioral enforces.
harness: project
---

# QC Behavioral Authority — pokemon-vgc-assistant

This file is the project-specific complement to `.agents/agents/qc-behavioral.md`.
The reusable agent file describes the review protocol; this file lists the
domain checks.

## Authoritative references

- **Plan**: `dev/plans/00-overview.md`, `dev/plans/01-mvp.md`,
  `dev/plans/02-architecture.md` — goals, milestones, stack.
- **Format snapshot**: `dev/research/champions-2026-04-26.md` — Reg M-A
  legality, mechanics (Mega only, no Tera, SP not EV).
- **Game data source of truth**: `smogon/pokemon-showdown`
  `data/mods/gen9champions/`. Anything contradicting Showdown is wrong.
- **Damage calc source of truth**: `@smogon/calc` (the same engine
  Showdown's web damage calculator runs on).

## Format-agnostic engine — load-bearing invariant

The engine ships M-A first but every layer must accept `format` as a
parameter. Adding M-B/M-C is a config + data change, not a code change.
A behavioral finding fires when:

- A new helper hardcodes a format ID, Mega list, or species list.
- A test fixture references "M-A" in code instead of via config.
- A scoring weight is tuned for M-A's metagame and not gated by format.

## Damage-calc correctness

The `engine.calc` wrapper around `@smogon/calc` must:

1. Pass through `field` (gameType, weather, terrain) without dropping
   parameters. Spread-move halving in doubles is the canary — if a
   doubles spread move returns the singles range, the wrapper is broken.
2. Preserve item / ability / nature / SP-spread inputs. Silent defaults
   (e.g. EVs zeroed when not provided) are a finding — opt-in, not
   opt-out.
3. Return `min`/`max`/`koChance`/`notation` consistent with what
   Showdown's web calc shows for the same inputs. Spot-check on every
   calc-touching PR.

## Set priors (M4+)

When `priors` lands, behavioral checks include:

- Probability weights per species sum to 1.0 within rounding.
- Item/ability/move sets in returned candidates must be *legal in the
  active format*. An illegal candidate (e.g. a Champions-illegal item)
  is a critical finding.
- Open-sheet input must collapse the prior to a single known kit (minus
  SP/nature) — not a distribution.

## Vision (M5+)

- Every extracted field must validate against the active format's legal
  data. Invalid field → reject + retry, never silently coerce.
- Closed-sheet mode returns species only. Open-sheet mode returns
  species + ability + item + moves + Tera. Schema confusion between
  modes is a finding.

## Scoring (M3+)

- Weights live in `pva.config.ts`, not in code. Any change to weights
  must come with a brief rationale comment in the config diff.
- Scoring should be *transparent*: the report cites matrix cells. A
  pick whose rationale can't be traced back to the matrix is a finding.

## Closed-sheet vs open-sheet

The tool's primary uncertainty source is closed-sheet ranked input
(species only). Behavioral checks ensure both paths share code:

- Open-sheet input must use the same matrix/scoring/report code path
  as closed-sheet, just with a narrower prior distribution.
- "Open sheet" is not a separate engine. A duplicated code path is a
  finding.

## Out of scope (not findings)

- Mega bluff metagame — assume opp brings their most-used Mega.
- Replay scraping.
- Singles (3v3) — engine should not preclude it but UI/CLI targets
  doubles; singles-specific corrections are deferred.
- Telemetry / run archive — defer to post-MVP.
