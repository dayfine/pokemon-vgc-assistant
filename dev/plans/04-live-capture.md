# 04 — M5.5: Live capture-card frontend

This doc covers the **live-capture** track in more detail than
`01-mvp.md` §M5 (which speaks to the static-screenshot path only).
Read `01-mvp.md` §M5 first; M5.5 wraps that pipeline with a real-time
frontend.

## TL;DR

- A standalone Electron app (`apps/live-capture/`) that turns a USB
  capture-card video stream into M5 vision input and displays the
  resulting bring-pick recommendations.
- Replaces the manual "Switch Capture button → MTP transfer → drop
  PNG into pipeline" loop (~10–60 s of friction per game) with a
  "press hotkey → instant recommendation" flow (sub-second to ~3 s
  end-to-end, dominated by the Claude Vision call).
- Phased: M5.5 (manual hotkey trigger), M5.6 (auto-detect team-preview
  frame), M5.7 (per-opp note overlay tied to M7).

## Why this design exists

M5's `vision.extract(image, sheetMode)` is screenshot-format-agnostic.
The capture path is a UX problem, not an engine problem:

- Switch USB-C is MTP-only (transfers already-saved files); not a live
  framebuffer. See `memory/project_vision_input_capture.md`.
- Tournaments and ranked-ladder use both involve short windows where a
  real-time recommendation matters more than offline analysis.
- Capture cards already exist in the streaming ecosystem ($80–200,
  Elgato HD60 X / NearStream / AVerMedia Live Gamer Mini class) and
  expose HDMI-as-USB-webcam-class video to host machines.

## Hardware reference

```
Switch dock ──HDMI──▶ Capture card ──HDMI──▶ TV (passthrough, ~16 ms)
                          │
                          └──USB──▶ Laptop (~50–200 ms, exposed as a
                                            webcam-class video device)
```

- Pass-through means no added latency for the user playing on TV.
- USB-side latency varies by card model. For team-preview detection
  (a static screen lasting many seconds), latency is irrelevant — any
  frame from the stable window works.
- Cross-platform device names: macOS / Windows / Linux all surface the
  card via standard OS APIs (AVFoundation / DirectShow / V4L2). The
  app uses Chromium's `getUserMedia` so it works through a single
  cross-platform path.

## Architecture

Electron + `getUserMedia` → frame grab → existing M5 + priors + engine
pipeline. **No native-code module needed.**

```
┌────────────────────┐
│  Electron renderer │
│                    │
│  ┌──────────────┐  │  hotkey
│  │ <video>      │  │ ─────► grab current frame ──► JPEG Buffer
│  │ live-feed    │  │
│  └──────────────┘  │                                   │
│  ┌──────────────┐  │                                   ▼
│  │ result panel │  │       ┌────────────────────────────────┐
│  └──────────────┘  │       │ pipeline/analyze.ts             │
└────────────────────┘       │  vision.extract(buf, sheetMode) │
        ▲                    │  priors.expand(...) per opp     │
        │                    │  engine.recommendBPFromSpecies  │
        │   IPC              └────────────────────────────────┘
        │                                    │
        └──── Electron main ◄────────────────┘
              (orchestration; secrets in env)
```

Why Electron + `getUserMedia`:
- Cross-platform without writing native binding code per OS.
- Chromium handles capture-device enumeration + permission prompts.
- The renderer can `<video>` the live stream and grab frames via
  `<canvas>.toBlob()`. Same primitives the OBS WebRTC integration uses.
- Pipeline is plain TypeScript and reuses the existing `engine` +
  `priors` packages; only `vision` needs to be reachable.

## Module shape

```
apps/live-capture/
  package.json
  electron-builder.json    # packaging config
  src/
    main.ts                # Electron main process: window, IPC, env
    preload.ts             # context-isolated IPC shim
    renderer/
      app.tsx              # top-level UI
      LiveFeed.tsx         # <video> bound to picked capture device
      DevicePicker.tsx     # `navigator.mediaDevices.enumerateDevices`
      ResultPanel.tsx      # extracted team + bring picks render
      hooks/
        useCapture.ts      # device enumeration + getUserMedia stream
        useFrameGrab.ts    # canvas.toBlob → ArrayBuffer
        useGlobalHotkey.ts # Electron globalShortcut bind
    pipeline/
      analyze.ts           # Buffer → vision → priors → engine
      types.ts             # AnalyzeResult shape used by ResultPanel
  test/
    pipeline/
      analyze.test.ts      # uses recorded frames as input source
```

The app sits at top-level `apps/` because it's not a library. Add
`apps/*` to `pnpm-workspace.yaml` when this lands.

## Workflow (UX steps)

1. Plug in capture card; point Switch dock HDMI at it; TV passthrough
   confirmed (you can play normally).
2. Open the app. Device picker enumerates available video devices;
   user selects the capture card.
3. Live video panel shows the Switch output.
4. User reaches the team-preview screen on Switch (open or closed
   sheet, doesn't matter — `sheetMode` is a per-grab flag in the UI).
5. User presses Grab hotkey (default `Cmd/Ctrl+Shift+G`) or in-app
   button.
6. App grabs the current `<video>` frame to a JPEG Buffer (~85% quality
   to keep payload small for the Claude Vision API call).
7. Buffer feeds `vision.extract(buf, sheetMode)` → opp species list
   (closed) or full opp kits (open). For the open-sheet path, the
   *same grab* also yields my-team data — so the user doesn't have to
   type their own team separately.
8. Result feeds `priors.expand` per opp slot (closed sheet only) and
   then `engine.recommendBPFromSpecies` (closed) or `engine.recommendBP`
   (open).
9. Result panel renders: extracted teams (with sprites + names + items
   where available) + top-3 ranked bring picks with rationale.
10. User can re-grab if frame was bad. Recommendation updates idempotently.

## Phases

### M5.5 — manual-trigger v1

Ships everything in §Workflow steps 1–9 with **manual** grab.

**Done when**: with a real capture card + Switch + open-sheet team
preview screen, pressing the hotkey produces a recommendation panel
within ≤3 s end-to-end (Claude Vision API latency dominates).

### M5.6 — auto-detect

Image classifier identifies the team-preview screen and auto-grabs
when a stable frame is seen. Approach options (cheapest first):

1. **Template match** on the prompt-text region or the 6-row column
   geometry. Works regardless of UI locale because the layout is
   locale-invariant. Single OpenCV.js or pure-canvas template-match
   pass.
2. **Pixel histogram heuristic**: team-preview backgrounds are visually
   distinct (arena tile + signature panel colors). One-shot RGB
   histogram check.
3. **Cooldown**: don't re-trigger for N seconds after a successful
   grab. Prevents flicker on minor frame changes during the
   30-second team-preview window.

**Done when**: opening the team-preview screen during a real game
auto-fires a grab without user input, exactly once per visit.

### M5.7 — per-opp note overlay

Hooks into M7's note-taking model:

- A note pane lets the user record observed facts mid-match
  ("opp Caly used Astral Barrage, locked Specs", "Incineroar revealed
  Knock Off").
- Notes feed `priors.refine` (deferred to M7 in
  `dev/plans/03-priors-design.md`) to narrow the kit distribution.
- Re-runs the pipeline so the recommendation reflects the refined
  prior across games 2 and 3 of a series.

This is post-MVP and depends on M7. Calling it out so the layout is
designed with a side-panel slot from day 1.

## Open questions

1. **`getUserMedia` vs. OBS virtual camera.** `getUserMedia` is simpler
   if it works — Chromium enumerates capture devices directly. Some
   capture cards / driver combos may need OBS in front (acting as a
   virtual camera). Test on the actual hardware before committing.
2. **Frame quality settings.** Capture cards typically output 1080p60.
   That's plenty for Claude Vision. Re-encode to JPEG ~85% before the
   API call to keep payload size down (rough budget: <250 KB per frame).
3. **Background-window hotkeys.** `Electron.globalShortcut` works while
   the app is in the background. Confirm doesn't conflict with OBS /
   Xsplit hotkeys that streamers may run alongside. Default keybind
   should be customisable.
4. **macOS camera permission.** `getUserMedia` will trigger the
   system camera-permission prompt on first run. Document; don't
   surprise the user.
5. **Cross-platform device naming.** Capture-card device names vary
   per OS and brand. UI should expose all video devices and let the
   user pick — no hard-coded brand string.
6. **UI locale of the captured screen.**
   `dev/research/champions-ui-team-preview-2026-04-28.md` covers this:
   the vision prompt asks for English Showdown-canonical species/item
   names regardless of UI label language. Vision-by-sprite is more
   robust than OCR-by-label.
7. **Open- vs. closed-sheet detection.** UI knob initially. Auto-detect
   is a M5.6 sub-feature: closed-sheet opp rows show empty item-icon
   slots; open-sheet rows show populated item icons. Histogram-based
   detection is plausible but fragile to game patches; user-toggle is
   the safe default.
8. **Where do AnthropicAPI keys live?** `process.env.ANTHROPIC_API_KEY`
   read in the Electron main process, passed to the pipeline via IPC
   never exposed to the renderer. Same pattern as any Electron app
   using cloud APIs.

## Non-goals

- **Replacing OBS for streamers.** This is a single-purpose app. Users
  who already stream with OBS may want to feed the OBS virtual camera
  as the input source — support that path but don't ship our own scene
  compositor or stream-overlay system.
- **Multi-Switch / multi-source capture.** One game at a time.
- **Cloud frame upload.** Frames stay local; only the JPEG sent to
  Claude Vision (which is the same API call M5 makes via the static
  path).
- **Recording / replay.** Snapshot only. Recording is OBS's job.
- **Auto-translation of UI text.** Vision works locale-independently
  via sprite ID; no need for live text translation.

## Acceptance criteria (M5.5)

- App launches; device picker enumerates ≥1 video device on a machine
  with a connected capture card.
- Bound to a real capture card with a Switch in dock mode, live video
  shows in the main panel within ≤2 s of device selection.
- Hotkey grab produces a frame matching the displayed video (visible
  flash or screenshot-confirm UI feedback).
- Frame fed through the M5 pipeline returns a non-error result for the
  test fixture
  `data/fixtures/champions-team-preview-zh-tw-2026-04-28-001.jpg`
  (used as a recorded-source input in the E2E test).
- Result panel displays the extracted team and the top-3 bring picks
  within ≤3 s end-to-end (Claude Vision API latency dominates).
- One end-to-end pipeline test using the recorded fixture as the input
  source — runs offline-deterministic except for the Claude Vision
  call, which is mocked or skipped in CI per agent file convention.
- Cross-platform packaging (macOS dmg + Windows nsis) builds via
  `electron-builder`.

## Dependencies

- **M5 first.** `vision.extract(image, sheetMode)` must be callable.
  This plan assumes M5 ships before M5.5 starts.
- Engine + priors are already in place; M5.5 glues a frontend in
  front. No engine or priors changes.
- Adds `apps/*` to `pnpm-workspace.yaml`.
- New runtime deps: `electron`, `electron-builder` (devDep). Renderer
  uses React (already implied for M7 web UI; standardise here).

## What this track does NOT do

Documented gaps so future-you knows what's intentionally absent at
M5.5:

- **No local sprite-cache.** Every grab hits the Claude Vision API. A
  sprite-recognition local model (e.g. CLIP fine-tune on Pokemon
  sprites) is interesting but premature; pay-per-call is fine for
  single-user.
- **No multi-frame fusion.** One frame in, one recommendation out.
  Multi-frame consensus (grab 3 frames over 1 s, vote) could fix
  sprite-mid-animation edge cases — defer to a follow-up if the
  single-frame path produces wrong answers in practice.
- **No game-state inference.** The pipeline can't tell which turn
  you're on, what's been used, etc. Notes layer (M5.7 / M7) covers
  that.
