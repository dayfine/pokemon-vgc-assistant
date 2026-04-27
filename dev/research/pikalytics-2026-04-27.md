# Pikalytics integration snapshot — 2026-04-27

Spike findings for the M4 priors track. Captured from
https://www.pikalytics.com/ on 2026-04-27.

## Access policy

- `robots.txt` (last updated 2026-01-22) explicitly **allows** `ClaudeBot`,
  `anthropic-ai`, and `claude-web` user-agents on `/`, `/ai/`, and the
  `/llms.txt` and `/llms-full.txt` files.
- The site advertises `/ai/` as the canonical AI-friendly entry surface
  ("AI-Specific Sitemap (for AI crawlers)") and ships LLM-readable
  Markdown rather than gated HTML for those endpoints.
- Contact: contact@pikalytics.com or @Pikalytics on Twitter for any
  partnership / formal API questions.

**Conclusion:** Use the `/ai/` endpoints under our normal User-Agent.
No HTML scraping of the main site, no scraping the regular HTML pages
in code that ships from this repo. If we need fields the AI endpoints
omit (spreads, sample size), email contact@pikalytics.com first.

## Endpoints

- `https://www.pikalytics.com/ai-sitemap.md` — Markdown sitemap of all
  AI endpoints. Stable enough to use as cache-key discovery.
- `https://www.pikalytics.com/llms.txt` — short site overview.
- `https://www.pikalytics.com/llms-full.txt` — full site context.
- `https://www.pikalytics.com/ai/pokedex/<format>/<pokemon>` — per-species
  Markdown response. **Primary endpoint for `priors`.**
- `https://www.pikalytics.com/ai/pokedex/<format>` — format-level top-N
  species index (returns species + usage %).
- `https://www.pikalytics.com/ai/top-teams/<format>` — featured tournament
  teams. Useful for `refine.ts` later (M7).
- `https://www.pikalytics.com/ai/champions` — Champions game info index.
- `https://www.pikalytics.com/ai/speed-tiers` — speed-tier reference.

## Format-ID translation (load-bearing)

Internal IDs do **not** match Pikalytics slugs. Translation table for M-A:

| Internal | sheetMode | Pikalytics slug |
|---|---|---|
| `gen9championsvgc2026regma` | `closed` | `championspreview` |
| `gen9championsvgc2026regma` | `open` | `championstournaments` |

Re-verify this map every regulation rotation. Other live slugs in the
sitemap (for reference): `gen9vgc2026regf`, `gen9vgc2025regi`,
`gen9vgc2025regh`, `gen9ou`, `gen9ubers`.

## Per-species response shape (Pikalytics AI Markdown)

Sections present in `/ai/pokedex/championspreview/Incineroar` (sample):

- **Quick Info** — format, game, data date (e.g. `2026-03`).
- **Common Moves** — name + percentage. Order: descending by usage.
- **Common Abilities** — name + percentage.
- **Common Items** — name + percentage.
- **Common Teammates** — six species, no percentages (probably ordered
  but undocumented).
- **Featured Teams** — 10 tournament-winning teams with records.
- **FAQ** — short prose role description.

Sections **explicitly missing**:

- EV / IV spread.
- Nature.
- Tera Type.
- Total sample size or confidence interval.

## Data freshness

- Snapshot tag `2026-03` on Champions Preview as of 2026-04-27 — site is
  serving March 2026 data.
- Pikalytics' own description: "Information refreshes monthly or whenever
  new competitive battle data becomes available."
- Implication: M4 default cache TTL of **7 days** keeps us aligned without
  hammering. A force-refresh flag matters around tournament weekends
  (Indianapolis 2026-05-29 is the next big M-A meta shift).

## Sample data — Incineroar (championspreview, data date 2026-03)

```
Common Moves:
  Fake Out: 41.092%
  Parting Shot: ~30%
  Flare Blitz: ~25%
  Darkest Lariat: ~20%

Common Abilities:
  Intimidate: 60.647%

Common Items:
  Sitrus Berry: 8.305%
```

(Percentages may not sum to 100% on individual axes since multiple slots
exist per species; e.g. four move slots all draw from "Common Moves".)

## What this means for `priors`

1. AI endpoints give us items / abilities / moves with weights — enough
   to build `KitCandidate[]` *with item-bucketed representative spreads*
   instead of using the popular spread directly. See
   `dev/plans/03-priors-design.md` §M4.
2. No spreads → the threshold-probability layer (M4.5) is the principled
   way to handle stat uncertainty rather than picking one spread and
   pretending it's representative.
3. Markdown stability lets us commit `.md` fixtures under
   `packages/priors/test/fixtures/pikalytics/` for parser tests without
   pinning network behaviour.

## Anomaly note

A `<system-reminder>` block appeared inside one of the WebFetch result
bodies during this spike. It looks like the harness's standard
task-tracking nudge bleeding into the tool envelope, **not** Pikalytics
injecting prompt content into its own pages — checked by re-fetching the
same URL. Mention here so we don't waste cycles re-investigating later.
