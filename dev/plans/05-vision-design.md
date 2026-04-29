# 05 — M5: Vision pipeline design

This doc covers the `vision` track in more detail than `01-mvp.md` §M5.
Read `01-mvp.md` §M5 first; this is the "how", not the "what". Pairs
with `dev/plans/04-live-capture.md` (M5.5) — vision is upstream of
that.

## TL;DR

- Package `packages/vision/` exposes one function:
  `vision.extract(image: Buffer, opts: { sheetMode, format }) →
   ExtractedTeamPreview`.
- Backed by the Claude Vision API. Single API call per extraction.
- **Sprite-based species ID**, not OCR. The Switch UI is locale-dependent
  (zh-TW in our first fixture); sprite layout is locale-invariant. The
  prompt asks for English Showdown-canonical species/item names
  regardless of which characters appear on screen.
- Returns both teams when present in the captured screen — open-sheet
  team-preview shows my and opp simultaneously, so the same call seeds
  both inputs to `recommendBPFromSpecies` / `recommendBP`.
- Validates every extracted field against the active format's legal
  data. Invalid extraction → reject + retry path documented; for v1
  we emit a typed `ExtractionError` and let the caller decide
  (re-grab, manual override, etc.).

## Why this design exists

`engine.recommendBPFromSpecies` is the closed-sheet entry point and
expects per-opp-slot species (plus optional kit hints under open
sheet). Today the user has to type that in. Vision automates it.

Two screenshots inform the design:

1. **`data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg`**
   — open-sheet, zh-TW UI. Two-column layout (my + opp visible
   simultaneously), per-row sprite + species name + item icon (+ item
   label on my side) + gender + type icons. See
   `dev/research/champions-ui-team-preview-2026-04-28.md` for the
   full inspection.
2. *(closed-sheet fixture not yet collected — needed for M5
   acceptance, see §Acceptance.)*

Key constraints derived from #1:

- UI is Switch-locale-dependent. OCR-by-label requires a per-locale
  lookup table maintained against in-game text changes. **Sprite-based
  ID via Claude Vision is the load-bearing path**; it works regardless
  of which language the Switch is set to.
- Open-sheet captures both sides at once. We get my-team for free if
  the user's already on the team-preview screen.
- Item icons are locale-invariant; item labels are not. For my side
  we have both signals; for opp side only the icon. Sprite-based ID
  works for items too.
- Mega Stones are labelled `<species>進化石` (zh-TW) / `<Species>ite`
  (en-US). The visual marker (the X / Y suffix on Mega-X / Mega-Y) is
  preserved across locales.

## Module shape

```
packages/vision/
  package.json
  tsconfig.json
  src/
    types.ts             # ExtractedTeamPreview, ExtractedMon,
                         # ExtractedKit, ExtractionError, SheetMode
    schema.ts            # JSON Schema for closed/open response shapes
                         # (used to validate the Claude API response)
    prompt.ts            # Claude Vision prompt builder (sheetMode-aware)
    extract.ts           # public extract() — orchestrates Claude call
                         # + parsing + validation
    validate.ts          # legality checks against active format's
                         # data (species / move / item / ability)
    client.ts            # thin Anthropic SDK wrapper (testable via
                         # injected fetcher for offline tests)
    index.ts
  test/
    fixtures/
      champions-zh-tw-open-001.jpg  # symlink or copy from data/fixtures/
      champions-en-us-closed-001.jpg # TBD — collect during M5 dispatch
    extract.test.ts        # offline: feed fixture → mock client → assert JSON
    validate.test.ts       # legality-validation unit tests
    schema.test.ts         # response schema parse/reject tests
    prompt.test.ts         # snapshot the built prompt per sheetMode
```

## Public API shape

```ts
type SheetMode = 'closed' | 'open';

interface ExtractedMon {
  species: string;            // English Showdown-canonical name
  gender?: 'M' | 'F' | 'N';
}

interface ExtractedKit extends ExtractedMon {
  item?: string;              // English item name (open-sheet only)
  ability?: string;           // (open-sheet only)
  moves?: readonly string[];  // 4 moves max (open-sheet only)
  tera?: string;              // future-proofing; M-A is no-Tera so always undefined
}

interface ExtractedTeamPreview {
  sheetMode: SheetMode;
  // Closed sheet: only `species` per ExtractedMon. Open sheet: full
  // ExtractedKit fields. Both modes return both teams when present
  // in the captured frame.
  myTeam: readonly (ExtractedMon | ExtractedKit)[];
  oppTeam: readonly (ExtractedMon | ExtractedKit)[];
  // Confidence rating from the model, bucketed.
  confidence: 'high' | 'medium' | 'low';
  // Free-form notes from the model — surfaces "the third opp mon's
  // sprite was occluded; my best guess is X". Caller can show this in
  // the UI for the user to override.
  notes?: string;
}

interface ExtractionError extends Error {
  kind: 'invalid-response' | 'illegal-field' | 'low-confidence' | 'api-error';
  detail?: string;
  raw?: string;  // raw model output for debugging
}

interface ExtractOptions {
  sheetMode: SheetMode;
  format: Format;             // for legality validation
  // For testing — inject a Claude client.
  client?: AnthropicClient;
  // For testing — provide a fixed model response (skips API call).
  mockResponse?: string;
}

function extract(image: Buffer, opts: ExtractOptions): Promise<ExtractedTeamPreview>;
```

The `Format` type is already exported from `@pva/engine`. `vision`
imports `@pva/engine` for **types only** — same architecture rule as
`priors`.

## Claude Vision prompt design

Single user message containing the image + a structured instruction.
System prompt establishes the role.

### System prompt (rough)

```
You are a Pokémon team-preview extractor. You receive a screenshot
from Pokémon Champions VGC (Reg M-A) — a Switch game — and return a
strict JSON object describing the Pokémon visible on screen.

Two screen modes exist:
- closed sheet (ranked ladder): opponent rows show only sprite +
  generic frame. Item, ability, moves, Tera are HIDDEN.
- open sheet (tournament / TPCi events): opponent rows show
  sprite + ability text + item icon + 4 moves + Tera type.

The user-facing UI may be in any language (English, Chinese, Japanese,
Korean, etc.). Sprite layout and visual icons are language-invariant
— rely on those, not on OCR-of-labels.

Always return English Showdown-canonical names for species, items,
abilities, and moves. (e.g. `Charizard`, `Charizardite X`, `Intimidate`,
`Knock Off`.)
```

### User instruction (sheetMode-aware)

For **closed sheet**:
```
Extract the team preview into the following JSON schema. The screen
shows my team on one side and the opponent's team on the other.
Identify each Pokémon by its sprite. For the opponent's side, return
species and gender only (no item/ability/moves under closed sheet).
For my side, return as much as is visible (typically open-sheet-style:
species + item + gender, possibly more).

If you can't identify a sprite confidently, set `confidence: low` and
describe the uncertainty in `notes`.

JSON schema:
{ ... matches ExtractedTeamPreview ... }
```

For **open sheet**: include moves + ability + tera in the per-mon
fields.

The prompt is built by `prompt.ts` from `sheetMode`; full text snapshot
is pinned in `prompt.test.ts` so changes are deliberate.

## Validation

After parsing the model's JSON response, every field is checked
against the active format's legal data:

- `species` must exist in `gen.species` for the format. (Until
  `@pkmn/dex` ships gen9champions, fall back to vanilla Gen 9 + a
  static deny-list for known M-A bans — same gap as
  `engine/src/data.ts` and `priors/src/spreads.ts`.)
- `item` must exist in `gen.items` and not be on the M-A item-clause
  duplicates list.
- `ability` must be legal for the species (cross-check against the
  same `LEGAL_ABILITIES` allow-list `priors` uses, or `gen.species[x].abilities`).
- `move` must exist in `gen.moves` and be on the species' movepool
  for the format.
- `tera` must be undefined for M-A.

Any invalid field bubbles as an `ExtractionError` with `kind:
'illegal-field'`. The caller (CLI or live-capture app) decides
whether to re-prompt the model with a "you returned an illegal X,
try again" or surface to the user for manual override.

## Sprite-based species ID — why it's robust

The Champions team-preview screen renders each Pokémon as a small
animated 3D sprite. The sprite is unmistakable for a model trained on
the franchise. Claude Vision can identify them visually. This bypasses
two failure modes of OCR-based extraction:

1. **Locale variance.** Switch UIs ship in 9+ languages. OCR-then-map
   needs a translation table per locale per species; species names
   change between regions in non-trivial ways (e.g. Whimsicott is
   `エルフーン` in JP, `木棉球` in zh-CN, `胖嘟嘟` in zh-TW... actually
   `エルフーン` / `Whimsicott` / `木棉球`). Maintaining that table is
   busywork.

2. **Font / rendering changes.** Game patches sometimes update fonts,
   spacing, or animations. Sprite-based ID is robust to those.

Item icons are similarly locale-invariant — same icon, regardless of
the language label next to it. Sprite + icon ID together cover both
species and item without touching text.

## Sheet-mode auto-detection (optional, deferred)

The model can detect open vs. closed sheet itself by checking whether
opp rows show item icons. Rather than building a separate detector,
we pass `sheetMode` as a caller parameter and let the prompt enforce
the schema. M5.6 (auto-detect screen, in `04-live-capture.md`) adds
template-match-style detection at the live-capture layer; the vision
layer stays caller-driven.

## What about cropping?

The fixture is 1280×720 (Switch dock screenshot). We pass the **full
frame** to Claude Vision — no pre-cropping. Reasons:

- Claude Vision handles full screenshots well; doesn't need
  hand-tuned crops per UI screen.
- Cropping logic would be locale + UI-version dependent; another
  source of fragility we'd rather avoid.
- The trade-off is API-payload size. JPEG ~85% on a 1280×720 frame is
  comfortably under 200 KB; well within Claude Vision limits.

If the Vision layer needs to be more precise (e.g. focus on per-row
crops for ambiguous cases), that's a M5 follow-up not a v1
requirement.

## Acceptance criteria

- `vision.extract(buffer, { sheetMode: 'open', format })` on the
  zh-TW open-sheet fixture
  (`data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg`)
  returns `ExtractedTeamPreview` with:
  - `myTeam` containing 6 entries with correct English Showdown
    species names (Charizard, Tyranitar, Milotic, Incineroar,
    Sinistcha, Sneasler).
  - `oppTeam` containing 6 entries with at least correct species
    names (per visual ID).
  - `myTeam[0].item === 'Charizardite X'`,
    `myTeam[1].item === 'Tyranitarite'`, etc. (per the research-doc
    table).
  - All fields legal in `gen9championsvgc2026regma` per
    `validate.ts`.
- `vision.extract(buffer, { sheetMode: 'closed', format })` on a
  to-be-collected closed-sheet fixture returns species-only opp data
  with the my-side fully populated.
- One `extract.test.ts` per fixture, mocking the Claude client with
  the actual recorded JSON response. CI-runnable offline.
- Optional CI-skipped live test that hits the real Claude API on a
  scheduled cron (e.g. weekly) to catch model-drift regressions.
- Schema validation tests that reject malformed responses (missing
  fields, wrong types, illegal species).
- Prompt snapshot test (one per sheetMode) so changes are deliberate.

## API key & cost

### Three-tier key handling

| Context | Where the key lives | How it's loaded |
|---|---|---|
| **CI** | GitHub Actions repo secret `ANTHROPIC_API_KEY` | Workflow job adds `env: ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` to whichever step runs live tests. Existing `pnpm-test.yml` does NOT pipe it; the slice that adds live tests must add the env block. |
| **Local dev** | `.env` at repo root (already gitignored via `.env` line in `.gitignore`) | `dotenv` loads it at process start. Each developer supplies their own key. |
| **M5.5 end-user app** | OS keychain via `keytar` (or platform-native Electron API) | Prompted on first run; persisted across sessions. End users supply *their own* key, not the project owner's. |

Why split: repo secret keeps CI testable without exposing the key in
git history; local `.env` preserves individual developer control;
end-user split prevents free-rider key sharing once we ship binaries.

### Default = mocked client

- Every committed test injects a mock Anthropic client with a recorded
  JSON response. `pnpm test` works offline and never spends real
  money.
- Live calls are gated behind a `RUN_LIVE_TESTS=1` opt-in flag *plus*
  the key being present. CI runs them on a scheduled cron (weekly) to
  catch model-drift regressions, not on every PR.
- The opt-in pattern means a lost key, a missing secret, or a forgotten
  `.env` never breaks the test suite — they break the live-only path.

### Cost ceiling

Claude Vision on a 1280×720 JPEG (~85% quality, ~150–250 KB):

- Per call: ~$0.01–0.02 (image-input tokens dominate; species-list
  output is tiny).
- Per ranked session (~10 games): ~$0.10–0.20.
- Per month at heavy single-user use (100 games): ~$1–2.
- CI live-cron weekly: ~$0.05/month.

Trivial for single-user. Document the per-call estimate in the
package README so end users know what they're paying for.

### Anthropic SDK

`@anthropic-ai/sdk` is the canonical TypeScript client. Vision works
through `messages.create` with `image` content blocks (base64 or URL
input; we use base64 from the captured frame Buffer). Confirm the
installed SDK version supports image input cleanly during M5 dispatch.

## Open questions

1. **Closed-sheet fixture collection.** Need a real ranked-ladder
   team-preview screenshot to pin the closed-sheet acceptance test.
   M5 dispatch should explicitly ask the user to provide one, or
   simulate by cropping the open-sheet fixture's opp side and
   stripping item icons.
2. **Confidence threshold for retry.** When the model returns
   `confidence: low`, do we auto-retry with a more aggressive prompt?
   Or surface to the user? v1 surfaces; M5.6 could add auto-retry.
3. **Move-set extraction at open sheet.** The fixture shows item +
   ability for opp under open sheet but moves require zooming into the
   per-mon detail screen. Verify behaviour: does the team-preview
   screen show all 4 moves at once for opp under open sheet, or do
   the user / app need to navigate to per-mon screens? **Outstanding
   research item — do not block M5 simple slice on this.**
4. **Stat overrides.** Once SP→stat conversion lands (separate slice),
   open-sheet extraction could include stat data if visible on the
   in-game preview screen. v1 leaves stats unaddressed (they're not
   visible at team preview anyway).

## Non-goals

- **Real-time recognition during gameplay.** The vision pipeline
  works on team-preview screenshots only. Battle screen recognition
  (HP bars, status, weather) is not in scope for any phase.
- **Replay analysis.** No frame extraction from gameplay video.
- **Custom-trained vision model.** Pay-per-call to Claude Vision is
  fine for single-user. Local sprite-classifier is interesting but
  premature.
- **Auto-correction of the user's team.** If vision extracts my-team
  wrongly (animation frame catches a swap-in), the caller's job is to
  let the user override; vision returns what it sees + confidence.

## Phases

### M5.0 — vision package, simple slice

Ships `vision.extract` for both sheet modes against the zh-TW
open-sheet fixture and one to-be-collected closed-sheet fixture.
Mock-driven offline tests. Public API as defined above. No retry
logic, no live-capture frontend (that's M5.5).

**Done when**: pipeline takes the committed fixture, runs through
the mocked Claude response, returns valid `ExtractedTeamPreview`,
and an end-to-end test wires the result into
`engine.recommendBPFromSpecies` (closed) / `engine.recommendBP`
(open) without legality errors.

### M5.5 — live-capture frontend

See `dev/plans/04-live-capture.md`.

### M5.6 — auto-detect + retry

- Auto-detect team-preview screen (image classifier in the live-capture
  app, calls vision once per detected screen).
- Auto-retry on `confidence: low` with a "be more confident" prompt.
- Probably belongs in `04-live-capture.md`'s phase plan rather than
  here; cross-referenced for visibility.

### M5.7 — builder-screen vision (deferred)

Until M5.7 ships, my-team is hand-typed Showdown-export per
`dev/plans/07-cli-design.md` §"M6.0 — CLI scaffold". M5.7 layers in
**team-builder vision**: a different prompt + aggregator that ingests
the Switch builder UI's per-Pokémon detail captures and emits a
Showdown-export `.txt` to the CLI's `<teamsDir>` storage location.

Two screenshots per Pokémon (12 total for a six-mon team):

1. **Moves + item view** — species, item icon, ability label, four
   moves, gender, type icons.
2. **EVs + nature view** — stat-spread page with EV allocation,
   nature, IV markers (for the ATS-aware speed tier in priors).

Output: a Showdown-export `.txt` matching what the CLI's
`pva teams import` (M6.3) writes. The builder-screen extractor
shares the parse / validate / client wiring with M5.0's
team-preview extractor; the prompt + aggregation logic is the
delta.

Open questions deferred to dispatch:

- Single-call multi-image vs. one call per screenshot pair.
  Anthropic's Vision API accepts multiple image blocks in one
  message; cheaper to bundle but harder to pin per-mon results.
- EV-allocation reading robustness vs. locale. Numeric EVs are
  digits regardless of locale, so OCR-of-numbers is acceptable for
  this view (sprite-based ID is still load-bearing for species and
  item).
- Validation of EVs/IVs against M-A's Stat Points (SP) system. SP
  has different math from EVs; we may need to convert, or reject
  EV-style spreads under SP formats. Cross-reference
  `dev/research/champions-2026-04-26.md` and the priors spread
  system before implementing.

Lands as a separate vision-track milestone after M6.0 ships and
real ladder use surfaces what's painful about hand-typing teams.

## Dependencies

- `@pva/engine` for `Format` and other shared types (types-only).
- `@anthropic-ai/sdk` for the Claude Vision client.
- `data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg`
  (already committed in this PR).
- A closed-sheet fixture (to be collected during M5 dispatch).
- Engine + priors are already in place; vision feeds them.
- `process.env.ANTHROPIC_API_KEY` for live API calls (CI / tests use
  mocked responses).
