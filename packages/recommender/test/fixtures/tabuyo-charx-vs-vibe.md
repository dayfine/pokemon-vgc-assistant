# Recommender mock-replay fixture — Tabuyo Mega Charizard X vs "Vibe"

Source: `dev/research/recommender-experiment-2026-04-28.md` — N=1
experiment that validated the architecture. Reconstructed here as the
v1 mock-replay fixture for `extract.test.ts`.

## Inputs

- **My team** (Tabuyo's Mega Charizard X — Wolfey VGC Replica Teams Team
  3, 11-2 published record):
  - Charizard @ Charizardite X / Blaze / Adamant / 252 atk / 252 spe / 4
    hp — Protect / Dragon Dance / Dragon Claw / Flare Blitz
  - Tyranitar @ Tyranitarite / Sand Stream / Adamant / 4 hp / 252 atk /
    252 spe — Protect / Crunch / Rock Slide / High Horsepower
  - Milotic @ Leftovers / Competitive / Bold / 252 hp / 252 def / 4 spa
    — Protect / Icy Wind / Scald / Recover
  - Incineroar @ Sitrus Berry / Intimidate / Adamant / 252 hp / 252 atk
    / 4 spd — Fake Out / Parting Shot / Throat Chop / Flare Blitz
  - Sinistcha @ Coba Berry / Hospitality / Sassy / 252 hp / 252 spd / 4
    spa — Matcha Gotcha / Rage Powder / Trick Room / Life Dew
  - Sneasler @ White Herb / Unburden / Jolly / 252 atk / 252 spe / 4 hp
    — Fake Out / Dire Claw / Close Combat / Coaching

- **Opp team** (best-guess visual ID; Mewtwo flagged as M-A-illegal):
  - Charizard @ Charizardite Y / Blaze / Modest — Heat Wave / Solar Beam
    / Air Slash / Protect
  - Mewtwo @ Mewtwonite X / Pressure / Adamant — Psystrike / Drain Punch
    / Ice Punch / Bullet Punch (FORMAT-ILLEGAL in Reg M-A)
  - Garchomp @ Life Orb / Rough Skin / Jolly — Earthquake / Dragon Claw
    / Stone Edge / Fire Fang
  - Annihilape @ Assault Vest / Defiant / Adamant — Drain Punch / Rage
    Fist / Shadow Claw / U-turn
  - Volcarona @ Sitrus Berry / Flame Body / Timid — Heat Wave / Bug Buzz
    / Quiver Dance / Protect
  - Indeedee-F @ Psychic Seed / Psychic Surge / Modest — Follow Me /
    Psychic / Helping Hand / Protect

## Recorded response (normalized)

The 2026-04-28 experiment recorded a partial JSON with `snake_case` keys
and the architecture-shaped fields. The fixture below has been
**normalized** to match the final `AgentRecommendation` schema:

- `snake_case` → `camelCase` (`primary_win_condition` →
  `primaryWinCondition`, `deviates_from_score_baseline` →
  `deviatesFromScoreBaseline`, etc.).
- Added the `keyOppThreats`, `leadScenarios`, `back`,
  `deviationRationale`, and `rationale` fields the experiment described
  in prose but didn't include in the partial JSON snippet (extracted
  from the full prose response: §"What the agent saw…" and §"Per-scenario
  turn-by-turn plays").

This reshaping is expected normalization (per the agent brief), not a
finding. It locks the recorded behavior into the v1 schema so the
mock-replay test exercises every shape constraint.

```json
{
  "bring": ["Charizard", "Sneasler", "Sinistcha", "Incineroar"],
  "lead": ["Charizard", "Sneasler"],
  "back": ["Sinistcha", "Incineroar"],
  "primaryWinCondition": "Mega Charizard X sweeps after one Dragon Dance, set up behind Sneasler Coaching + Sinistcha Rage Powder.",
  "keyOppThreats": [
    {
      "opp": "Indeedee-F",
      "why": "Follow Me redirects single-target moves and eats setup turns. Removing Indeedee-F first protects the Charizard DD turn."
    },
    {
      "opp": "Annihilape",
      "why": "Defiant punishes Intimidate (Incineroar Fake Out → Intimidate auto-boosts Annihilape Atk). Avoid Intimidate-on-switch lines vs. Annihilape."
    },
    {
      "opp": "Garchomp",
      "why": "Stone Edge OHKOs unboosted Charizard X. Coaching's +1 Def shifts the OHKO chance to ~30%, but Garchomp must still be removed before the sweep."
    },
    {
      "opp": "Mewtwo",
      "why": "Mewtwo is M-A-illegal (likely visual-ID error). If real, Mega Mewtwo-X Bullet Punch threatens Sinistcha — Coba Berry mitigates one hit."
    }
  ],
  "leadScenarios": [
    {
      "ifOppLeads": ["Indeedee-F", "Charizard"],
      "weLead": ["Charizard", "Sneasler"],
      "turn1Play": "Sneasler Fake Out on Indeedee-F (priority skips Follow Me); Charizard Dragon Dance behind it.",
      "turn2Play": "Sneasler Coaching on Charizard (+1 Atk / +1 Def); Charizard Protect or Dragon Claw on Indeedee-F.",
      "turn3Play": "Mega-evolve Charizard, Flare Blitz / Dragon Claw on the highest-threat target."
    },
    {
      "ifOppLeads": ["Annihilape", "Garchomp"],
      "weLead": ["Charizard", "Sneasler"],
      "turn1Play": "Sneasler Fake Out on Garchomp (skip Annihilape — Defiant); Charizard Dragon Dance.",
      "turn2Play": "Sneasler Coaching on Charizard; Charizard Mega-evolves and threatens Flare Blitz on Annihilape.",
      "turn3Play": "Sweep with +1 Charizard X; back of Sinistcha + Incineroar covers Volcarona / Indeedee-F if revealed."
    },
    {
      "ifOppLeads": ["Volcarona", "Indeedee-F"],
      "weLead": ["Sneasler", "Sinistcha"],
      "turn1Play": "Sneasler Dire Claw on Indeedee-F (sleep/par chance disrupts Follow Me chain); Sinistcha Rage Powder.",
      "turn2Play": "Switch Sinistcha to Charizard, Sneasler Coaching on Charizard.",
      "turn3Play": "Mega-evolve, sweep with +1 Charizard X under Sand (Tyranitar in back optional swap)."
    }
  ],
  "deviatesFromScoreBaseline": true,
  "deviationRationale": "Score baseline (Tyranitar + Milotic + Incineroar + Sneasler) plays for trades and excludes the team's win condition. Mega Charizard X is the build's actual archetype — bringing Tyranitar instead means one Mega Stone is dead weight (Mega Clause). Coaching's +1 Def shifts Garchomp Stone Edge into Charizard from guaranteed OHKO to rollable, which the matrix's unboosted-stats view cannot see.",
  "confidence": "medium",
  "rationale": "This is a Mega Charizard X team — Tabuyo's published 11-2 build. The win condition is a +1 Dragon Dance sweep, set up behind a Sneasler Fake Out + Coaching screen, with Sinistcha Rage Powder as the secondary redirection layer. The deterministic score doesn't recognize the archetype: it ranks Tyranitar (the second Mega) over Charizard because Garchomp Stone Edge OHKOs unboosted Charizard, costing one oppKoPicked. But Coaching's +1 Defense reduces that OHKO to a roll, and the Mega Clause means Tyranitar+Charizard is one dead Mega Stone — the score doesn't model either.\n\nThreat priority is Indeedee-F first (Follow Me eats setup turns), then Annihilape (Defiant punishes Intimidate), then Garchomp (Stone Edge into +1 Char). Volcarona is a Quiver Dance threat under sun if Charizard-Y leads, but our Sneasler Fake Out + Sinistcha Rage Powder buys the turns we need.\n\nConfidence is medium, hedged on the Mewtwo question mark — the team-preview screenshot likely misidentified that slot (Mewtwo is M-A-banned). If the real mon is something different, the recommendation could shift; flagging this as a known input-uncertainty source rather than a confident pick. The Coba Berry on Sinistcha specifically hints that the team prepared for Mega Mewtwo-X Bullet Punch, so the build expects Mewtwo to be on the field — but the format prohibits it."
}
```

## Notes for the test

- The fixture's `recommended JSON` parses cleanly via
  `parseAgentRecommendation`.
- `deviatesFromScoreBaseline=true` because the agent's bring
  (`Charizard / Sneasler / Sinistcha / Incineroar`) differs from the
  deterministic top-1 (`Tyranitar / Milotic / Incineroar / Sneasler`).
- `deviationRationale` is required (and present) because of the above.
- Every species name is Showdown-canonical (matches the calc layer's
  `pokemon.name` form).
