# 00 — Project overview

## Goal

A personal assistant for **Pokémon Champions VGC 2026 Reg M-A** (4v4 doubles)
that, given my full team and the opponent's team preview, helps me:

1. **Pick a bring** — top-3 ranked sets of 4-of-6 to bring under uncertainty.
2. **Play scenarios** — "what if opp leads X+Y", "what if mon Z is Choice
   Scarf", recompute the matchup live.
3. **Scout per mon** — 1HKO/2HKO both directions, key speed comparisons,
   likely sets/spreads, Mega-line risk.

Single user (me). Personal use, public repo so others can fork.

## Why this is feasible at all

The hard part of scouting in ranked play is that team preview only shows
**species** — no item, ability, moves, or Tera. We bridge the information
gap with two layers:

1. **Set priors** from usage data (Pikalytics / Smogon chaos): per species,
   the top-N likely (item, ability, moves, Tera, SP-spread) bundles with
   weights. Most ranked mons have a small handful of dominant sets.
2. **Scenario play + note-taking**: as the series unfolds, narrow the
   priors by recording what's revealed (e.g. "opp's Incineroar is AV, not
   Sash"). Recompute picks/threats with the refined kit.

Open team sheets *do* exist at major tournaments — there the priors
collapse to a known set and the tool reduces to pure calc + speed math.
Same engine, narrower input distribution.

## Inputs

- **My team**: full sets. Source TBD — typed input first, screenshot of
  builder later.
- **Opp team (ranked)**: 1 screenshot of the team-preview screen → vision
  model extracts 6 **species** (only species is shown).
- **Opp team (tournament, open sheet)**: same screenshot path → vision
  extracts species + ability + item + moves + Tera per mon.
- **Opp notes (optional, accumulating)**: per-mon overrides as the series
  reveals info ("locked Choice Scarf", "Knock Off confirmed", etc.).

## Outputs

- v1: Markdown report to stdout / file (one-shot, no notes).
- v2+: Interactive web UI — adjust assumptions, recompute live, persist
  per-opp notes to refine the opp model across games in a series.

## Out of scope (for v1)

- In-battle decision support (turn-by-turn).
- Replay analysis / opponent history lookup.
- Team building from scratch.
- Singles (3v3) — engine should not preclude it but UI/CLI targets doubles.

Note: not on the list — *other regulations*. Champions formats rotate on
the order of months (M-B, M-C, … will follow M-A), so the engine, data
loader, and config are designed format-agnostic from M1. Reg M-A is just
the first concrete format wired up; adding the next is a config + data
flip, not a rewrite.

## Constraints from the format (Reg M-A, see `dev/research/champions-2026-04-26.md`)

- **Mega Evolution only** — no Tera/Dyna/Z. One Mega per team.
- **~186–263 legal mons**, ~117 items, ~467 moves. Restricted dex.
- **Stat Points (SP)** replace EVs — different math; calc wrapper must
  handle this, not naively pass EVs through.
- **Closed team sheets in ranked** — preview shows species only. Item,
  ability, moves, Tera, SP all hidden until revealed in play.
- **Open team sheets at major tournaments** — full kit (minus SP/nature)
  visible at preview. Same engine, narrower input distribution.

## Authoritative data sources

- **Legality + game data**: `smogon/pokemon-showdown`,
  `data/mods/gen9champions/`. Source of truth.
- **Damage calc**: `@smogon/calc` (handles Mega).
- **Set priors (SP/nature distributions)**: Pikalytics first; Smogon chaos
  JSON once published (~early May 2026 for April data).

## Glossary

- **BP** — bring picks; the 4 of 6 selected to bring into a match.
- **M-A** — Regulation M-A; the launch ruleset.
- **SP** — Stat Points; Champions' replacement for EVs.
- **Open sheet** — team preview format where opponent sees full sets
  (minus SP/IVs/nature). Used at major Champions tournaments.
- **Closed sheet** — team preview where only species is visible. The
  default in Champions ranked ladder; the tool's primary uncertainty
  source.

## Plan files

- [01-mvp.md](01-mvp.md) — v1 milestones.
- [02-architecture.md](02-architecture.md) — package structure + data flow.
