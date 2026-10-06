# Sarvam — Build Brief v2 (7-day MVP)

Team Sarvam · Google Cloud AI Builder Cup 2026 · Theme: Sustainability & Social Impact
Team locks **11 Oct** · MVP working by **13 Oct** · Submit by **16 Oct** (deadline 18 Oct)

---

## 0. Read me first (for the coding agent)

You are building this app step by step with a human. Rules:

1. Do **one step from section 9 at a time**. Show a short plan, then code. Stop when the step's "Done when" check passes and tell the human what to test.
2. Do not start the next step, refactor other steps, or add libraries the step does not mention without asking.
3. Never put keys, tokens or passwords in code or in git. There are none in this design; if you think one is needed, stop and ask.
4. Match the design in section 4, `design/sarvam-prototype-reference.html` and the screenshots in `design/screens/` exactly. The reference file is a blueprint (it needs a special runtime and will not open on its own).
5. Never invent facts in prompts, sample data or UI copy. Follow the trust rules in section 5.
6. Keep changes small so each step can be committed on its own.

---

## 1. Product

**One line:** an important notice or letter, turned into clear next steps in your language.

A person photographs or uploads an official notice or letter (pension notice, utility bill notice, insurance letter, school or bank letter). In seconds they get, in their language:

1. **What you need to do**: actions, with dates, each linked to the sentence in the document it came from
2. **In simple words**: a 2–4 sentence explanation they can **listen** to
3. **Watch out**: only warnings that the document itself states
4. **Key facts**: amounts, IDs, names of offices, each with its source passage
5. **Share**: a preview, with personal details hidden by default, to WhatsApp, email or copy

Flagship demo: the **pension notice photo** (life certificate due 30 Nov). Lab report and insurance letter are test cases, not the marketing story. Sarvam is **not** a medical, legal or financial adviser; it explains what the document says.

Honest impact framing for the deck: access to public information in Indian languages is a recognised national need (MeitY Bhashini). Sarvam's claim is accurate, sourced next steps; reach to "millions" is potential, shown later through user tests, not a current fact.

---

## 2. Scope

**v1 (this week)**
- Input: **one notice per request**, as a PDF or up to **3 photos/pages** (JPG/PNG). Max 15 MB per request.
- Output languages tested: **English, தமிழ், हिंदी**. The language row also offers ಕನ್ನಡ, മലയാളം, తెలుగు and more, marked **Beta** (Gemini writes them; we have not checked them).
- Result screen: actions (first), simple explanation, warnings from the document, key facts, evidence for every point.
- Listen (phone's built-in voice), share sheet with preview and "hide personal details" on by default, copy full text.
- 3 built-in **sample** results, clearly labelled "Sample", plus live upload.
- Deployed: web on Firebase Hosting, API on Cloud Run.

**Not in v1 (v1.1 after the MVP gate, only if time allows):** DOCX and HEIC files, several documents at once, contacts with call/map, reminders, accessibility settings sheet, saved history, other languages "verified", web up-to-date checks, Search grounding, medical interpretation beyond the document's own words, flashing alerts.

---

## 3. Architecture

```
Phone browser (React PWA, Firebase Hosting)
   │  POST /api/explain   (1 PDF or ≤3 images, lang)
   ▼
Cloud Run "sarvam-api" (Python FastAPI, asia-south1, dedicated service account)
   ├─ 1. Reader: Gemini (gemini-3.7-flash on Vertex AI / Agent Platform) → JSON
   ├─ 2. Evidence check in code:
   │       PDF with text layer → exact-match each quote; separately verify every
   │       date, amount and phone number character-for-character
   │       Photo → no text layer → mark evidence "check against original"
   └─ 3. Date logic in code: relative deadlines, "date has passed"
Nothing is written to disk or a database. No document content is logged.
```

**Why Cloud Run + Vertex AI (and not Firebase AI Logic on the free tier):**
- Already set up and tested on project `sarvam-510715` with Application Default Credentials. No API keys exist anywhere.
- Paid Vertex AI: Google does not use our inputs to train its models. The Gemini free tier says inputs may be used to improve Google's products.
- Cost: covered by the ₹28,797 Google Cloud trial credit (ends 4 Jan 2027). Cloud Run's free monthly allowance also applies. A ₹500 budget alert is set. **No personal payment.**
- The organisation policy on this project blocks API keys tied to service accounts, so a server with its own identity is the safer path.

**Protecting the public API:** CORS allows only our Firebase domain and localhost; per-IP limit of 10 requests/minute; max 15 MB; Cloud Run `--max-instances 3`.

**Repo layout** (inside the folder Antigravity uses):
```
sarvam/
  SARVAM_BUILD_BRIEF.md
  design/sarvam-prototype-reference.html
  design/screens/*.png
  samples/        (fictional test files, see section 10)
  api/            FastAPI app + Dockerfile
  web/            React + Vite + TypeScript + Tailwind PWA
  evals/          small honest evaluation (section 8)
  README.md
```

---

## 4. Design system and screens

Keep the prototype's look. Changes from the prototype are marked **NEW**.

**Fonts:** Bricolage Grotesque 700 (headings, logo) · Figtree 400–700 (UI) · Noto Sans Tamil, Devanagari, Kannada, Malayalam, Telugu as fallbacks.

**Colours (Tailwind tokens):**
| token | value | use |
|---|---|---|
| bg | #F6F6F3 | page |
| surface | #FFFFFF | cards, sheets |
| ink | #15171A | text |
| muted | #5E636B | secondary text |
| line | #E6E6E1 | borders |
| soft | #F0F0EB | quote boxes, chips |
| brand | #146B4E | primary buttons, accents |
| brand-soft | #E3F1EA | tags, icon tiles |
| voice | #5B4BC4 · voice-soft #EEEBFC · voice-panel #1E1838 · voice-highlight #E4DFFC | listen only |
| warn-bg | #FFF4DE · warn-ink #5A3500 | warnings |
| logo-dot | #D35A3A | **NEW** the coral dot after "Sarvam" (matches team logo) |

**Shape and spacing:** cards radius 22px, padding 20px, gap 12px; sheets radius 28px top; page padding 20px; buttons fully rounded; all touch targets ≥ 44px. Section labels: 12px, weight 700, uppercase, letter-spacing .08em, muted.

**Motion:** cards fade up (380 ms, 60 ms stagger); sheets slide up (320 ms); voice waveform. **NEW:** respect `prefers-reduced-motion` (no animation when set). **No flashing or pulsing anything.**

**Screens (v1):**
1. **Home**
   - Header: logo "Sarvam" + coral dot.
   - **NEW language row:** one horizontal scroll row: English, தமிழ், हिंदी first, then ಕನ್ನಡ, മലയാളം, తెలుగు, বাংলা, मराठी, ગુજરાતી, ਪੰਜਾਬੀ, ଓଡ଼ିଆ, اردو. Each chip fully readable, 44px tall. A soft fade on the right edge shows the row scrolls. The selected chip scrolls into view. Beta languages show a small "Beta" tag.
   - Greeting.
   - **NEW primary action:** "Take photo" — green, but a compact card (~88px tall), not half the screen.
   - **NEW secondary action:** "Choose file (PDF or photo)" — white outline button.
   - "Try a sample" list (3 items, each tagged "Sample").
   - Privacy line: "Processed securely on Google Cloud. Not stored by Sarvam."
2. **Upload / capture:** native picker (`accept="application/pdf,image/jpeg,image/png"`), camera via `capture="environment"`, up to 3 pages, page count shown.
3. **Reading:** 3 steps (Reading the notice → Checking against the document → Writing in Tamil).
4. **Result (NEW order):**
   1. Title + document type + evidence summary line (section 5)
   2. **What you need to do** — each action: text, date chip, evidence chip; tap to see the source passage. Past dates show **"Date has passed"**.
   3. **In simple words** — summary
   4. **Watch out** — steady amber card with icon and text; only warnings stated in the document
   5. **Key facts** — neutral wording, each with "From your document"
   6. Disclaimer line
   7. Bottom bar: **Listen** (violet outline) + **Share** (green)
5. **Voice panel:** dark violet panel, waveform, current sentence, progress, pause/resume, speed 1×/0.75×, stop. Highlights the sentence being read.
6. **Share sheet:** text preview; toggle **"Hide personal details" (on by default)** masks names, ID numbers and account numbers; WhatsApp, Email, Copy full text.

---

## 5. Trust rules (the core of the product)

**Evidence labels** — every action, warning and fact gets exactly one:
| label | when | look |
|---|---|---|
| **Matched to document** | PDF text layer: quote found exactly (after normalising spaces) AND every date/amount/phone in the item appears character-for-character in the source text | green check |
| **Check against original** | photo input, or quote not found exactly | grey eye icon; tapping shows the extracted passage + "Please compare with your paper" |
| **Calculated** | a date computed from a relative deadline | blue calendar icon + how it was calculated |

Never show a green check for anything not matched. The header line reads, for example: "5 of 7 points matched to your document · 2 to check against the original".

**Dates:**
- Today's date is passed to the model and used in code.
- Relative deadlines ("within 30 days of this letter") → model returns `deadline_rule` text + `letter_date` if printed. Code computes the date and labels it **Calculated: "about 31 Oct 2026 (30 days from the letter date, 1 Oct)"**. If no anchor date is printed, show the rule only, no date.
- Dates before today → "Date has passed" and the action text stays visible.
- Two different dates for the same thing → show both and a "This document gives two different dates — check with the office" warning (from code if both are found, or model flag `conflicts`).

**Wording:**
- Medical values: "outside the range printed on this report" / "inside the printed range". No diagnosis, no triage, no new instructions. Repeat a warning only if the document states it (e.g. "Return immediately if …"). Always: "Show this report to your doctor."
- Money/legal/government: explain amounts, dates and rights stated in the document only.
- Unreadable or cut-off pages: say so and ask for a retake; never guess.

---

## 6. API contract

`POST /api/explain` — multipart/form-data
- `files`: 1 PDF, or 1–3 images (JPG/PNG); total ≤ 15 MB
- `lang`: `en`, `ta`, `hi` (tested) or other ISO code (beta)

Response 200:
```json
{
  "doc_type": "government_notice | utility_bill | insurance | lab_report | bank | school | other",
  "title": "string",
  "language": "ta",
  "letter_date": "2026-10-01 | null",
  "summary": ["sentence", "sentence"],
  "actions": [{
    "text": "string",
    "due_date": "2026-11-30 | null",
    "deadline_rule": "within 30 days of this letter | null",
    "date_status": "upcoming | passed | calculated | none",
    "quote": "verbatim source text",
    "page": 1,
    "evidence": "matched | check_original | calculated"
  }],
  "warnings": [{"text": "string", "quote": "string", "page": 1, "evidence": "matched | check_original"}],
  "facts": [{"text": "string", "quote": "string", "page": 1, "evidence": "matched | check_original"}],
  "conflicts": ["string"],
  "evidence_summary": {"matched": 5, "check_original": 2, "calculated": 1},
  "unreadable": false,
  "unreadable_reason": null
}
```
Errors: 400 wrong type/too big/too many pages · 422 unreadable (ask to retake) · 429 too many requests · 503 Gemini busy (retry). Every error returns `{"message": "...", "message_local": "..."}`.

---

## 7. Gemini prompt (Reader)

Model `gemini-3.7-flash`, `temperature 0.2`, `response_mime_type application/json`, response schema = section 6 without the `evidence` and `date_status` fields (code adds those). `{LANG}` = full language name, `{TODAY}` = today's date.

```
You are Sarvam. You explain official notices and letters to people who may
have little schooling or reading confidence.

Rules:
1. Output only JSON matching the schema.
2. Write all user-facing text in {LANG}, in simple everyday words a
   12-year-old understands, in short sentences. Keep numbers, amounts, dates,
   ID numbers and phone numbers exactly as printed.
3. Every action, warning and fact must include "quote": text copied EXACTLY
   from the document in its original language, plus the page number.
4. Do not invent anything. If something is not in the document, leave it out.
5. If a page is blurry, cut off or unreadable, set "unreadable": true and say
   which part. Do not guess.
6. Dates: return due_date (YYYY-MM-DD) only if the document prints the date.
   If the deadline is relative (e.g. "within 30 days"), put the words in
   deadline_rule, set due_date null, and fill letter_date if printed.
   Today is {TODAY}.
7. If the document gives two different dates or amounts for the same thing,
   describe it in "conflicts".
8. Medical documents: describe values only as inside or outside the range
   printed on the report. Do not diagnose, do not suggest treatment, do not
   add warnings the document does not state. Add the action "Show this report
   to your doctor".
9. Warnings: only those stated in the document.
10. Put the most important action first.
```

The old "Checker" second Gemini call is **removed**: a second model call can repeat the first one's mistake. Evidence is checked in code (section 5).

---

## 8. Honest evaluation (replaces the "30-document scorecard")

- `evals/cases/`: the 6 files in section 10 + 6 more you make (retyped real-world-style notices with fictional details), **12 total**.
- `evals/expected/*.json`: for each, the key dates, amounts and actions a human expects.
- `evals/run.py` calls the live API in en/ta/hi and prints a table: dates correct, amounts correct, actions found, items wrongly marked "matched" (must be 0), unreadable handled.
- Report the measured numbers as they are, including failures. Say "tested with N people" only if you really do it (aim: 3 family members using the live link, timed).

---

## 9. Step-by-step plan

**How to use:** paste one step's prompt into Antigravity → test → when every "Done when" is true, commit:
```
git add -A
git commit -m "Step N: <name>"
git push
```
If an AI change breaks things: look at `git diff`, discard one file's uncommitted changes with `git restore <file>`, or undo a bad commit with `git revert <commit>`. Ask the agent again with the exact error. Do not use reset commands that throw away work.

| # | Step | Day | Status |
|---|------|-----|--------|
| 0 | Folder, GitHub, Firebase check | 6 Oct | ☐ |
| 1 | API: Reader returns JSON locally | 7 Oct | ☐ |
| 2 | API: evidence + date logic in code | 7 Oct | ☐ |
| 3 | API live on Cloud Run | 8 Oct | ☐ |
| 4 | Web: design tokens + Home | 8 Oct | ☐ |
| 5 | Web: capture/upload → Reading → Result | 9 Oct | ☐ |
| 6 | Web: Listen | 10 Oct | ☐ |
| 7 | Web: Share sheet | 10 Oct | ☐ |
| 8 | Samples + error states | 11 Oct | ☐ |
| 9 | Web live on Firebase | 11 Oct | ☐ |
| — | **MVP GATE** | 12–13 Oct | ☐ |
| 10 | Evaluation + 3 user tests | 13 Oct | ☐ |
| 11 | README, deck, video, submit | 14–16 Oct | ☐ |

---

### Step 0 — Folder, GitHub, Firebase check (you)

1. In Antigravity, open the workspace folder it created for this project (call it `sarvam`). To find it on your Mac: right-click the folder in Antigravity's file panel → "Reveal in Finder".
2. Put these inside it: `SARVAM_BUILD_BRIEF.md`, `design/sarvam-prototype-reference.html`, `design/screens/*.png` (screenshots of each prototype screen: home, upload, camera, reading, result, voice, share), `samples/` (6 files from section 10).
3. In Antigravity's terminal (inside that folder):
   ```
   git init -b main
   printf "node_modules/\n.venv/\n__pycache__/\ndist/\n.env\n.env.*\n.DS_Store\n.firebase/\n" > .gitignore
   git add -A
   git commit -m "Step 0: brief, design, samples"
   gh auth status            # if not logged in: gh auth login
   gh repo create sarvam --public --source . --remote origin --push
   gcloud config get-value project          # must print sarvam-510715
   ```
4. Firebase check (no setup yet): open the Firebase console → Add project → choose the existing **sarvam-510715**. Note the plan it shows. Because the project already has a billing account with trial credit, it will likely show **Blaze**; that is fine, usage comes out of the trial credit. Confirm the ₹500 budget alert exists (Google Cloud → Billing → Budgets & alerts).
5. Hack2skill: confirm **Abraham has accepted** (Team Management shows 2 members). An invitation sent is not enough.

Done when: ☐ repo on GitHub with the 3 folders ☐ project prints sarvam-510715 ☐ Firebase shows the project ☐ team shows 2 members

---

### Step 1 — API: Reader returns JSON locally

Prompt:
```
Read SARVAM_BUILD_BRIEF.md sections 0–7. Do Step 1 only.
Create api/ with FastAPI: GET /health and POST /api/explain (multipart: files,
lang). Accept 1 PDF or 1–3 JPG/PNG images, total ≤ 15 MB, else 400 with the
error format in section 6. Use the google-genai SDK with vertexai=True,
project from env PROJECT (default sarvam-510715), location "global", model from
env MODEL (default gemini-3.7-flash), Application Default Credentials. Use the
Reader prompt in section 7 with a Pydantic response schema matching section 6
(without the evidence and date_status fields). Map lang codes to language names.
Add api/requirements.txt, api/Dockerfile (python:3.12-slim, uvicorn on $PORT),
and api/try_sample.py (args: file(s), lang, optional --url) that prints pretty
JSON. Show your plan first.
```
Run:
```
cd api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
# second terminal:
cd api && source .venv/bin/activate
python try_sample.py ../samples/sample-pension-notice.jpg ta
```
Done when: ☐ pension photo returns Tamil JSON with the action to give the life certificate and due_date 2026-11-30, each item with a quote

---

### Step 2 — API: evidence and date logic in code

Prompt:
```
Do Step 2. Implement section 5 in code (api/evidence.py, api/dates.py) with unit
tests (pytest):
- For PDFs, extract text per page with pypdf. For each action/warning/fact:
  evidence = "matched" only if the quote is found exactly after collapsing
  whitespace AND every date, amount (Rs./₹ numbers) and phone number inside the
  quote and text appears character-for-character in that page's text.
  Otherwise "check_original". Images are always "check_original".
- Dates: if due_date < today → date_status "passed". If deadline_rule is
  "within N days" and letter_date exists → compute the date, evidence
  "calculated", date_status "calculated". Otherwise no date.
- Detect two different dates or amounts given for the same purpose in the PDF
  text and add to conflicts (keep the model's conflicts too).
- Fill evidence_summary. Add a per-IP rate limit of 10/minute and CORS
  (localhost:5173 plus env ALLOWED_ORIGINS). Log only file count, types and
  seconds — never document content.
```
Done when:
☐ `pytest` passes
☐ insurance letter: review action shows a **calculated** date of 31 Oct 2026 with the rule text
☐ lab report: values marked matched, numbers identical to the PDF, no diagnosis words
☐ contradictory notice: conflicts mention 15 Oct and 25 Oct
☐ blurred photo: 422 or unreadable true
☐ no item from a photo is "matched"

---

### Step 3 — API live on Cloud Run (you, in the terminal)

```
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com
gcloud iam service-accounts create sarvam-api --display-name "Sarvam API"
gcloud projects add-iam-policy-binding sarvam-510715 \
  --member="serviceAccount:sarvam-api@sarvam-510715.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
gcloud run deploy sarvam-api --source api --region asia-south1 \
  --service-account sarvam-api@sarvam-510715.iam.gserviceaccount.com \
  --allow-unauthenticated --memory 1Gi --timeout 120 --max-instances 3 \
  --set-env-vars PROJECT=sarvam-510715,MODEL=gemini-3.7-flash
python api/try_sample.py samples/sample-pension-notice.jpg ta --url <SERVICE_URL>
```
If `--allow-unauthenticated` is refused by an organisation policy, paste the error to Claude.

Done when: ☐ `<SERVICE_URL>/health` is ok ☐ live call returns the Tamil result ☐ URL noted in README

---

### Step 4 — Web: design tokens and Home

Prompt (attach design/screens/home.png):
```
Do Step 4. Create web/ with Vite + React + TypeScript + Tailwind +
vite-plugin-pwa. Put every token from section 4 into the Tailwind theme. Load
the fonts from Google Fonts. Build the Home screen per section 4 (including the
NEW items: compact green "Take photo", outline "Choose file", horizontally
scrolling language row with right-edge fade and Beta tags, coral logo dot,
reduced-motion support). Use design/sarvam-prototype-reference.html for exact
spacing and copy. UI strings in web/src/i18n/{en,ta,hi}.json; other languages
fall back to English UI. Phone width first; on desktop centre at max 430px.
Buttons may only console.log for now.
```
Done when: ☐ side by side with the prototype screenshot it matches ☐ language row scrolls, nothing cut off at 360px ☐ switching ta/hi changes UI text

---

### Step 5 — Capture/upload → Reading → Result

Prompt (attach reading.png, result.png):
```
Do Step 5. "Take photo": <input type=file accept="image/*" capture="environment">,
up to 3 pages with a page counter and Done. "Choose file": accept
application/pdf,image/jpeg,image/png. Shrink images to max 1600 px JPEG in the
browser. POST to VITE_API_URL/api/explain with lang. Show the Reading screen
while waiting. Build the Result screen in the NEW order from section 4:
What you need to do (date chips, "Date has passed", evidence chips per section
5, tap to show the source passage), In simple words, Watch out (steady, no
animation), Key facts, disclaimer, bottom bar Listen + Share (no action yet).
Header shows the evidence summary line. Changing language on the result screen
asks the API again.
```
Done when: ☐ live upload of the insurance PDF on your phone shows the calculated date ☐ pension photo shows "Check against original" chips ☐ Tamil and Hindi render correctly

---

### Step 6 — Listen

Prompt (attach voice.png):
```
Do Step 6. Listen uses window.speechSynthesis with ta-IN / hi-IN / en-IN.
Reads: actions first, then summary, then warnings. Show the voice panel from
section 4 with sentence highlight, progress, pause/resume, speed 1×/0.75×,
stop. If the phone has no voice for that language, show a short message and
keep the text on screen.
```
Done when: ☐ Tamil and Hindi read aloud on your phone ☐ pause/stop work

---

### Step 7 — Share sheet

Prompt (attach share.png):
```
Do Step 7. Share sheet with text preview and "Hide personal details" (on by
default: mask names, ID numbers, account and phone numbers as ••••). Buttons:
WhatsApp (https://wa.me/?text=), Email (mailto), Copy full text (actions with
dates and evidence labels, summary, warnings, facts with quotes), and
navigator.share when available. Toast after each.
```
Done when: ☐ WhatsApp opens with Tamil text and masked details ☐ copied text pasted into any AI chat reads correctly

---

### Step 8 — Samples and error states

Prompt:
```
Do Step 8. Add the pension notice, insurance letter and lab report as samples
with saved API results (en, ta, hi) in web/public/samples. Show a "Sample" tag
on these results. Live upload always calls the API. Add designed states for:
no internet, API busy (retry), unreadable photo (retake tips), file too big,
wrong file type (including .docx: "save as PDF and try again").
```
Done when: ☐ samples open instantly with a Sample tag ☐ each error state shows a clear message in the chosen language

---

### Step 9 — Web live on Firebase

```
cd web
npm run build
npx firebase-tools login
npx firebase-tools init hosting      # existing project sarvam-510715, public dir: dist, single-page app: yes
npx firebase-tools deploy --only hosting
```
Then allow the Firebase URL in the API:
```
gcloud run services update sarvam-api --region asia-south1 \
  --update-env-vars ALLOWED_ORIGINS=https://sarvam-510715.web.app
```
Done when: ☐ live link works on your phone and a friend's phone ☐ "Add to Home screen" installs it

---

## MVP GATE (12–13 Oct) — stop and check before anything new

☐ Live link: photo of the pension notice → correct actions in Tamil, 3 times in a row on a real phone
☐ All 6 test files behave as in section 10
☐ Nothing from a photo shows a green "matched" check
☐ Tamil and Hindi read aloud; WhatsApp share works with details hidden
☐ Code pushed; README has both live URLs
☐ Record a rough 3-minute backup demo video now

Then send Claude screenshots + the live link for review. Only after that, pick v1.1 extras from section 2 if days remain.

---

### Step 10 — Evaluation and user tests
Prompt: `Do Step 10: build evals/ per section 8 and print the results table.`
Then ask 3 people (e.g. parents, a neighbour) to use the live link on a sample notice; note time taken and what confused them.
Done when: ☐ results table saved in README (real numbers) ☐ notes from 3 users

### Step 11 — README, deck, video, submit (14–16 Oct)
☐ README: problem, live link, screenshots, architecture, how Google AI is used, how to run, evaluation results, limits
☐ Deck on the Hack2skill template ☐ 3–4 min video: a live upload (not only samples), Tamil voice, share
☐ Brief description, honest: "Gemini 3.7 Flash on Google Cloud reads each notice; evidence and date checks run in our code; built partly in Google Antigravity with other assistants for review"
☐ Submit ☐ only bug fixes until 6 Nov

---

## 10. Test files (all fictional, marked SAMPLE / TEST)

| file | v1 expected behaviour |
|---|---|
| sample-pension-notice.jpg | Actions: give life certificate by **30 Nov 2026** (upcoming), carry Aadhaar + pension book, collect receipt. All items **Check against original** (photo). |
| sample-insurance-letter.pdf | Approved Rs. 31,200; deduction Rs. 17,300 (matched). Review deadline = **Calculated: about 31 Oct 2026, 30 days from the letter date 1 Oct**. |
| sample-lab-report.pdf | Hb 9.2 g/dL and ferritin 8.0 ng/mL "outside the range printed on this report", numbers unchanged in Tamil/Hindi; no diagnosis; action "Show this report to your doctor". |
| test-contradictory-notice.pdf | Amount Rs. 2,340; **conflict**: pay by 15 Oct vs last date 25 Oct → warning "two different dates — check with the office". |
| test-blurred-notice.jpg | **Unreadable** → retake message, no guessed facts. |
| sample-discharge-summary.docx | v1: "Word files are not supported yet — save as PDF and try again." (v1.1: follow-up on 26 Sep 2026 shows **Date has passed**; "Return immediately if…" repeated as a warning with its source.) |

---

## 11. Privacy notes (for README and deck)

- Documents are sent to Google Cloud (Vertex AI) for processing, then discarded; Sarvam stores nothing and logs no content.
- Paid Vertex AI does not use customer data to train Google's models.
- Public demo uses fictional samples only.
- Share hides personal details by default.
