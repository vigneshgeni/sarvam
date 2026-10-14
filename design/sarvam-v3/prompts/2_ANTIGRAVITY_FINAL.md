# SARVAM: ANTIGRAVITY, FINAL ROUND (bugs, security, performance, the logic behind design v3, and making every designed flow work)

You are Antigravity, working on the Sarvam repo (github.com/vigneshgeni/sarvam). Sarvam is a phone-first PWA that explains official documents in plain language in nine Indian languages (Vite + React + TypeScript in `web/`, FastAPI in `api/`, Gemini on Vertex AI, Cloud Run service `sarvam-api` in asia-south1, project `sarvam-510715`, Firebase Hosting, Firestore for anonymous ratings). Submission is on 16 Oct 2026, so every change must be safe.

**Who does what.** You own logic, API, security, performance and correctness. **Cursor** owns visuals and is rebuilding the whole UI to design v3 **at the same time** on `feat/sarvam-design-v3` (prompt: `design/sarvam-v3/prompts/1_CURSOR_FINAL_DESIGN.md` — read §4 and §5, they list what it needs from you). **Grok** deploys and tests. Do not restyle anything; Cursor does not touch your files.

The design package is at `design/sarvam-v3/` on `main` (paths below are relative to it): `design/index.html`, `design/screens/*.html`, `design/png/*.png`, `design/screens/26-content-mapping-rules.html`, and `samples/` with `samples/SAMPLE_EXPECTED_FACTS_V3.md` and `samples/sample_expected_facts_new3.md` (the older three samples). The expected facts file is the truth for every sample.

This prompt has four parts. Do **Part 1 now**. Do Parts 2–4 only when Vigneshwaran sends you the message that starts them.

## Rules (all parts)
- Merge only your own PRs, with a merge commit (`gh pr ready N`, then `gh pr merge N --merge`). Never squash, rebase-merge or force-push; never merge someone else's PR (except Part 4, when told).
- Merge only when ALL are true: rebased on the latest target branch; all API tests, web tests and the web build pass on the rebased branch (quote the counts); `git status` clean. Otherwise stay a draft and say exactly why.
- Never commit `.env`, `lostfound-api/`, `.firebaserc.old`, `firebase.old.json` or `ROUND2_CHECKLIST.md`. Stage files by name. No secrets, no document text in logs. Fictional samples only. Never claim anything you did not run; say "not run".
- Do not change the model, the Vertex location, Cloud Run settings, the fallback and retry logic, the translate guards or `api/dates.py` unless a numbered item below says so.
- If a `v1-submission` git tag exists, leave it alone. You cannot deploy; Grok deploys after you merge. Say clearly whether `api/`, `firebase.json` or `firestore.rules` changed.

---

## PART 1 (now): bugs, security, performance, and the interfaces design v3 needs
Branch `fix/final-logic` from the latest `origin/main`. Merge into `main` when the merge condition holds. Cursor will rebase onto it.

If an item below was already merged earlier (check `git log origin/main` for `fix/share-ios-and-lab-latency` and Cursor's `fix/hardening-and-web-speed`), **verify it still holds with a test, report "already done", and do not redo it.**

### 1A. Share hides personal details on every path (priority 1, reported on iPhone)
With "Hide personal details" ON, WhatsApp still received personal details. Find every exit: `navigator.share` (text, title, url, files), `wa.me` / `whatsapp://`, Copy, email and SMS links.
1. Every path sends exactly the preview text, using the toggle as it stands at the moment of tapping (check stale closures, cached toggles, a default that differs from what the sheet shows).
2. Toggle ON: `title` has no personal value (use the localised document type, e.g. "Insurance letter · Sarvam"); no `url` carries one; the original document is never attached.
3. Mask formats (shown in the design; the shared text must contain exactly these strings): person names, including a first name alone and names in Indic scripts → first letter of each word, then asterisks of the same length (`Ravi Kumar` → `R*** K****`; Mr./Dr./Smt. kept; initials such as "A." kept); phone numbers in any format and digit system → `**********`; policy, account, UHID, lab, patient, PPO, folio, PAN, case, notice and other IDs → keep separators and the last 3 characters (`SH/IND/22/559102` → `SH/***/**/**102`); emails → `r***@****.com`; home addresses and dates of birth → `[hidden]` (localised). Keep business, hospital, court and lab names, amounts, ordinary dates, medical and legal codes. Structural redaction only (no AI call). Do not loosen anything masked today.
4. One function for every path: `buildShare(result, { hidePersonal }) → { text, title, segments: { text, masked }[] }` with `text === segments.map(s => s.text).join('')`.
5. **NEW** `redactResult(result, { hidePersonal }) → ExplainResult`: a deep copy with the same masks applied to every displayed string (headline, summary, actions, warnings, facts, places, contacts, parts, sections, medicines' names are NOT personal and stay). Save as image renders from it.
6. Tests: every path's exact payload equals `buildShare(...).text` and contains none of the personal values with the toggle ON, for an insurance fixture, a lab report, a Tamil and a Hindi fixture and **all eleven samples**; OFF shows them; ON again hides them. `redactResult` output serialised contains none of the personal values from the samples. Unit-test each mask format including native digits and Indic names.

### 1B. No blank screen after returning from WhatsApp
After sharing to WhatsApp and coming back, the installed PWA showed a blank white screen with only a close button.
- On load, `pageshow` and `visibilitychange`: if an overlay's data is missing, restore the last result from the saved copy if one exists, otherwise close the overlay and go Home with a calm one-line message. Never persist an overlay-open state without its data.
- Export one helper `useOverlayRestore()` (or `ensureOverlayData()`) used by every sheet: Share, Save as image, Listen, Ask, Reminders, Medicine reminders, Password, Delete, Accessibility.
- Never navigate the app's own window to WhatsApp: `navigator.share` where available, otherwise `wa.me` in a new window with `noopener`.
- Tests (jsdom, simulated reload with history state): no empty overlay; the share link never changes the app's own location.

### 1C. Speed: slow lab report and other reports (measure first, fix only what is safe)
1. Measure live, one call at a time (max 30 calls): each sample in English. Per call: total time and, from server logs, PDF extraction, Gemini call and post-processing times, tokens, page count, whether the primary attempt timed out and the fallback ran.
2. Name the biggest cost (thinking setting, output length, page images sent alongside a text layer, prompt size, stages that could run in parallel, the primary timeout).
3. Apply only changes that keep the answers identical: re-run the samples against `samples/SAMPLE_EXPECTED_FACTS_V3.md` and `samples/sample_expected_facts_new3.md`; any changed fact, amount, date or label means revert that change.
4. `useReadingStage() → { stage: 'reading'|'checking'|'writing', progress: 0..1, sourceKind: 'pdf'|'photo', fileCount, pageCount, targetLanguage }` from real events (upload done, request in flight, response received, translate in flight); within a stage ease toward but never reach the next stage. Keep the 90 s timer, reassurance text and Cancel exactly. The 5-page health checkup must finish inside the existing limits; if it cannot, report the time and what would be needed.
5. Report before and after.

### 1D. Security (do or verify each)
- **S1 Repo hygiene** (repo goes public): scan the whole git history for secrets (gitleaks / trufflehog if installed, else targeted `git log -p --all`). Confirm `.gitignore` covers `.env`, `lostfound-api/`, old Firebase files, scratch. List tracked files that should not be public. **Report only; if anything sensitive is found, stop and report first.**
- **S2 Hosting headers** (`firebase.json`): HSTS one year, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` keeping camera and microphone for self and disabling the rest. No strict CSP (say why).
- **S3 API**: CORS only the real origins plus the **preview-channel pattern `^https://sarvam-510715--[a-z0-9-]+\.web\.app$`** (anchored; test that `https://sarvam-510715--x.web.app.evil.com` and `https://example.com` are refused); `/api/extract-text` size cap and calm 400 for wrong types; `Cache-Control: no-store` on document-derived responses; `nosniff` everywhere; error bodies never leak stack traces, paths or prompts (check 400/422/500/503); rate-limit key correct behind Cloud Run without spoofable `X-Forwarded-For` (test); password ≤ 128 chars, never logged.
- **S4 Dependencies**: `pip-audit` and `npm audit --omit=dev`; only patch/minor bumps for vulnerabilities in packages we use; report the rest.
- **S5 Firestore rules**: ratings create-only, anonymous auth required, fields and sizes validated, no read/list, no document text possible. Report; fix minimally if needed.
- **S6 Logs and storage**: no log line, error or rating can hold document text, names or passwords. Report.

### 1E. Performance (do or verify each)
- **P1** `firebase.json` cache headers: `index.html` and the service worker `no-cache`; hashed `/assets/` `public, max-age=31536000, immutable`.
- **P2** Service worker: a new deploy reaches an installed PWA within one or two reloads; `/api` responses and uploaded documents are never cached; **sample files and cached sample results are not precached** (they load on demand).
- **P3** Bundle: report chunk sizes; Indic fonts not fetched for English; heavy sheets lazy if simple; `font-display: swap`.

### 1F. Multi-document uploads and sectioned lab reports (API, additive and backward compatible)
Design screen 15 shows one upload (a 5-page PDF, or several photos/files) that holds several documents, split and shown part by part. Screen 26 §7 has the rules.
1. Extend the explain response (and the translate path) with optional fields; **single-document responses stay exactly as today**:
   ```
   parts?: [{ part_id, title, document_type, issuer?, date_iso?, pages: [start, end],
              glance?, sections?, medicines?, key_points?, summary_lines? }]      // only when 2+ documents
   sections?: [{ heading, page, values: [{ label, value, unit?, ref_range?, flag_printed: 'High'|'Low'|null, evidence }] }]
   actions[i].part_id?, facts[i].part_id?, facts[i].page?
   ```
2. Split only on clear evidence in the pages (new letterhead, issuer, title or date). Never invent a part. One part → no `parts` field.
3. `sections` use the document's own headings, in page order; `value`, `unit` and `ref_range` copied exactly; **`flag_printed` only when the document prints High/Low (or H/L, ↑/↓) for that row, else null**. Sarvam never decides High/Low. Send `sections` for a lab report with more than 4 values (single or part); up to 4 values keep today's glance D.
4. Evidence: every value, amount and date in a part is matched against that part's pages only; keep the existing matching and normalisation.
5. Medicines inside a part follow the existing medicine rules. Decoder: `"at bedtime"` → bedtime slot; non-daily patterns (`once a week`, `weekly`, `alternate days`, `SOS`, `as needed`) → `decoded: false` (weekly) or `as_needed: true`, no slots; never invent a day, a dose or a duration.
6. Actions from all parts merged in page order, each with `part_id`. The overall headline describes the upload ("Your health checkup: a lab report, a prescription and a bill.").
7. Tests: the health checkup sample gives 3 parts with pages [1,3], [4,4], [5,5], six sections with the printed headings, exactly five `flag_printed` values, two medicines (Vitamin D3 weekly not decoded), the 15 Jan 2027 review action tagged to the prescription, the bill F amounts; every single-document sample returns no `parts`. Prompt-size and latency impact reported.

### 1G. The new and changed samples
1. Copy the sample files from `design/sarvam-v3/samples/` (not the .md files) into `web/public/samples/` (keep the `sample-` names): **replace** `sample-lab-report.pdf` with the new one, add `sample-prescription.jpg`, `sample-mutual-fund-statement.pdf`, `sample-court-summons.pdf`, `sample-bank-deposit-slip.jpg`, `sample-health-checkup.pdf`. Register them the same way as the existing six. Home shows 10 sample tiles plus the health checkup tile (Cursor styles them; you register the data in the order of §8 of Cursor's prompt).
2. Regenerate the saved sample results (en, ta, hi, and every language the existing samples already cache) for the changed and new samples using the live API, then **check every fact against `SAMPLE_EXPECTED_FACTS_V3.md`** (amounts, dates, flags, medicines, parts, masks). Any mismatch: fix the cause (prompt, guard, decoder), not the cached file by hand. Report a table sample × field × expected × got.
3. Expected layouts (Cursor renders them): lab report → D (3 values + report date tile, "In range" only where a range is printed and no flag is printed); prescription → medicines, all three decoded with durations; e-challan → B; court summons → C with 10:30 AM (no amount printed); mutual fund → F (invested, value now, gain); deposit slip → numbered steps (6, no dates); health checkup → parts; property tax → A.

### Part 1 merge condition and report
Merge when: tests and build pass after the final rebase; 1A payload tests and 1B reload tests pass; every 1C change kept the facts; 1D S1 found nothing sensitive (else do not merge; report); 1F and 1G tests pass; no unrelated files changed. Cut order if short of time: 1A > 1B > 1G > 1D (S1, S3) > 1F > 1E (P1) > 1C > the rest.
Report per item done / already done / not done with findings, the mask table, the leak table (which path leaked and why), timings, the exact signatures of `buildShare`, `redactResult`, `useOverlayRestore`, `useReadingStage` and the `parts`/`sections` types, files changed, test counts, `git diff --stat origin/main...HEAD`, and whether `api/`, `firebase.json`, `firestore.rules` changed (Grok must deploy them).
```
HANDOFF
from: Antigravity
part: 1
merged: <PR> as <merge SHA> on main
main now at: <SHA>
tests: <web count>, <api count>, build <ok/failed>
needs deploy: api <yes/no>, hosting config <yes/no>, firestore rules <yes/no>
interfaces for Cursor: buildShare / redactResult in <file>; useOverlayRestore in <file>; useReadingStage in <file>; parts/sections types in <file>
not done / caveats: <short list>
```

---

## PART 2 (start when Vigneshwaran sends "Cursor HANDOFF:" with Cursor's block): make every designed flow work
Branch `fix/design-v3-integration` from the latest `origin/feat/sarvam-design-v3`. PR **into `feat/sarvam-design-v3`** (never into `main`). Merge it into that branch when the merge condition holds.
1. Rebase check: Cursor's branch contains your Part 1 merge; if not, merge `origin/main` into your integration branch and resolve keeping both sides.
2. Remove every fixture fallback and `TODO(antigravity)` in `web/src/design/contracts.ts`; wire the real `buildShare`, `redactResult`, `useOverlayRestore`, `useReadingStage`, `parts`, `sections`.
3. Walk every flow on screens 01–26 and make it work end to end, with a test where practical: onboarding once; Home samples (all 11) open their cached results and look like the screens in §8 of Cursor's prompt; upload photo, PDF, multi-file and the 5-page PDF (live) → the right reading variant → the right result layout; language switch; Listen (all speeds, both modes); Ask; Share (five targets, Hide on/off); **Save as image** (Whole page and Summary only; Hide ON produces a PNG with no personal value; offline; iOS `navigator.share` with a file, desktop download; file name without personal values; large pages fall back to pixelRatio 1); Reminders and Medicine reminders (.ics content); Password PDF; Delete and Delete all; Accessibility settings persist; All documents search and filters; View all from 5 results; Offline and error states; PWA update.
4. Performance: `html-to-image` and heavy sheets lazy-loaded; fonts self-hosted, no request to fonts.googleapis.com; Indic fonts only when used; report bundle sizes vs `main`.
5. Security: no document content in storage keys beyond the existing saved-results design, logs or URLs; the PNG never contains the original photo; `sarvam.snapshotMode` is the only new key besides `sarvam.onboarded`, `sarvam.readingVariant`.
6. Visual fixes only when a flow cannot work without one; otherwise list visual gaps for Grok.
Report: flow × works / fixed / still broken (with cause). Same HANDOFF block with `part: 2`, `merged into: feat/sarvam-design-v3`.

## PART 3 (start when Vigneshwaran pastes Grok's "DEFECTS FOR ANTIGRAVITY" block): fix Grok's defects
Branch `fix/design-v3-defects` from the latest `origin/feat/sarvam-design-v3`; PR into that branch; merge when the condition holds.
- Fix exactly the listed defects. Order: Blocker (personal data leaked) → Critical FUNCTION → FUNCTION → VISUAL by screen.
- VISUAL: match the PNG and screen HTML exactly using `design/tokens.css` and `design/screen-styles.css`; never introduce a new colour, font, radius or border width.
- FUNCTION: fix the cause and add a regression test. Never weaken redaction, overlay restore, reading stages, medicine rules or privacy.
- `DATA` items (the design shows a value the sample file does not print): do not change code; report them.
- Not reproducible or contradicts the spec: change nothing; give evidence.
Report per defect ID: fixed / not fixed / not reproducible / disagrees with spec, cause, change, evidence. HANDOFF with `part: 3` and `next: Grok re-tests at <SHA>`.

## PART 4 (start only when Vigneshwaran writes "APPROVED: merge design v3"): merge to main
1. `git fetch`; confirm `feat/sarvam-design-v3` is rebased on or merged with the latest `main` and all tests and the build pass on it.
2. Mark Cursor's PR ready and merge it into `main` with a merge commit (this is the one time you merge a PR you did not open).
3. Confirm the merge commit is on `origin/main`; report the SHA. HANDOFF with `part: 4` and `next: Grok production deploy`.
