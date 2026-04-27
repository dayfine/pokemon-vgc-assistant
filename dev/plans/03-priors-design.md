# 03 — Priors design (M4 + M4.5)

This doc covers the `priors` track in more detail than `01-mvp.md` §M4.
Read `01-mvp.md` first; this is the "how", not the "what".

## TL;DR

- **M4 (simple)** — ship the priors pipeline end-to-end with binary
  outcomes: pick one representative spread per (species, item-bucket) and
  treat each kit candidate as a single concrete `Pokemon`. Matrix +
  `recommendBP` iterate over candidate kits and aggregate by item-weight.
- **M4.5 (threshold-probability)** — replace the binary outcomes with a
  *probability-of-outcome* model. Per (attacker_kit, defender_kit, move,
  field), pre-compute the offensive-stat threshold T₁ that guarantees a
  1HKO and integrate against a coarse plausible-stat distribution per
  species. Same downstream score function; cell payload changes from
  binary to real-valued.

Two slices because (a) M4-simple validates the whole priors → matrix →
score pipeline before we invest in the harder probability layer, and
(b) the threshold solver is non-trivial enough to deserve its own PR.

## Why this design exists

`engine.score` (M3) reads `MatchupMatrix` cells. Closed-sheet input
gives only species; without priors, opp `pokemon.moves` are empty,
matrix cells are empty, and `score` returns the `roleGap`-only baseline.
Priors fill the (item, ability, moves, Tera, spread, nature) gap so the
matrix has substance.

The naive "fetch the most-popular full kit per species and feed it to
calc" is brittle because:

1. Pikalytics' AI Markdown endpoints don't expose EV/nature/Tera (see
   `dev/research/pikalytics-2026-04-27.md`).
2. The "most-popular full kit" assumes a unimodal distribution; in
   practice many species split across two or three role buckets
   (offensive vs. bulky Incineroar; Choice-locked vs. AV Iron Hands).
3. Binary 1HKO yes/no based on one hand-picked spread is overconfident.
   "P(1HKO) = 70% across plausible spreads" is more honest and is what
   the score function should be averaging over.

The threshold-probability layer addresses (3) directly. It also makes
the matrix cache shape format-stable — thresholds depend on (kit, kit,
move, field), not on this month's usage data.

## Data sources

Per `dev/research/pikalytics-2026-04-27.md`:

| Source | Status M-A | What it gives |
|---|---|---|
| Pikalytics `/ai/pokedex/<format>/<species>` | live, March 2026 data | item %, ability %, move %, top species. **No spread/nature/Tera.** |
| Smogon chaos JSON | not yet published for M-A | full distributions including spreads/Tera (when it ships, ~early May for April data) |

M4 ships Pikalytics-only. Smogon source is a follow-up once chaos has
M-A data.

### Format-ID translation

Internal IDs do not match Pikalytics slugs. Maintain a translation map
in `priors/src/sources/pikalytics.ts`:

| Internal | sheetMode | Pikalytics slug |
|---|---|---|
| `gen9championsvgc2026regma` | `closed` | `championspreview` |
| `gen9championsvgc2026regma` | `open` | `championstournaments` |

Re-check this map every regulation rotation (M-B, M-C, …) — Pikalytics
may switch from preview/tournaments slugs to per-regulation slugs once
the format stabilises.

## M4 — simple

### Module shape (subset of `02-architecture.md` §priors)

```
packages/priors/src/
  types.ts             # KitCandidate, ItemPrior, MovePrior, ...
  sources/
    pikalytics.ts      # AI-endpoint client + Markdown parser
  cache.ts             # fs cache w/ per-(format,source) TTL
  expand.ts            # species → KitCandidate[] (item-bucketed)
  index.ts
test/
  fixtures/
    pikalytics/
      championspreview-incineroar.md   # raw AI-endpoint response
      championspreview-flutter-mane.md # ~5–10 species hand-saved
  parser.test.ts                        # parse Markdown → ItemPrior[]
  expand.test.ts                        # KitCandidate ordering / weights
```

Deferred to follow-ups:
- `sources/smogon.ts` — when chaos JSON ships for M-A.
- `refine.ts` — narrow KitCandidate[] given observed facts. Lands with
  M7 (per-opp notes); the current closed-sheet pipeline doesn't need it.

### Item-bucketed kit construction (v1)

For each opp species, fetch Pikalytics, then build `KitCandidate[]` by
*item bucket*. Item is the single best v1 signal of role: Choice Band
implies offensive physical, Assault Vest implies bulky special wall,
Sitrus Berry implies mixed-bulk pivot, etc.

Algorithm:

1. Pull top-K items above ≥5% probability mass (default K=3, configurable
   in `pva.config.ts.priorsTopItems`).
2. For each item, pick the *single most popular ability* and the *top-4
   moves* (as a set; we don't yet model move-correlation).
3. For each item bucket, attach a hand-curated **representative spread**
   from a small lookup table at `packages/priors/src/spreads.ts`.
   - Bulky physical bucket: `252 HP / 252 Def / 4 SpD`, neutral nature.
   - Bulky special bucket: `252 HP / 4 Def / 252 SpD`.
   - Offensive physical bucket: `4 HP / 252 Atk / 252 Spe`, +Atk nature.
   - Offensive special bucket: `4 HP / 252 SpA / 252 Spe`, +SpA nature.
   - Speed-control / utility bucket: `252 HP / 4 Def / 252 Spe`, +Spe.
4. Tera: M-A is no-Tera, so leave as `undefined`. (Format-agnostic shape
   keeps Tera in `KitCandidate` for future formats.)

Output: `KitCandidate[]` with weights normalised to sum to 1.0 across the
returned candidates. Probability mass below the threshold is truncated,
not redistributed proportionally — explicit "we don't model the long
tail" rather than implicit re-weighting.

### Pipeline integration (matrix layer)

`engine.matrix` already returns `cells[a][d] = readonly Matchup[]` per
attacker/defender pair. Under M4-simple:

- For each opp species, call `priors.expand(species)` → `KitCandidate[]`.
- Build *one matrix per opp-kit-tuple*. With 6 opp species × ~3 kits
  each, that's up to ~3⁶ ≈ 730 matrices in the worst case — too many.
- Instead: matrix-per-mon-pair is naturally factored. Compute
  `cells[my_mon][opp_kit]` per (my_mon, opp_species, opp_kit) and weight
  the score contribution by `opp_kit.weight`. Score function consumes a
  weighted view, summing over kits per opp slot.

This is an additive change to the matrix shape and to `score` —
`MatchupMatrix.opp.cells[a]` becomes `KitCell[]` where `KitCell = {
weight, matchups }`. Mirror change on `my` side is unnecessary if my
team is fully known (typed input).

### Acceptance criteria for M4

- `priors.expand('Incineroar', 'gen9championsvgc2026regma', 'closed')`
  returns ≥2 kit candidates summing to weight 1.0, all legal in M-A.
- `recommendBP` over a hand-typed myTeam vs. a hand-typed opp species
  list produces sensible top-3 picks with breakdowns that cite per-kit
  contributions.
- One golden test using a committed Pikalytics Markdown fixture; one
  end-to-end test wiring `priors.expand` into `recommendBP`.
- All `qc-behavioral-authority.md` §"Set priors" rules: weights sum to
  1.0; every candidate field is legal-in-format; open-sheet collapses
  to a single kit.

## M4.5 — threshold-probability

### Math sketch

For a fixed (attacker_kit, defender_kit, move, field) and a defender
with stat profile (HP, Def, SpD), the calc is monotone in attacker's
offensive stat: bigger Atk/SpA → bigger damage range. So there exists a
**threshold T₁** such that any attacker with offensive stat ≥ T₁
guarantees a 1HKO (`koChance: 1` and `notation` includes "OHKO").
Same for T₂ (2HKO) and the defensive direction, where threshold D is
the defender stat at which the opp's best move stops guaranteeing OHKO.

Given:

- `T₁ = threshold attack stat for 1HKO on this defender`
- `P(stat ≥ T₁) = ∫_{T₁..∞} π(stat | species) dstat`

where π is a coarse plausible-stat distribution per species. The matrix
cell payload becomes `{ pOhko, pTwoHko }` instead of binary.

`score.pickedKoOpp` becomes the *expected number* of opp mons the bring
1HKOs — sum of P(some pick guarantees OHKO on opp_d) across opp slots.
Real-valued; the surrounding logic doesn't change.

### Plausible-stat distribution (`π`)

Hand-curated per species, stored in
`packages/priors/src/stat-distributions.ts`:

```ts
'Incineroar': [
  { weight: 0.7, profile: 'bulky-physical-pivot' },
  { weight: 0.2, profile: 'offensive-physical' },
  { weight: 0.1, profile: 'special-leaning' },
],
```

Each profile resolves to a concrete stat line via `spreads.ts`. The
distribution is *much coarser* than spreads — three or four buckets per
species — so manual curation per format is feasible. A later slice can
infer this distribution from item-popularity (Choice Band ⇒ heavy
weight on offensive bucket) automatically.

### Threshold solver

Two implementations to evaluate:

1. **Binary search** over the offensive stat range [50..250] — ~9 calc
   calls per (kit, kit, move, field). Easy to ship; correctness is
   trivially verifiable.
2. **Closed-form** via `@smogon/calc`'s damage formula — single calc
   call but requires reading calc internals. Faster, more brittle to
   calc upgrades.

Default: binary search. Premature to optimise.

### Cache shape

```ts
type ThresholdKey = {
  format: Format;
  attacker: { species: string; item: string; ability: string };
  defender: { species: string; item: string; ability: string };
  move: string;
  field: FieldFingerprint;
};
type ThresholdValue = { t1: number; t2: number };
```

Format-stable: rotating from M-A to M-B doesn't invalidate M-A entries.
Per-pair, per-move, per-field. The cache is independent of Pikalytics'
data — it depends only on calc behaviour.

### Acceptance criteria for M4.5

- Binary-search solver passes a test where the threshold is computed by
  hand for a known matchup (e.g. Choice Specs Calyrex-Shadow Astral
  Barrage vs. neutral 252 HP Iron Hands).
- `priors.statDistribution(species)` returns weights summing to 1.0 for
  ≥10 hand-curated species.
- Matrix cell payload moves to `{ pOhko, pTwoHko }`; score function
  consumes real-valued counts; existing M3 ordering tests still pass
  (with adjusted thresholds since the values shift).
- Cache key fingerprint excludes any format-specific metadata that
  shouldn't invalidate across formats.

## Open questions (M4 / M4.5)

1. **Should M4 wait for SP→stat conversion?** The hand-curated
   representative spreads in `spreads.ts` are EV-based today; Champions
   uses SP. Plan open Q3 still applies. Two paths:
   a. M4 ships with EV-equivalent spreads (lossy approximation, flagged
      in code) — accept the error for now.
   b. SP conversion lands as a sibling slice (M3.5 or M4.0) before
      priors. Higher-quality output but adds blocker.
   Recommend (a) — the priors-pipeline test is more valuable to
   exercise than the SP precision.

2. **How many fixtures?** ≥5 species (Incineroar, Flutter Mane, Iron
   Hands, Calyrex-Shadow, Whimsicott) feel like a defensible v1.
   Re-fetch monthly when Pikalytics updates.

3. **Should `refine.ts` ship in M4?** No. Closed-sheet ranked input
   doesn't reveal facts mid-series via the v1 CLI; it lands with M7
   (per-opp notes in the web UI). Including it in M4 is YAGNI.

4. **Cache implementation.** A simple `data/cache/priors/<format>/<source>/<sha>.json`
   under `.gitignore` is enough. No SQLite, no Redis. TTL via mtime
   compared against `priorsCacheTtlDays` from `pva.config.ts`.

## Non-goals

- Modeling move correlation within a kit (e.g. "if Knock Off then
  usually U-turn"). Kits in v1 are independent move slots.
- Modelling teammate correlations (Pikalytics exposes them; they feed
  team-prediction, not single-mon priors). Defer past v1.
- Inferring `π` from data automatically (item-popularity → role weight).
  Hand-curated tables are fine while the species count is small.
- HTML scraping of pikalytics.com main pages for spreads. AI endpoints
  are the canonical interface; deviating buys complexity for marginal
  precision gains.
