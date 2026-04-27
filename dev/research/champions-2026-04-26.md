# Pokémon Champions — research snapshot (2026-04-26)

Research dump captured before scoping the assistant. Sources cited inline.
Refresh if game updates or if Smogon publishes new format data.

## Game status

- **Released 2026-04-08** on Nintendo Switch + Switch 2, free-to-start.
  iOS/Android port announced for later in 2026, no firm date.
  https://www.pokemon.com/us/pokemon-news/pokemon-champions-is-now-available-on-nintendo-switch-and-nintendo-switch-2
- Live, no beta. Early-download bonus (free Dragonite + 100 Quick Coupons)
  runs until 2026-08-31.
  https://www.nintendolife.com/news/2026/04/feels-like-a-fleshed-out-beta-fans-are-unhappy-with-pokemon-champions-at-launch

## Format & mechanics — Regulation M-A

- **4v4 Doubles (bring 4 of 6)** and 3v3 Singles (bring 3 of 6), Level 50.
  Reg M-A in force at launch.
  https://victoryroad.pro/champions-regulations/
- **Mega Evolution only** at launch. Tera, Dynamax, Z-Moves teased for
  future seasons via the in-game "Omni Ring" device.
  https://comicbook.com/gaming/feature/pokemon-battle-gimmicks-in-pokemon-champions-explained/
- **~117 items legal** in M-A. Species + Item Clauses (no duplicates).
  Quick Claw / King's Rock cited as banned in competitive practice;
  Victory Road's official rules don't enumerate explicit item bans
  beyond duplicates.
  https://metavgc.com/guides/pokemon-champions-format-legal-pokemon-items-moves
- **~467 moves legal**. Banned: Last Respects, Shed Tail, Baton Pass,
  sleep-inducing moves.
- **Restricted dex**: ~186–263 legal Pokémon (sources differ on count).
  Kanto–Paldea coverage plus Champions-exclusive Megas (Mega Meganium,
  Mega Greninja, Mega Feraligatr, etc.). All Legendaries, Paradox,
  Treasures of Ruin, Koraidon, Miraidon banned in M-A.
  https://www.serebii.net/pokemonchampions/rankedbattle/regulationm-a.shtml
  https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_in_Pok%C3%A9mon_Champions
- **Open team sheets** in TPCi events — sheets swap at match start.
  Visible: species/form, ability, held item, all 4 moves, Tera type.
  Hidden: EVs/IVs/nature.
  https://victoryroad.pro/champions-regulations/
- **Timer**: 45s per turn, 7 min per-player ("Your time"), 20 min overall.
  Match ends in **draw** if overall timer expires (no VP/SP) — new vs SV.
  https://www.gamesradar.com/games/pokemon/pokemon-champions-matches-end-in-draws-when-the-timer-runs-out-and-no-one-can-decide-if-thats-a-good-thing/
- **Stat Points (SP)** replace EVs as the customization system. Different
  math from EVs — needs explicit handling in any calc wrapper.

## Data & tooling ecosystem

- **Pokémon Showdown supports Champions.** Mod ID `champions`. Format IDs
  in `config/formats.ts`:
  - `[Gen 9 Champions] OU`
  - `[Gen 9 Champions] BSS Reg M-A`
  - `[Gen 9 Champions] VGC 2026 Reg M-A`
  - `[Gen 9 Champions] VGC 2026 Reg M-A (Bo3)`
  - `[Gen 9 Champions] Custom Game`

  Source: https://github.com/smogon/pokemon-showdown/blob/master/config/formats.ts
- **Smogon stats**: index live at https://www.smogon.com/stats/ — first
  monthly chaos JSON for `gen9champions*` formats expected ~early May 2026
  (April data drop). Filename pattern (likely):
  `smogon.com/stats/2026-04/chaos/gen9championsvgc2026regma-XXXX.json`
- **Pikalytics** already publishing live usage. Early sample: Incineroar
  42.6%, Miraidon 28.3% (early April 2026; Miraidon presence implies
  non-M-A or pre-ban data — verify). https://www.pikalytics.com/
- **Other community tools**: Porygon Labs (calc + builder w/ Mega support),
  ChampTeams.gg, ChampionsHub.gg, ChampionsMeta, PokéBase, Game8,
  NCP VGC Calc, ChampDex (iOS).
  https://www.porygonlabs.com  https://www.pikalytics.com/calc
- **Tournaments**: Indianapolis Regionals 2026-05-29 — first major.
  Online Global Challenge began May. Pokémon Zone aggregates results.
  https://victoryroad.pro/2026-indianapolis/
  https://www.pokemon-zone.com/champions/tournaments/

## UI / screenshot inputs

- **Team preview (open sheet mode)**: opponent screen shows for each of 6
  mons — species sprite, ability text, item icon, all 4 moves, Tera type
  icon. EVs/IVs/nature hidden. Level normalized (50, not displayed
  per-mon). Gender visibility not explicitly documented; assume same as
  SV (gender symbol on portrait).
- **Builder screen (own team)**: full sets — species, ability, item,
  4 moves, Tera type, SP allocation, nature, IV equivalents. UI ref:
  Game8 builder pages, Porygon Labs, ChampionsHub.
  https://game8.co/games/Pokemon-Champions/archives/Builder

## Tool-design implications

- **Open team sheet collapses uncertainty.** Opponent's full kit is visible
  pre-game; only spread/nature is hidden. The "scouting priors" job
  shrinks dramatically vs. closed-sheet formats — limited to "common SP
  spread + nature for this exact set".
- **Mega Evolution is a strategic axis.** One Mega slot per team. BP
  picker must reason about: which of opp's Megas is likely brought,
  which of mine is best brought against it.
- **Source of truth** for legality + damage formula = `smogon/pokemon-showdown`
  `data/mods/gen9champions/`. Pull directly; do not duplicate.
- **`@smogon/calc`** handles Mega Evolution and is the right damage
  primitive (no Tera/Dyna concerns at launch).
- **Refresh cadence** matters — meta will shift sharply after Indianapolis
  Regionals (2026-05-29). Build in a `pikalytics-fetch` / `smogon-fetch`
  loop from the start.

## Unknown as of 2026-04-26

- Exact gender visibility on team preview UI.
- Whether Smogon's monthly chaos dump has actually published its first
  `gen9champions` file (April data won't drop until early May).
- Whether the Pikalytics Miraidon 28.3% figure reflects post-ban data
  cleanup or early ladder noise.
