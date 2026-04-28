# LLM recommender experiment — 2026-04-28

One-shot experiment: feed the M3.5 deterministic-score output plus a
precomputed damage matrix, speed tiers, full team sets, and VGC-Reg-M-A
basics to a general-purpose subagent and ask it to recommend a bring +
lead pair. Compare to the deterministic baseline.

The point: see whether an LLM with structured matchup context and
domain hints **can outperform the naive scoring algorithm** on tactical
reasoning the score function can't capture (setup synergy, archetype
recognition, lead-pair tactics, threat priority).

## Setup

- **Fixture**: Jorge Tabuyo's Mega Charizard X team
  ([Wolfey VGC Replica Teams Team 3](https://wolfeyvgc.weebly.com/replica-teams.html),
  11–2 published record) vs. a best-guess opp team labelled "Vibe"
  from `data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg`.
- **Precalc script**: `scripts/demo-extract-precalc.mjs` — emits the
  full prompt context (sets, speed tiers, OHKO/2HKO matrix both
  directions, deterministic top-5 brings) as Markdown.
- **Subagent**: `general-purpose`. No special tools needed; the prompt
  was fully self-contained.
- **Prompt design**: see `## Prompt structure` below. ~3 KB of
  context + structured-output schema.

## Result

### Deterministic baseline (top 3, all tied at 27.00)

```
1. Tyranitar + Milotic + Incineroar + Sneasler
2. Tyranitar + Milotic + Sinistcha + Sneasler
3. Tyranitar + Incineroar + Sinistcha + Sneasler
```

Charizard appears at **#4 (24.00)** because Garchomp Stone Edge OHKOs
him (per the matrix), costing one extra `oppKoPicked`.

### Agent recommendation

```json
{
  "bring": ["Charizard", "Sneasler", "Sinistcha", "Incineroar"],
  "lead": ["Charizard", "Sneasler"],
  "back": ["Sinistcha", "Incineroar"],
  "primary_win_condition": "Mega Charizard X sweeps after one Dragon Dance, set up behind Sneasler Coaching + Sinistcha Rage Powder",
  "deviates_from_score_baseline": true,
  "confidence": "medium"
}
```

**Disagrees with the deterministic top in 4 of 4 picks.** No mons
shared between the deterministic top-1 and the agent's top-1.

### What the agent saw that the matrix did not

1. **Recognised the team's identity.** "This IS a Mega Charizard X
   team — Tabuyo's win condition is a +2 DD sweep, not bulky
   goodstuff." The deterministic score plays for trades; the agent
   plays for wins.

2. **Coaching's defensive shift.** Sneasler Coaching gives Charizard
   +1 Def — turning Garchomp Stone Edge from "guaranteed OHKO" into
   "rollable" (~5% live → ~70% live). The matrix uses unboosted stats;
   the agent reasoned about the boosted state.

3. **Caught the Mega clause** (the engine bug we logged earlier).
   "Bringing Tyranitar with Charizard means one is dead weight — only
   one can Mega-evolve." Caught via tactical reasoning rather than a
   hardcoded filter.

4. **Tactical knowledge invisible to the matrix:**
    - **Don't Intimidate Annihilape — Defiant boosts its Atk.** The
      matrix has zero notion of Defiant's interaction with Intimidate.
    - **Kill Indeedee-F first — Follow Me eats setup turns.** Tempo
      reasoning the score can't see.
    - **Sinistcha's Coba Berry is specifically the Mewtwo Psystrike /
      Bullet Punch insurance.** Recognised the build's intentional
      anti-Mewtwo tech.
    - **Sneasler Fake Out → Coaching → DD-Charizard is the standard
      3-turn setup.** Pattern-matched the team's archetype.

5. **Per-scenario turn-by-turn plays.** Three explicit "if opp leads
   X+Y, here's our turn 1 / turn 2 / turn 3" sequences — concrete
   enough to execute. Far richer than the deterministic enumerator's
   one-line lead pair.

6. **Honest about the Mewtwo question mark.** Flagged that visual-ID
   error changes the recommendation if Mewtwo turns out to be a
   different mon. Self-aware about input uncertainty.

## Cost / latency

- ~3 KB prompt + recorded ~5 KB response
- Single subagent call, ~70s wall time, 0 tool uses
- Estimated cost: ~$0.05–0.10 (Sonnet-class)

For ranked-ladder use (one extraction + one recommendation per game),
the agent layer roughly **doubles per-game spend** vs vision-only
(~$0.02 → ~$0.05–0.10). Still negligible.

## Architecture conclusion: M6.5 recommender package

The deterministic `engine.score` should stay — it's the audit trail and
fast sanity check, and its output is **input** to the recommender (the
agent reacts to the baseline). But the user-facing recommendation
should be the agent's output, not the score's.

See `dev/plans/06-recommender-design.md` for the M6.5 design.

## Prompt structure (for reproducibility)

The dispatch prompt had these sections in order:

1. **Role** — VGC doubles expert, recommendation engine.
2. **Format** — Reg M-A rules: 4v4 doubles, Mega only, Item Clause,
   one-Mega-per-team, banned categories. Critical: explicit note that
   Mewtwo on opp side is M-A-banned and likely a visual-ID error.
3. **My team** — full sets (item / ability / nature / EVs / 4 moves
   per mon).
4. **Strategic notes** — domain facts not derivable from the matrix:
    - Coaching → Charizard sweep is the win condition
    - Rage Powder protects Charizard during DD
    - Trick Room flip is the fallback plan
    - Tyranitar Mega is backup; only one mon can Mega-evolve
5. **Opp team** — full sets, with the Mewtwo legality flag inline.
6. **Speed tiers** — sorted fastest-first, both sides.
7. **Damage matrix — my team attacks opp** — Markdown table with
   OHKO + 2HKO moves per (attacker, defender). Skip empty rows.
8. **Damage matrix — opp attacks my team** — same shape, reversed.
9. **Deterministic-score baseline** — top 5 brings + breakdown
   numbers + explicit note about why Charizard is excluded (lets the
   agent disagree with grounds, rather than reinventing the analysis).
10. **Task** — recommend bring + lead pair + back pair + scenarios +
    rationale.
11. **Output schema** — strict JSON inside a fenced block, plus
    free-form rationale.

The crucial pieces for getting useful output:
- **Including the score baseline + its reasoning** as priming. The
  agent can take a position vs. it ("disagree because…") instead of
  reinventing.
- **Strategic notes** are domain facts that can't be inferred from
  matrix data alone. Without them the agent recommended the
  deterministic top in pre-experiments (not run here).
- **Explicit format-illegality flags** for visual-ID errors. The
  agent treated Mewtwo skeptically because the prompt told it to.
- **Asking for opinion + confidence**, not certainty. The agent
  hedged appropriately on Mewtwo and confidently on Coaching.

## What this experiment does NOT prove

- **N=1.** One fixture, one team, one opp. Real validation needs ≥10
  fixtures and human judgment per recommendation.
- **No replay validation.** We don't know if Tabuyo's actual top picks
  in his 11-2 run match the agent's recommendation.
- **Feedback loops absent.** The agent doesn't learn from outcomes;
  every call is fresh. M7 notes layer would help.
- **Prompt sensitivity untested.** Reordering sections, dropping the
  baseline, changing strategic notes — all could shift the output.
  Pin via snapshot tests once `packages/recommender/` ships.

## Files referenced

- `data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg` —
  source screenshot
- `scripts/demo-extract-precalc.mjs` — prompt-context extractor
- `dev/plans/06-recommender-design.md` — proposed M6.5 design
- `dev/plans/03-priors-design.md`, `dev/plans/05-vision-design.md` —
  upstream tracks the recommender consumes
