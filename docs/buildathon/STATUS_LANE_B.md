# Lane B Status (`feat/buildathon-lane-b`)

## Phase P4: Form fill to PDF
- **Status:** PASS
- **Commit:** (pending commit — recorded right below on next update)
- **Design & implementation decisions:**
  - **Box coordinates:** Standardized on `[x1, y1, x2, y2]` in `0..1000` (top-left origin) per `B1_P4_FORM_FILL.md`, validated and clamped server-side (`api/formfill/router.py`) and converted to PDF bottom-left points in `web/src/features/formfill/formMath.js`.
  - **API:** Added `api/formfill/__init__.py` and `api/formfill/router.py` mounted in `api/main.py` (`POST /api/formfill/detect` and `POST /api/formfill/extract`), using `reader.get_client()` + `reader.call_gemini_with_retry()` (`reader.MODEL_ID` Flash first, fallback to `reader.FALLBACK_MODEL_ID`). Signature and photo fields are never mapped to `profileKey` and never filled/extracted. Logs emit counts and timings only.
  - **IndexedDB (`sarvam_db` v4):** Additive migration adding `profile` (keyPath `id`) and `drafts` (keyPath `id`, index `createdAt`) with zero data loss to existing stores (`recent_results`, `original_files`, `read_cache`). ID numbers (`pan`, `aadhaar`) are stripped unless `saveIds` ("Save ID numbers on this phone") is enabled.
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
  - `cd web && npm test`: PASS (`164/164`, including 9 new tests in `web/tests/formfill.test.mjs`)
  - `api/.venv/bin/pytest api/test_formfill.py`: PASS (`5/5`)
  - Playwright E2E `web/e2e/formfill_p4.py` (390×844, port 5174, full Chromium, mocked formfill API): PASS (verified 6 auto-filled fields, masked PAN charGrid, blank signature, missing Nominee prompt & extract, valid 1-page PDF containing `Asha R`, `Priya S`, `05-01-1990` via `pypdf`, and Keep in Sarvam draft showing in Home Recent as `"Draft · sign by hand"`).
- **How to test on iPhone:**
  1. Open Home, tap **Fill a form**, tap **Try sample KYC form** (or take a photo of a real paper form).
  2. Enter your details in **My details** (leave Nominee empty to test voice/text follow-up; toggle **Save ID numbers on this phone** if testing PAN masking).
  3. Confirm filled boxes appear in blue Caveat handwriting, PAN is masked until tapped, and Signature stays blank (mustard tint).
  4. Answer the missing field via mic or text, tap **Review and save**, then tap **WhatsApp** / **Save to Files** to export the PDF, or **Keep in Sarvam** to see it under Recent as `"Draft · sign by hand"`.
- **Known gaps:**
  - Word and Google Doc export tabs in the Share sheet show "coming soon" notes (PDF is live, per product spec N4).
  - Non-Latin scripts in PDF generation are stripped for standard Helvetica WinAnsi encoding (full Indic font embedding in `pdf-lib` via `@pdf-lib/fontkit` is deferred).
  - Real-device mic recording in solo mode depends on `/api/transcribe` being reachable.
