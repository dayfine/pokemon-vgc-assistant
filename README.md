# pokemon-vgc-assistant

Personal assistant for **Pokémon Champions VGC 2026 Reg M-A** (4v4 doubles).
Given my full team and an opponent's team-preview screenshot, recommends
which 4 of 6 to bring, surfaces likely opponent sets, and computes the
matchup matrix (KO ranges + speed tiers).

Single user; public repo so others can fork. Not a teambuilder, not
in-battle decision support — a pre-game scouting tool.

## Status

Planning + early scaffolding. The engine package builds and 5 known Gen 9
calcs pass; nothing else is wired yet.

| Milestone | What | State |
|-----------|------|-------|
| M1 | Engine skeleton + `@smogon/calc` wrapper | done (vanilla Gen 9) |
| M1.5 | `gen9champions` mod data, M-A Mega list, SP→stat | not started |
| M2 | KO matrix + speed tiers | not started |
| M3 | BP scoring + ranking | not started |
| M4 | Set priors (Pikalytics / Smogon chaos) | not started |
| M5 | Vision input (team-preview screenshot) | not started |
| M6 | CLI (`pva recommend`) | not started |
| M7+ | Web UI + per-opp scenario notes | not started |

Full plan: [`dev/plans/`](dev/plans/).

## Stack

TypeScript (strict), Node 20+, pnpm workspaces, vitest, biome. No
bundler. See [`dev/plans/02-architecture.md`](dev/plans/02-architecture.md)
for the package layout and dependency rules.

## Develop

```sh
nvm use            # Node 20+
corepack enable    # activates pnpm pinned in package.json
pnpm install
pnpm -r build
pnpm -r test
pnpm lint
```

## Layout

```
packages/
  engine/          calc, types, data accessor (M1)
  priors/          set/spread distributions       (M4)
  vision/          screenshot → opp team          (M5)
  cli/             pva recommend ...              (M6)
  web/             interactive UI                 (M7)
data/
  cache/           priors cache (gitignored)
  fixtures/        test screenshots + golden JSON
dev/
  plans/           milestone + architecture docs
  research/        format snapshots, findings
```

## License

MIT. See [`LICENSE`](LICENSE).
