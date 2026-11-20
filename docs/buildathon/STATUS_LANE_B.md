# LANE B DONE

**Branch:** `feat/buildathon-lane-b` (worktree `/Users/vigneshwaran/Projects/sarvam-lane-b`)
**Summary:** Both Lane B phases (**P4: Form fill to PDF** and **P5: Ask Sarvam on Home**) are implemented, verified (`tsc -b`, `vite build`, 172/172 Node unit tests, backend `pytest`, and both Playwright 390×844 E2E suites on port 5174), and committed cleanly with zero edits to Lane A files (`CameraScreen.tsx`, `LiveSheet.tsx`, `web/src/features/relay/room/*`, `web/src/features/relay/live/*`, `api/relay/*`, `docs/buildathon/STATUS.md`) and nothing committed under `docs/buildathon/queue/` or `queue.zip`.

---

## Phase P4: Form fill to PDF
- **Status:** PASS
- **Commit:** `816e162` (`P4: form fill to PDF`)
- **Design & implementation decisions:**
  - **Box coordinates:** Standardized on `[x1, y1, x2, y2]` in `0..1000` (top-left origin) per `B1_P4_FORM_FILL.md`, validated and clamped server-side (`api/formfill/router.py`) and converted to PDF bottom-left points in `web/src/features/formfill/formMath.js`.
  - **API:** Added `api/formfill/__init__.py` and `api/formfill/router.py` mounted in `api/main.py` (`POST /api/formfill/detect` and `POST /api/formfill/extract`), using `reader.get_client()` + `reader.call_gemini_with_retry()` (`reader.MODEL_ID` Flash first, fallback to `reader.FALLBACK_MODEL_ID`). Signature and photo fields are never mapped to `profileKey` and never filled/extracted. Logs emit counts and timings only.
  - **IndexedDB (`sarvam_db` v4 -> bumped to v5 in P5):** Additive migration adding `profile` (keyPath `id`) and `drafts` (keyPath `id`, index `createdAt`) with zero data loss to existing stores (`recent_results`, `original_files`, `read_cache`). ID numbers (`pan`, `aadhaar`) are stripped unless `saveIds` ("Save ID numbers on this phone") is enabled.
  - **UI & font:** Bundled Caveat (`@fontsource/caveat` in `web/src/styles/fonts.css`) for blue `#2B4DB0` handwriting-style overlays in `FormFillScreen.tsx`. Added `MyDetailsSheet.tsx` and `FormFillPickerSheet.tsx` (Take photo / Choose from files / Try sample KYC form). Added "Fill a form" card on Home right below Live Relay, plus Recent entries for saved drafts marked `"Draft · sign by hand"`.
  - **PDF generation (`pdf-lib`):** `web/src/features/formfill/pdfBuilder.js` renders scanned page images with drawn blue text, per-cell `charGrid`, vector checkmarks, and AcroForm field filling when input is a fillable PDF. Signature/photo boxes are always skipped. File name format: `<Form title> - filled - <YYYY-MM-DD>.pdf`.
  - **Share & Drafts:** Uses Web Share API (`navigator.canShare({ files })` + `navigator.share`) when supported, else downloads PDF. "Keep in Sarvam" / "Later" saves draft to IndexedDB `drafts` store.
  - **Integration helper for Lane A / P7 merge:** Exported `openFormFill(images, options?)` from `web/src/features/formfill/openFormFill.ts` (registered by `App.tsx`). To add a "Fill a form" chip on `CameraScreen.tsx` / `PagesView.tsx` during P7 merge, call:
    ```ts
    import { openFormFill } from '../formfill/openFormFill'
    openFormFill(capturedPageDataUrls, { formTitle, liveBridge, isInRoom })
    ```
    Passing `liveBridge` (`{ isOpen: true, sendPrompt, onUserTranscript }`) automatically prompts Gemini Live for missing fields one at a time and extracts answers via `/api/formfill/extract`. Passing `isInRoom: true` shows the `"Only visible on your phone"` privacy pill and keeps form values local.
  - **i18n:** Added top-level `"formFill"` object (77 keys) across all 9 locale files (`en`, `ta`, `hi`, `te`, `ml`, `kn`, `mr`, `bn`, `or`). Natural translations added for `ta` and `hi` (key UI labels); remaining keys in `te`, `ml`, `kn`, `mr`, `bn`, `or` and long strings use English fallbacks (all keys present and verified by `formfill.test.mjs`).
- **Tests passed:**
  - `cd web && npm run build` (`tsc -b && vite build`): PASS
  - `cd web && npm test`: PASS (`164/164` at P4 commit, `172/172` after P5; includes 9 tests in `web/tests/formfill.test.mjs`)
  - `api/.venv/bin/pytest api/test_formfill.py`: PASS (`5/5`)
  - Playwright E2E `web/e2e/formfill_p4.py` (390×844, port 5174, full Chromium, mocked formfill API): PASS (verified 6 auto-filled fields, masked PAN charGrid, blank signature, missing Nominee prompt & extract, valid 1-page PDF containing `Asha R`, `Priya S`, `05-01-1990` via `pypdf`, and Keep in Sarvam draft showing in Home Recent as `"Draft · sign by hand"`).
- **How to test P4 on iPhone:**
  1. Open Home, tap **Fill a form**, tap **Try sample KYC form** (or take a photo of a real paper form).
  2. Enter your details in **My details** (leave Nominee empty to test voice/text follow-up; toggle **Save ID numbers on this phone** if testing PAN masking).
  3. Confirm filled boxes appear in blue Caveat handwriting, PAN is masked until tapped, and Signature stays blank (mustard tint).
  4. Answer the missing field via mic or text, tap **Review and save**, then tap **WhatsApp** / **Save to Files** to export the PDF, or **Keep in Sarvam** to see it under Recent as `"Draft · sign by hand"`.
- **Known gaps (P4):**
  - Word and Google Doc export tabs in the Share sheet show "coming soon" notes (PDF is live, per product spec N4).
  - Non-Latin scripts in PDF generation are stripped for standard Helvetica WinAnsi encoding (full Indic font embedding in `pdf-lib` is deferred).
  - Real-device mic recording in solo mode depends on `/api/transcribe` being reachable.

---

## Phase P5: Ask Sarvam on Home, memory recall, approval cards, reminders
- **Status:** PASS
- **Commit:** committed in this turn (`P5: Ask Sarvam on Home, memory recall, approval cards, reminders`)
- **Step 0 audit findings:**
  - **(a) Existing Ask screen & endpoint:** `web/src/components/AskSheet.tsx` calling `askDocument()` in `web/src/api.ts` -> `POST /api/ask` (multipart FormData: `question`, `lang`, `result`, optional `files`, optional `history`).
  - **(b) Existing tool chips/cards:** `AskSheet.tsx` previously rendered `points`, `steps`, `facts`, `quote`, and `follow_ups` chips only — no agentic approval cards existed. Implemented fenced JSON proposal parsing + stripping (`askProposals.js`) with explicit Add / Not now approval cards (`AskHomeCards.tsx`).
  - **(c) CalendarEditSheet & utils/ics.ts:** `web/src/components/CalendarEditSheet.tsx` and `web/src/utils/ics.ts` (`generateIcs`, `downloadIcs`, `shareIcsFile`, `canShareIcsFile`) — reused directly for `propose_calendar_event`.
  - **(d) IndexedDB stores:** `sarvam_db` had `recent_results`, `original_files`, `read_cache`, `profile`, `drafts` (v4). Neither `relaySessions` nor `gmailItems` existed prior to P5. Bumped `sarvam_db` additively to v5 adding `reminders` and `relaySessions` (empty until populated), while `searchMemory()` checks `db.objectStoreNames.contains(...)` so any missing store (`documents`, `history`, `gmailItems`, `relaySessions`, etc.) is skipped silently and never throws.
  - **(e) Notifications panel & Home "Today and tomorrow":** `HomeScreen.tsx` previously had only a single `nextUp` strip + `RemindersPage` behind "View all". Added header bell icon with badge count opening Notifications (`RemindersPage`) and the `"Today and tomorrow"` white card on Home displaying accepted reminders.
- **What changed:**
  - `web/src/utils/askMemory.ts` + `web/src/features/askHome/askMemoryCore.js` (`.d.ts`): Unicode-aware tokenizer (`/[\p{L}\p{M}\p{N}]+/gu` keeping Indic combining marks intact across Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Odia + lowercased Latin for Tanglish/Hinglish), keyword overlap + prefix match + recency boost scoring, top-3 excerpt cap (`<= 300` chars), silent missing-store handling.
  - `web/src/features/askHome/askProposals.js` (`.d.ts`): parses & strips fenced JSON blocks for `propose_reminder`, `propose_calendar_event`, and `open_session`, date/time parser, deduplication key (`title + date + time`), and compact 3-excerpt `buildHomeAskContext()`.
  - `web/src/features/askHome/reminderStorage.js` (`.d.ts`): IndexedDB `reminders` store (`sarvam_db` v5) with title+time deduplication, `relaySessions` reader, and dev-only `seedAskDemoSession()` (`?seed=ask` in `import.meta.env.DEV` only; writes `"Electricity bill call"` where Arun says BESCOM bill is Rs 2,340 due on 28 Nov).
  - `web/src/features/askHome/AskHomeCards.tsx` & `RelaySessionModal.tsx`: Source card with title/date/Open (opens document, form draft, or Live Relay session viewer), approval cards with Add / Not now (never acts without a tap), prefilled `CalendarEditSheet` + `.ics` export for calendar events, and in-app toast on reminder add.
  - Small additive edits to `web/src/components/AskSheet.tsx` (`mode="home"`), `web/src/components/v3/HomeScreen.tsx` (Ask Sarvam white pill bar under greeting, header Notifications bell + badge, `"Today and tomorrow"` card), `web/src/App.tsx`, `web/src/types.ts`, `web/src/utils/history.ts`, `web/src/utils/db.ts`, `web/src/features/formfill/profileStorage.js`, and all 9 locale files under top-level `"askHome"` (31 keys).
- **Tests passed:**
  - `cd web && npm run build` (`tsc -b && vite build`): PASS
  - `cd web && npm test`: PASS (`172/172`, including 8 new tests in `web/tests/ask-home.test.mjs` covering Unicode tokenising for Tamil/Hindi/other Indic scripts, scoring/recency/top-3 cap, missing stores never throwing, reminder dedupe, approval card never creating a reminder before a tap, `?seed=ask` Tanglish recall, ICS draft generation, and 9-language i18n parity).
  - `api/.venv/bin/pytest api/test_formfill.py api/test_ask_general.py`: PASS (`13/13`)
  - Playwright E2E `web/e2e/ask_home_p5.py` (390×844, port 5174, full Chromium, mocked `/api/ask` + `?seed=ask`): PASS (verified Home Ask bar, tap opens Ask home mode, Tanglish query recalls seeded session & renders source card + opens session viewer, approval cards create 0 reminders before tap, Not now creates nothing, Add creates reminder visible on Home `"Today and tomorrow"` and in Notifications).
  - Re-ran Playwright E2E `web/e2e/formfill_p4.py` after DB v5 bump: PASS.
- **Screenshots note (macOS test-harness rule):**
  - `docs/buildathon/shots/p5/01_home_ask_bar.png` and `02_ask_answer_source.png` captured cleanly; subsequent `page.screenshot()` calls hit the known macOS headless Chromium compositor timeout (`4s` short-timeout guard caught them cleanly so DOM/IndexedDB assertions completed without stalling).
- **How to test P5 on iPhone:**
  1. Open the dev preview with `/?seed=ask` (this seeds `"Electricity bill call"` into IndexedDB `relaySessions`).
  2. On Home, confirm the white **Ask Sarvam** pill bar appears under the hero greeting and the bell icon appears in the header.
  3. Tap the Ask Sarvam bar and ask in Tanglish: `"Arun bill pathi enna sonnaan?"`. Confirm the reply quotes Rs 2,340 / 28 Nov and shows the `"Electricity bill call"` source card; tap **Open** to inspect the session transcript.
  4. Ask `"remind me two days before"` -> confirm a Reminder approval card appears with **Add** / **Not now** (nothing saved yet). Tap **Add** -> confirm in-app toast appears, close Ask, and verify the reminder appears both in Home **Today and tomorrow** and in the **Notifications** panel (bell icon). Reload the page to confirm persistence.
- **Known gaps (P5):**
  - Natural translations added for `ta` and `hi` key labels under `askHome`; remaining keys in `te`, `ml`, `kn`, `mr`, `bn`, `or` use English fallbacks (all 31 keys exist across all 9 locales).
  - `?seed=ask` is guarded by `import.meta.env.DEV` (stripped in production builds) and should be removed in P7 cleanup per spec.
  - Real LLM compliance for emitting fenced JSON proposals on `/api/ask` depends on the backend `/api/ask` prompt honoring the `summary` hint (tested end-to-end with mocked `/api/ask` per P5 #8).
