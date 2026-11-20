# Sarvam Buildathon — Autonomous Queue Status (Lane A)

Branch: `feat/buildathon-live-relay`

---

## Phase P1.6: Pages viewer, collapsible sheet, audio and caption fixes

- **Commit:** `539224a` (`P1.6: pages viewer, collapsible sheet, audio and caption fixes`)
- **Build & Typecheck:** `npm run build` (PASS), `npx tsc --noEmit` (PASS)
- **Tests:**
  - Unit (`cd web && npm test`): **160/160 passed** (including 5 new suites in `web/tests/relay-p1-6.test.mjs`)
  - Playwright E2E `web/e2e/relay_p1_6_pages_sheet_audio.py`: **7/7 passed** (`intro-390x844`, `intro-375x667`, `page-viewer`, `sheet-drag`, `sheet-add-page`, `sound-banner`, `gemini-error`)
  - Playwright E2E `web/e2e/relay_p1_5_live_video.py`: **6/6 passed**
  - Playwright E2E `web/e2e/relay_intro_camera.py`: 5/6 passed (2a, 2b+2c, 2d, 2e, 2h passed; test 2f expects `relay-shutter` immediately because it predates P1.5 switching default mode to `live` — noted for P7 cleanup)
- **Step 0 & Root Causes Found:**
  - *Silent audio on iPhone:* `AudioWorkletNode('player-processor')` had no ready handshake or pre-ready buffer queue (early PCM chunks could be dropped before the worklet booted), `navigator.audioSession.type = 'play-and-record'` was not set, there was no `visibilitychange` / first-touch / post-reconnect `AudioContext.resume()`, and no 2 s suspended / 1.5 s silent-playback `"Tap to turn on sound"` recovery banner.
  - *Lightning bolt emoji & odd captions:* `CameraScreen.tsx` literally appended `' ⚡'` inside `client.onInterrupted`, neither input nor output captions were sanitized for emoji/`{}`/`[]`/`<noise>`/short noise, input echo during Gemini playback was not suppressed, and `speechConfig.languageCode` locked non-native-audio models to one language.
  - *Non-tappable thumbnail & undraggable sheet:* Scan thumbnail was a plain `<div>` (now a real 44 px+ `<button>` opening `PageViewer`), and `LiveSheet` had only a binary click toggle (now 3-detent `collapsed`/`half`/`full` with pointer drag, momentum snap, 250 ms ease, keyboard support, and pages strip).
- **Decisions Made:**
  - `sanitizeCaption('{} esto hora 500 {}', 'input')` strips `{}` and keeps `'esto hora 500'` because it has 8 Unicode letters (>= 2 letters); empty brackets, emojis, numbers-only, and single-letter tokens return `""` and are never shown as bubbles.
  - New i18n keys (17 keys) were added to all 9 locales (Tamil and Hindi translated; Telugu/Malayalam/Kannada/Marathi/Bengali/Odia use English strings for now — see `web/src/i18n/*.json`).
- **What to Test by Hand on iPhone (Safari):**
  1. Open Live Relay: confirm the intro is a rounded teal card on cream background with `"Start scanning"` visible without scrolling.
  2. Switch to Scan pages, capture a gas bill, tap the bottom-left thumbnail (with `1` badge) -> opens full-screen Page viewer; pinch-to-zoom, double-tap zoom, swipe between pages, try `Discuss this page` and `Delete page`, and iOS back-swipe closes the viewer first.
  3. Tap Proceed -> swipe the Gemini sheet down to the 72 px bar (verify shutter stays reachable above it), tap handle to cycle collapsed -> half -> full, swipe back up.
  4. Tap `Add page` from the sheet -> adds page 2 into the same strip with `"Page 2 added"` toast without restarting Gemini; ask by voice to compare page 1 and page 2.
  5. Confirm Gemini speaks reliably on the first answer, speaking wave follows actual audio playback, and no `⚡` or `{}` captions appear. If silent, check `"Tap to turn on sound"` banner and ring/silent switch.
- **Manual Preview Redeploy Commands (NOT run):**
  ```bash
  cd web && VITE_RELAY_SKIP_APPCHECK=1 npm run build -- --mode relay
  npx firebase-tools hosting:channel:deploy relay --project sarvam-510715 --expires 30d
  ```
- **Known Issues:** `relay_intro_camera.py` test 2f still assumes Scan mode is default (will update in P7).

---

## Phase P1.7: Seamless conversation with Gemini (turn-taking, noise, echo, stuck sessions)

- **Commit:** `9bebf71` (`P1.7: seamless conversation: noise gate, false barge-in guard, turn watchdog`)
- **Build & Typecheck:** `npm run build` (PASS), `npx tsc --noEmit` (PASS)
- **Tests:**
  - Unit (`cd web && npm test`): **165/165 passed** (including 5 new suites in `web/tests/relay-p1-7.test.mjs`)
  - Playwright simulator `web/e2e/relay_p1_7_conversation.py`: **6/6 passed** (`debug-overlay`, `junk-filter`, `false-barge-in`, `real-interrupt`, `watchdog-recovery`, `socket-silence`)
- **Activity Detection Route & Thresholds (Step 0):**
  - Inspected `web/node_modules/@firebase/ai/dist/ai.d.ts`: `LiveGenerationConfig` supports `speechConfig`, `responseModalities`, `inputAudioTranscription`, `outputAudioTranscription`, `contextWindowCompression`, and `maxOutputTokens`, but does **NOT** expose `realtimeInputConfig`, `automaticActivityDetection`, `activityHandling`, or manual `activityStart`/`activityEnd` on `LiveSession`.
  - **Route taken:** Kept server-side activity detection and placed a pure local `ConversationGate` (`web/src/features/relay/audio/ConversationGate.ts`) ahead of `client.sendAudio()` so silence and ambient noise are NEVER sent to Gemini.
  - **Thresholds:** 20 ms PCM16 frames (320 samples @ 16 kHz); 1.5 s initial ambient noise-floor calibration (slow EMA `alpha = 0.02` while closed & Gemini silent); speech onset `rms > max(floor * 2.5, 0.015)` sustained for `120 ms`; `300 ms` pre-roll (15 frames) flushed on onset; `700 ms` hangover before closing; playback ducking threshold `max(base * 2.0, playbackRms * 1.8 + 0.03)`; false barge-in guard requires local speech `>= 200 ms` seen within the last `400 ms` to accept a server `"interrupted"` event.
  - **Watchdogs (`relayTurnState.ts`):** `thinking > 6 s` -> `"Still thinking…"` + nudge; `12 s` -> reconnect with resumption handle + resend last user turn once; `20 s` -> friendly `"Gemini did not answer. Try again"` card with Retry; `modelSpeaking` 5 s audio stall -> force `idle`; 30 s idle socket silence -> reconnect with resumption handle.
  - **Transcript honesty (`transcriptAssembler.ts`):** Drops closed-gate input fragments, drops `< 2` word lines with `< 400 ms` speech, shows `"You"` only after turn ends, streams Gemini live, marks cut-off answers with `"…"` (never `⚡`).
- **What to Test by Hand on iPhone:**
  1. *Quiet room:* ask a question -> Gemini answers fully and returns cleanly to `Listening`.
  2. *Noisy room / venue:* let ambient chatter play -> confirm gate stays closed (verify with `?debug=1`), no junk `"You"` bubbles appear, and Gemini does not trigger on background noise.
  3. *Talk over Gemini:* speak deliberately louder than Gemini for > 0.3 s -> Gemini stops immediately and marks its cut-off bubble with `…`; clap/tap briefly (< 200 ms) -> Gemini keeps talking.
  4. *Stay silent for 30 s:* confirm automatic resumption reconnect keeps the session alive without getting stuck.
  5. *Background TV voice:* confirm Gemini ignores voices not addressed to it and never shows emoji.
- **Known Issues:** None.

---

## Phase P2: Video room (LiveKit), invite family, guest page

- **Commit:** `1350c1b` (`P2: video room, invite family, guest page`)
- **Build & Typecheck:** `npm run build` (PASS; `RoomGuest` code-split into 17.3 kB chunk without Gemini/firebase/ai), `npx tsc --noEmit` (PASS)
- **Tests:**
  - API pytest (`cd api && .venv/bin/pytest test_relay_rooms.py -v`): **6/6 passed** (health, code format + host grants, guest mic-only grants + 3-guest cap, not_found/expired/ended, host key auth on `/settings` & `/end`, 30/hr/IP rate limit)
  - Web unit (`cd web && npm test`): **168/168 passed** (including 3 new suites in `web/tests/relay-p2.test.mjs`)
  - Two-context WebRTC Playwright E2E (`web/e2e/relay_p2_video_room.py`, live uvicorn + real LiveKit Cloud, no screenshots per harness rule): **5/5 passed** (`host-create`, `guest-bad-code`, `guest-video` with `videoWidth > 0` & `readyState >= 2`, `host-sees-guest`, `host-end-guest-ended`)
- **Product Bug Caught & Fixed During Testing:**
  - `RoomGuest` initially dropped the host's video track if `RoomEvent.TrackSubscribed` fired before React mounted the call screen's `<video>` element. Added `pendingVideoTrackRef` + a `[screen]` effect to attach immediately once `<video>` mounts.
- **Decisions Made:**
  - Followed `docs/buildathon/09_UPDATE_SAME_PROJECT.md`: in-memory room store mirrored into LiveKit room metadata, zero Firestore changes, `sarvam-relay-api` commands documented in `docs/buildathon/DEPLOY.md` (not run).
  - `/r/:code` is intercepted in `web/src/main.tsx` before loading `App.tsx`, keeping the guest bundle free of Gemini Live code.
- **What to Test by Hand (iPhone + Laptop after running `docs/buildathon/DEPLOY.md`):**
  1. On iPhone, open Live Relay and tap **Invite family** -> confirm QR code, 4-char code boxes, WhatsApp share, Copy link, and `"Guests can show their camera"` toggle appear while Gemini stays connected.
  2. Hide the Invite sheet -> confirm compact `"Room XXXX · 1 in the room"` pill stays on screen and camera/Gemini keep working; flip camera and confirm video updates on the guest.
  3. On laptop Chrome (or second phone), open `/r/XXXX`, enter a name and pick Tamil/English, tap **Join with mic on** -> confirm host camera video appears full screen and both sides hear each other.
  4. Test a wrong code `/r/ZZZZ` -> confirm friendly error.
  5. Tap **End** on host -> confirm guest immediately sees `"Room ended"` screen.
- **Known Issues:** None.

---

## Phase P3: Gemini hears everyone, speaker names, camera handoff, End and save

- **Commit:** `8a68ece` (`P3: Gemini in the room, captions, camera handoff, End and save`)
- **Build & Typecheck:** `npm run build` (PASS), `npx tsc --noEmit` (PASS)
- **Tests:**
  - API pytest (`cd api && .venv/bin/pytest test_relay_rooms.py -v`): **8/8 passed** (including new `/api/relay/permissions` host-key & LiveKit permission update + `/api/relay/translate` Vertex Gemini Flash + graceful fallback)
  - Web unit (`cd web && npm test`): **173/173 passed** (including 5 new suites in `web/tests/relay-p3.test.mjs`: `RoomAudioMixerGraph` anti-feedback & per-source gating, `SpeakerNoteTracker` 600 ms debounce + caption broadcast schema, `cameraHandoff` state machine, room prompt, IndexedDB `relaySessions` schema)
  - Two-context WebRTC Playwright E2E (`web/e2e/relay_p3_gemini_room.py`, live uvicorn + real LiveKit Cloud, no screenshots per harness rule): **4/4 passed** (`privacy-banner`, `camera-handoff` with active frame source switching to `'guest'` & `"(Now showing Arun's camera)"`, `caption-broadcast`, `end-and-save` opening read-only `RelaySessionViewer` from Recent)
- **What to Test by Hand on Two Phones:**
  1. Phone A (Host): open Live Relay, tap **Invite family**, enable **"Guests can show their camera"**, share link/code with Phone B.
  2. Phone B (Guest, e.g. Amma): open `/r/XXXX`, enter `"Amma"`, select **தமிழ் (Tamil)**, tap **Join with mic on**. Confirm Phone A shows `"Everyone in the room can see the camera"`.
  3. Amma asks a question aloud in Tamil about what Phone A's camera is showing -> confirm Gemini answers aloud on BOTH phones (via published `"gemini"` track), and speaker-labelled captions appear on both phones (with English/Tamil translation when languages differ).
  4. Phone A taps **Freeze and ask** -> confirm Phone B receives `"Pinned page 1"` chip and tapping it shows the small thumbnail.
  5. Phone B taps **Show my camera** -> Phone A taps **Allow** (or test auto-grant after pausing Phone A's video) -> confirm Phone B's camera becomes full-screen on both phones with `"Amma's camera"` chip and Gemini sees Phone B's camera; tap **Take back camera** on Phone A to return.
  6. Phone A taps **End** -> confirm Phone B shows `"Room ended"`, and Phone A's Home Recent list shows the new session with a **"Live Relay"** badge that opens the read-only transcript & pages viewer.
- **Known Issues:** None.

---

## Phase P7: Merge lane B, polish, tests, README, deploy commands

- **Lane B Merge:** Merged `feat/buildathon-lane-b` (`816e162` P4 Form Fill to PDF + `cf9fcb9` P5 Ask Sarvam on Home) cleanly into `feat/buildathon-live-relay`:
  - Resolved all 9 locale JSON conflicts with full key union (758 keys verified across all 9 languages via `web/scripts/check-i18n.mjs`, preserving optional `deadlinePassed` parity for `action_chips.test.mjs`).
  - Unified `sarvam_db` IndexedDB v5 stores (`recent_results`, `original_files`, `read_cache`, `profile`, `drafts`, `reminders`, `relaySessions`) and shared `RelaySessionRecord` type across Lane A's `RelaySessionViewer` and Lane B's `AskHome`.
  - Added `"Fill a form"` chip (`data-testid="relay-fill-form-chip"`) on `CameraScreen` calling `openFormFill(pages, { isInRoom })`, and taught `AskSheet` to recognize `"fill this form"` and launch Form Fill directly.
- **Production Clean-up & Security Hygiene:**
  - `RelaySpikeScreen` is gated behind `import.meta.env.DEV` at the `lazy()` call site and verified **absent** from `web/dist/assets/`.
  - `RoomGuest` stays code-split (`17.32 kB` chunk) without Gemini Live SDK.
  - `git grep` verified zero `AIza` keys or `LIVEKIT_API_SECRET` values in tracked files; `.env.*.local` files verified gitignored.
  - Console logs contain only stage/audio counts & timings, never tokens or user content.
- **Docs Completed:**
  - `README.md`: added `"What I built at the buildathon (20 Nov 2026)"` citing merge-base `3a69b3d`, architecture diagram, Google AI/Cloud usage, privacy guarantees, and known limits.
  - `docs/buildathon/DEPLOY.md`: final copy-paste Secret Manager + Cloud Run (`sarvam-relay-api`) + web build + Firebase preview channel deploy commands, 10-line two-phone smoke test, submission checklist, and cost guard.
  - `docs/buildathon/DEMO_SCRIPT.md`: 60-second pitch, 3-minute exact-tap live demo script, and venue network backup plan.

---

## Final Summary Across All Phases

| Phase | Status | Commit | Key Verification |
| --- | --- | --- | --- |
| P1.6 Pages viewer, 3-detent sheet, audio & captions | PASS | `539224a` | 160 unit + 7/7 P1.6 E2E + 6/6 P1.5 E2E |
| P1.7 Seamless conversation (noise gate, false barge-in, watchdog) | PASS | `9bebf71` | 165 unit + 6/6 P1.7 simulator E2E |
| P2 Video room (LiveKit), invite family, guest page | PASS | `1350c1b` | 168 unit + 6/6 pytest + 5/5 two-context LiveKit E2E |
| P3 Gemini in room, speaker names, camera handoff, End & save | PASS | `8a68ece` | 173 unit + 8/8 pytest + 4/4 two-context LiveKit E2E |
| P4 Form fill to PDF (merged from Lane B) | PASS | `816e162` | `formfill.test.mjs` + 5/5 pytest + `formfill_p4.py` (pypdf verified) |
| P5 Ask Sarvam on Home (merged from Lane B) | PASS | `cf9fcb9` | `ask-home.test.mjs` + `ask_home_p5.py` |
| P7 Merge, polish, i18n check, docs, full E2E + headed trace | PASS | *(see git log)* | 190/190 unit + 13/13 pytest + 758/758 i18n + **8/8 Playwright E2E suites** |

- **Total Verified Test Counts (Post-Merge):**
  - Web unit tests (`cd web && npm test`): **190 / 190 passed**
  - i18n parity script (`node web/scripts/check-i18n.mjs`): **758 keys × 9 locales passed**
  - API pytest (`cd api && .venv/bin/pytest test_relay_rooms.py test_formfill.py`): **13 / 13 passed**
  - Playwright E2E (**8 / 8 suites passed**):
    - `relay_intro_camera.py`: **7 / 7 passed**
    - `relay_p1_5_live_video.py`: **6 / 6 passed**
    - `relay_p1_6_pages_sheet_audio.py`: **7 / 7 passed**
    - `relay_p1_7_conversation.py`: **6 / 6 passed**
    - `relay_p2_video_room.py`: **5 / 5 passed** (two-context real LiveKit Cloud)
    - `relay_p3_gemini_room.py --headed-trace`: **4 / 4 passed** (headed two-context real LiveKit Cloud; traces saved to `docs/buildathon/shots/trace/p3-host-trace.zip` & `p3-guest-trace.zip`)
    - `formfill_p4.py`: **PASS** (1-page PDF verified with `pypdf`)
    - `ask_home_p5.py`: **PASS**
- **Known Issues / Remaining Human Actions:**
  - Non-Tamil/non-Hindi Indian locales (`te`, `ml`, `kn`, `mr`, `bn`, `or`) use English fallback strings for the newly added P1.6–P3 relay keys (all 758 keys are populated and non-empty so zero missing-key errors occur).
  - Run `docs/buildathon/DEPLOY.md` commands by hand (`gcloud auth login` -> Secret Manager -> `sarvam-relay-api` -> preview channel deploy) and execute the 10-line two-phone smoke test before submitting at 11:00 PM.
  - Remember to set the billing budget alert on `sarvam-510715` and scale `sarvam-relay-api` back to `--min-instances 0` after the event.
