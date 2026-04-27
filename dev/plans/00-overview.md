# 00 — Project overview

## Goal

A personal assistant for **Pokémon Champions VGC 2026 Reg M-A** (4v4 doubles)
that, given my full team and the opponent's team preview, recommends:

1. **Bring picks** — top 3 ranked sets of 4-of-6 to bring.
2. **Scouting notes** — per opp mon: 1HKO/2HKO threats both directions,
   key speed comparisons, common SP spreads, Mega-line risk.

Single user (me). Personal use, public repo so others can fork.

## Why this is feasible at all

Champions runs **open team sheets** at competitive events: at preview the
opponent sees species, ability, item, all 4 moves, and Tera type for every
mon. Only EVs/IVs/nature ("Stat Points" in Champions parlance) are hidden.

This collapses the hard part of "scouting" into a tractable spread-priors
problem on top of pure damage calc and speed math.

## Inputs

- **My team**: full sets. Source TBD — typed input first, screenshot of
  builder later.
- **Opp team**: 1 screenshot of the team-preview screen → vision model
  extracts 6 species + ability + item + moves + Tera per mon.

## Outputs

- v1: Markdown report to stdout / file.
- v2+: Interactive web UI (adjust assumptions, recompute live).

## Out of scope (for v1)

- In-battle decision support (turn-by-turn).
- Replay analysis / opponent history lookup.
- Team building from scratch.
- Singles (3v3) — engine should not preclude it but UI/CLI targets doubles.
- Other regulations (M-B, M-C, …) — assume Reg M-A only until format rotates.

## Constraints from the format (Reg M-A, see `dev/research/champions-2026-04-26.md`)

- **Mega Evolution only** — no Tera/Dyna/Z. One Mega per team.
- **~186–263 legal mons**, ~117 items, ~467 moves. Restricted dex.
- **Stat Points (SP)** replace EVs — different math; calc wrapper must
  handle this, not naively pass EVs through.
- **Open team sheets** — opponent's full kit visible at preview.

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
  (minus SP/IVs/nature).
- **Close sheet** — team preview where only species (sometimes Tera/item)
  is visible. Not used in M-A.

## Plan files

- [01-mvp.md](01-mvp.md) — v1 milestones.
- [02-architecture.md](02-architecture.md) — package structure + data flow.
