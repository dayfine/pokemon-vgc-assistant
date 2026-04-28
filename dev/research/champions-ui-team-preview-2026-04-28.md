# Champions UI — team preview screen (2026-04-28)

Observations from
`data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg`. Source:
in-game team-preview screen, **open-sheet mode**, Switch dock,
**Traditional Chinese (zh-TW) UI locale**.

## Layout

Two-column, both sides visible simultaneously:

- **Left column** — *my team* (6 mons). The first row is highlighted (cursor).
- **Center** — pitch / arena artwork plus the prompt
  `請選出4隻 要上場戰鬥的寶可夢` ("Select 4 Pokémon to bring into
  battle"). Bottom-left counter `0/4 選擇完畢` ("0/4 selected").
- **Right column** — *opponent's team*. Header banner with the trainer's
  team name (in this fixture: "Vibe").

Both columns share a row template: rounded rectangle, sprite on the right
edge of the row, text labels on the left, gender/type icons on the
right edge above the sprite. My-side rows additionally show a
second-line label with the item name; opp-side rows show only the item
icon (no text label).

Top bar: timer "01:28", mode tags
`自由對戰 | 雙打對戰` ("Free Battle | Doubles").
Bottom-right: `顯示能力ON` ("Show Stats ON") — a Y-button toggle.

## Per-mon row content

For each row (both sides):

- Species sprite (animated icon).
- Species name (zh-TW characters in this fixture).
- Item icon. (My side also has the item name as a second-line label.)
- Gender icon (♂ / ♀ / unspecified).
- Two type-color icons in the upper-right of the sprite frame. These
  appear to encode (a) primary type and (b) Mega-evolution / Tera marker
  when applicable. In this fixture's open-sheet-style display, the
  marker pattern appears consistent with `(type1, type2)` for mons
  without Mega evolution and `(type1, mega-marker)` or similar for the
  three confirmed Megas.

## Inferred bring (this fixture)

| # | My team (zh-TW)     | Likely English (Showdown) | Item (zh-TW)       | Likely English item     |
|---|---------------------|---------------------------|--------------------|-------------------------|
| 1 | 噴火龍 (highlighted) | Charizard                 | 噴火龍進化石 X      | Charizardite X          |
| 2 | 班基拉斯             | Tyranitar                 | 班基拉斯進化石      | Tyranitarite            |
| 3 | 美納斯               | Milotic                   | 吃剩的東西          | Leftovers               |
| 4 | 熾焰咆哮虎           | Incineroar                | 文柚果              | Iapapa Berry            |
| 5 | 來悲粗茶             | Sinistcha                 | 稜瓜果              | Custap Berry            |
| 6 | 大狃拉               | Sneasler                  | 白色香草            | White Herb              |

Opp team (Vibe): six rows, sprite-and-icon only on this side. Visual
identification (low confidence without the in-game cursor):
Charizard-Mega, Mewtwo-Mega-X (silver/grey), one obscured red
sprite, what appears to be Annihilape, a bug/ghost-coloured mon, and
Indeedee-F. Cross-checking these is the vision pipeline's job — that's
the exact problem M5 solves.

## Implications for M5 (vision pipeline)

1. **UI is Switch-locale-dependent.** zh-TW labels in this fixture; the
   pipeline must NOT rely on OCR-from-English labels. Two ways to
   handle:

   (a) Visual species ID — let Claude Vision identify the Pokémon from
       its sprite + type icons, returning English Showdown-canonical
       names regardless of UI label language.

   (b) OCR + locale mapping — read the displayed label, translate via
       a per-locale species/item table.

   Recommend (a). Vision-based ID is more robust to font/layout quirks
   and removes the per-locale-table maintenance burden. Even when the
   Switch is set to English, sprite-based ID is still the safer signal.

2. **Open-sheet vs. closed-sheet.** This fixture is open sheet — both
   my and opp sides show items + gender. Closed-sheet ranked input
   would show only opp-side species. The vision pipeline's `sheetMode`
   parameter (already in the M5 plan) selects between schemas.

3. **My team is also extracted.** The fixture shows a *team preview*
   moment where both sides are visible. M5's plan focuses on opp
   extraction, but the same screen exposes my team. For the live-capture
   path (M5.5), extracting both sides simultaneously means the user
   doesn't need a separate "type my team" step — the screenshot is
   enough to seed both inputs to `recommendBPFromSpecies`.

4. **Sprites are animated icons, not static.** The rendered frame may
   catch a sprite mid-animation (different pose per frame). Vision
   should be robust to that — match by Pokémon, not by exact pixel
   pattern. Capture-card frames will show the same variability.

5. **Item icon and item label both present** on my side, only icon on
   opp side. Both signals available; the icon is locale-invariant. For
   open-sheet opp extraction, item identification will be icon-based.

6. **Sheet-mode auto-detection.** A vision pipeline could detect open
   vs. closed sheet by checking whether opp rows show item icons.
   Closed-sheet ranked input would have item-icon slots empty / missing
   on the opp side. Worth noting; not strictly required (caller can
   pass `sheetMode` explicitly).

7. **Mega Stone naming**: `<species>進化石` ("evolution stone") in
   zh-TW — `Charizardite X` shown as `噴火龍進化石 X`. Mega-X / Mega-Y
   suffix is preserved as " X" / " Y" even in localized UI. Useful for
   regex-based label parsing if we ever need OCR fallback.

## Implications for M5.5 (live capture)

1. **Sheet-mode flag in UI.** The live-capture app should let the user
   pick (or auto-detect) sheet mode. Closed-sheet ranked is the v1
   default; open-sheet tournament toggles via an in-app switch.

2. **Frame quality is good at 1080p.** This fixture is ~1280×720
   (likely the JPEG-share-recompressed Switch screenshot). Capture-card
   output at 1080p60 is strictly higher quality. Vision should work
   without preprocessing.

3. **Capture moment matters.** The team-preview screen in this fixture
   is stable (no transitions). A capture-card frame grab during this
   ~30-second window will produce equivalent input. Auto-detect (M5.6)
   could template-match the prompt text or the 6-row layout to find
   the stable team-preview moment.
