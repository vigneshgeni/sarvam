# SARVAM: CURSOR, FINAL DESIGN ROUND (build design v3 exactly: every screen, every document type, every motion)

You are Cursor, working on the Sarvam repo (github.com/vigneshgeni/sarvam). Sarvam is a phone-first PWA that explains official documents in plain language in nine Indian languages (Vite + React + TypeScript + Tailwind in `web/`, FastAPI in `api/`, Gemini on Vertex AI, Cloud Run, Firebase Hosting). Vigneshwaran has approved a complete new design. **Your job is the UI: make the web app look, move and feel exactly like the design on every screen and for every document a person uploads.** The target is 100% match: fonts, colours, borders, radii, spacing, icons, illustrations, copy, motion, transitions.

**Who does what.** You own every visual file. **Antigravity** owns logic, API, security and performance and works **at the same time** on its own branch (`fix/final-logic`): Share redaction and payloads, the image redaction, overlay restore, the reading-stage hook, the multi-document API (`parts`), the new samples and their cached results. You call its functions; you never re-implement them. **Grok** deploys your branch to a preview channel and tests it against the design and the sample files.

---

## 0. The design (source of truth)
The package lives in the repo at **`design/sarvam-v3/`**. All paths below are relative to that folder.

| Path | What it is |
|---|---|
| `design/index.html` | Gallery of all 26 screens with looping motion. **Open it first.** |
| `design/screens/NN-*.html` | Every screen as a standalone, **playable** page (real fonts, real animations, links between screens with the app's transitions). Open in Chrome DevTools device mode at 390 × 844. |
| `design/png/NN-*.png` | 2x renders with the real fonts. Pixel target for side-by-side checks. |
| `design/motion/NN-*.mp4` | Screen recordings of every animated screen. `00-prototype-tour-transitions.mp4` shows the transitions between screens and sheets. |
| `design/sarvam-design-v3.pdf` | All 26 screens, labelled, in flow order. |
| `design/tokens.css` | Colours, radii, fonts, motion tokens, shared keyframes. Copy in unchanged. |
| `design/screen-styles.css` | **Every screen's own CSS verbatim**: each keyframe, duration, easing and delay. Port every number exactly. |
| `design/source/NN-*.dc.html` | Raw design source. `{{…}}` holes and `<sc-for>` loops are filled by `renderVals()` at the bottom; read it for the exact inline style of any element and every icon path. |
| `design/screens/26-content-mapping-rules.html` | **How every screen adapts to the document** (§7 below). Read before building the result screen. |
| `samples/` + `samples/SAMPLE_EXPECTED_FACTS_V3.md` | The sample documents. Each one must produce one of the result screens exactly (§8). |

**When this prompt and the design HTML disagree, the HTML wins.** Match it at 390 px, then hold it at 360 and 430 px. Text on result screens comes from the API; the design shows what the sample files produce. **Never hard-code sample text** (names, amounts, dates, medicines) in the app.

### Screen list (file numbers)
01 Onboarding: welcome · 02 Onboarding: simple words · 03 Onboarding: listen & ask · 04 Home · 05 All documents · 06 Reading A scan · 07 Reading B photo pages · 08 Reading C your language · 09 Reading D key facts · 10 Result: insurance (A) · 11 Result: lab report (D) · 12 Result: pension notice in Tamil (C) · 13 Result: prescription (medicines) · 14 Result: challan (B), legal notice (C), investment (F), form (E + steps) · 15 Result: one upload, several documents · 16 Listen · 17 Ask · 18 Share or save · 19 Save as image · 20 Reminders · 21 Medicine reminders · 22 Password PDF · 23 Delete · 24 Accessibility · 25 Offline / error · 26 Content mapping rules.

If Vigneshwaran removed a screen file from the package, that screen is out of scope; keep the app's current version of it, restyled with the tokens only.

---

## 1. Rules
1. Branch `feat/sarvam-design-v3` from the latest `origin/main`. Open a PR. **Do NOT merge.** Grok deploys it to a preview channel, Antigravity fixes Grok's defects on a branch into yours, Vigneshwaran approves on his iPhone, then it is merged.
2. **Work in parallel with Antigravity.** Do not wait for its PR. Program against the interfaces in §4 exactly as typed. If one does not exist on `main` yet, add a typed adapter in `web/src/design/contracts.ts` that imports the real function when present and otherwise returns fixture data built from `samples/SAMPLE_EXPECTED_FACTS_V3.md`, with a `// TODO(antigravity)` marker. When Antigravity's PR lands on `main`, `git fetch`, rebase, keep both sides on conflicts, delete the fixture fallbacks, re-run everything.
3. Touch `web/` and `design/` only. Do not edit `api/`, `firebase.json`, `firestore.rules`, the service worker config, `web/src/utils/share.ts` or the redaction module, the overlay-restore helper, the API client or `ics.ts` rules. Restyle the components that call them.
4. New npm packages allowed: `@fontsource-variable/fraunces`, `@fontsource-variable/dm-sans` (latin + latin-ext weight-axis files only, `font-display: swap`) and `html-to-image` (for Save as image, lazy-loaded). Nothing else. Keep Indic font loading as it is; never load an Indic font for a language not in use.
5. Every existing flow keeps working: upload, camera, multi-file, password PDFs, translate/explain fallback, Listen (server audio, device fallback, iOS unlock), Ask (text + voice), Share (redaction on every path), Recent (IndexedDB), Delete, Next up, reminders/.ics, medicine reminders, the "Was this right?" rating to Firestore, accessibility settings, PWA install and update, offline Recent.
6. All new or changed strings go into all nine languages (en, ta, hi, te, ml, mr, bn, or, kn) with key parity. Onboarding greeting words are never translated.
7. Every animation shows its end state under `prefers-reduced-motion` **and** the in-app reduce-motion setting.
8. New storage keys allowed: `sarvam.onboarded` ("1"), `sarvam.readingVariant` ("A"–"D"), `sarvam.snapshotMode` ("page" | "summary"). Nothing else new. No document content in storage, logs or URLs.
9. Tap targets ≥ 44 px. Text contrast AA. Indic body line-height ≥ 1.6. Real `<button>` / `<a>` / `<input>` elements, `aria-label` on icon-only buttons, visible focus.
10. Follow §10 order with a checklist. If something is too big, say so and continue.

---

## 2. Design system (exact)

### 2.1 Colour (copy `tokens.css`; extend Tailwind with the same names)
- **Background `#F4F5F2`** (cool off-white). **Not** the old warm cream `#F7F5EE`: replace it everywhere, including `theme-color`, the manifest `background_color`, the splash and the body.
- **Ink `#1A1A1A`**: text, every outline, ink panels. Text on ink/teal: `#F4F5F2`; secondary on ink `#E4E7E3`; hero subtitle on ink `#D3D7D2`; dividers on ink `#383B39`.
- Neutrals: muted text `#575B58`, paragraph `#3B3E3C`, hairline and neutral chips `#E2E5E0`, placeholder lines `#C4C8C3`, sheet scrim `#8A8F8C`.
- **Coral `#D9603B`** (tint `#F8D9CB`, badge halo `#FADCD1`): wordmark dot, accessibility badge, the full stop after every section heading, Watch out, High flag, scan band, "cut" amounts, key-fact numbers, mic, Look at these first.
- **Forest teal `#034F46`** (tint `#CFE5E0`, mid `#2E6E64`): Take photo, approved values, Private by design, toggles on, success ticks, In range flag tint, medicine panel tint.
- **Mustard `#E9B44C`** with ink text: every primary action and active state, In simple words panel. Soft `#FBEBC4` (bill page). Wash `rgba(233,180,76,.22)` for dashed field chips, masked share chips and "Pick a day and time".
- **Lavender `#F0D7FF`: only** the Ask answer bubble and the onboarding-2 summary card.
- `#B3361A` only for "Delete all" and "How many days? The prescription doesn't say."; `#25D366` only for the WhatsApp button.
- No gradients, no shadows (except the badge's 2 px ink ring), no grey hairlines on interactive elements.

### 2.2 Shape
- **Border 1.5 px solid ink** on every card, button, chip, input, tile and sheet top.
- Radii: cards **32**; tiles, rows, section accordions **28**; ink/teal/mustard panels and sheet tops **40**; cards inside panels **24**; value tiles **22**; Recent icon tiles **16**; pills full.
- Spacing: screen padding 16 (Home 20, top 24); gap between cards 16 (Home 20); card padding 20 (18 on dense cards); row padding 12–14.

### 2.3 Type
- **Fraunces weight 400 only** (never bold) for headings and big numbers: onboarding 42, Home hero 44, result headline 30–34 (line-height 1.05–1.08, letter-spacing −0.4), section headings 25–30 with the coral full stop (`<span class="sv-dot">.</span>`, skipped if the heading ends in "." or "?"), part titles 26, numbers 19–48 with `font-variant-numeric: tabular-nums`.
- **DM Sans** for everything else: body 15.5–16.5 / 1.45–1.5, labels 12–13.5 / 600–700, buttons 14–17 / 700, caps labels 11.5–12 / 700 with letter-spacing 1.2.
- Monospace (`Courier New`) only for `frequency_raw` pills, form field chips and masked values.
- **Indic scripts**: Fraunces has no Indic glyphs. When the content language is not English, headings use the script's Noto Sans at 600 (about 20–25 % smaller than the Latin size, as on screen 12) and body uses the script's Noto Sans 400–500 with line-height 1.65–1.7.

### 2.4 Icons and illustrations
- Icons: inline stroke SVG, 24 viewBox, stroke 2–2.6, round caps and joins, in `web/src/ui/icons.tsx`. Copy every path from `design/source/` (document-type icons are listed in `26-…dc.html` and `05-…dc.html`). No emoji, no icon packages.
- Illustrations are built from shapes, not images: copy them as JSX/SVG exactly: the onboarding greeting stack (01), the document → summary card (02), the speaker with rings and calendar card (03), the four reading scenes (06–09), the health-checkup stacked pages tile (04), the page map with coloured brackets (15), the Save as image preview card (19), the drifting crossed-out cloud (25), the lock tile (22).
- The accessibility badge (04 header): 56 px coral circle, 4 px `#FADCD1` halo border, 2 px ink ring, white classic figure.

### 2.5 Motion (exact; see `design/screen-styles.css`, `design/motion/*.mp4`)
**App transitions** (shown in `00-prototype-tour-transitions.mp4`):
- Push to a new screen: incoming slides 28 px from the right + fades in, **280 ms `cubic-bezier(.2,.8,.2,1)`**; outgoing fades 160 ms. Back: mirror (from the left).
- Bottom sheets: scrim fades in 200 ms; sheet rises from 100 % in **260 ms** `cubic-bezier(.2,.8,.2,1)`; closes down in 200 ms `cubic-bezier(.4,0,1,1)`; swipe down to close; reduced motion = fade only.
- Result cards on first open: fade up 8 px, 320 ms, first delay 120 ms, then +40 ms per card (max 10 cards).
- Press: scale .97 over 120 ms on every tappable element.
- Accordion chevron rotates 180° in 240 ms; the content height animates with the same easing.
- Language switch on a result: content crossfades 200 ms; numbers never animate.

**Per screen** (all timings verbatim from `screen-styles.css`):
| Screen | Motion |
|---|---|
| 01 | 9 greeting pills float 6 px, 4 s ease-in-out infinite, delay i × 0.35 s |
| 02 | cards rise 10 px, 0.7 s ease-out; the coral badge 0.4 s later |
| 03 | two sound rings scale .7 → 1.5 and fade, 2.4 s, second ring delayed 1.2 s |
| 06 A | coral scan band 6 % → 88 % → 6 %, 2.6 s; text lines glow `#E2E5E0` ↔ `#CFE5E0` 2.6 s with delays 0/.3/.6/.9/1.2/1.5 s; amount chip bobs 8 px at −6°, 3 s; current step ring spins 1 s linear |
| 07 B | three pages fly in from 70 px below with rotation, 4.5 s cycle, delays 0 / .5 / 1 s; cream shutter flash at 4 %; teal sweep line 4 % → 86 %, 2.2 s; "Page n of N" counter |
| 08 C | dashed orbit with three dots rotates every 14 s; the nine script glyphs cycle 0.6 s apart (5.4 s loop: scale .6 → 1, fade); the simple-words lines type in 2.4 s with delays 0/.3/.6/.9 s |
| 09 D | coral lens glides a 5-point path in 4.4 s `cubic-bezier(.45,0,.25,1)`; lines highlight as it passes; chips "₹ Amount", "Due date", "To-do" pop (scale .4 → 1.08 → 1) at delays .7/1.4/2.7 s; three dots twinkle 2.2 s; reduced motion: chips visible, nothing moves |
| 10 | split bar grows from 0 in 700 ms |
| 15 | page thumbs rise in .5 s, +70 ms each; the three document brackets grow left → right .6 s after .45 s |
| 16 | 34 waveform bars breathe scaleY 1 → .55, 1.1 s, delay (i mod 7) × 0.12 s; drive from the audio analyser when playing |
| 19 | the preview card's shutter flash every 3.6 s (opacity .9 at 74 %) |
| 22 | lock tile wiggles −8°, 2.6 s; wrong password: field shakes ±6 px, 0.4 s once |
| 25 | crossed-out cloud drifts 8 px, 3.2 s; the offline dot blinks 1.6 s |
| Steps | done = teal tick draws in 250 ms; current = coral ring spinning 1 s; pending = dashed circle |

---

## 3. Shared components (build first, in `web/src/ui/`)
Buttons (primary mustard; ink; outline; round icon 44–56 px), chips and pills (type chip with a 22 px icon dot, date chip, flag pill, "From: …" tag), outline card, coloured panel, icon tile (round 38–46 px; square 46 px radius 16), toggle (`role="switch"`, 54 × 32, teal on with mustard 24 px knob), segmented control (selected mustard), **Sheet** (surface `#F4F5F2`, top radius 40, ink top border, 44 × 5 handle at 25 % ink, round 44 px outline close top right, Fraunces 34 title with coral full stop, scrim `#8A8F8C`, motion §2.5, focus trap, Escape, focus return), evidence tick (teal circle with cream tick, `aria-label="Found in your document"`), date tile (month band + Fraunces day), value tile, accordion section (`<details>`-like, keyboard operable), numbered step, stat strip (3 cells), split bar, page map.

## 4. Interfaces you consume (Antigravity provides them; do not re-implement)
```ts
// share module
buildShare(result, { hidePersonal: boolean }): { text: string; title: string; segments: { text: string; masked: boolean }[] }
// text === segments.map(s => s.text).join('')
redactResult(result, { hidePersonal: boolean }): ExplainResult   // same masks, for Save as image
// overlays
useOverlayRestore()                                              // call from every sheet
// reading
useReadingStage(): { stage: 'reading'|'checking'|'writing'; progress: number; sourceKind: 'pdf'|'photo'; fileCount: number; pageCount: number; targetLanguage: string }
// API result (additive; single documents unchanged)
result.parts?: Part[]          // present only when one upload holds 2+ documents
type Part = { part_id: string; title: string; document_type: string; issuer?: string; date_iso?: string;
  pages: [number, number]; glance?: Glance; sections?: Section[]; medicines?: Medicine[]; key_points?: KeyPoint[] }
type Section = { heading: string; page: number; values: { label: string; value: string; unit?: string; ref_range?: string; flag_printed?: 'High'|'Low'|null; evidence: string }[] }
result.actions[i].part_id?: string;  result.facts[i].part_id?, page?
result.sections?: Section[]    // also for a single lab report with more than 4 values
```
The masks are fixed (screen 26 §6): names `R*** K****`, phones `**********`, IDs keep separators and the last 3 characters, emails `r***@****.com`, addresses and dates of birth `[hidden]`. You only style them.

## 5. Screens

### 5.1 Onboarding (01–03)
Shown once on first open (no `sarvam.onboarded`). Skip and Get started set the key and go Home. Back on 2 and 3, swipe left/right, page change slides 280 ms, progress dots animate 8 → 26 px. Never blocks opening a saved result or a shared link. Panels: 1 forest teal with the floating greeting stack (nine pills, exact order, colours and offsets in the source); 2 ink with document → lavender summary card + coral "Checked with your document" badge; 3 mustard with a teal speaker, two rings, a NOV/30 calendar card and an ink voice bubble.

### 5.2 Home (04)
Wordmark "Sarvam" + coral dot (32/700, −1 letter-spacing) and the accessibility badge → language chips (horizontal scroll to the edge, selected mustard, each label in its own script and Noto font) → ink hero panel (radius 40) with the coral tag "9 INDIAN LANGUAGES · TEXT + VOICE", Fraunces 44 question and subtitle → Next up card (coral tint; hidden if none) → Take photo (teal panel, mustard camera tile) and Choose files (outline) → AI note → "Try a sample." with **10 sample tiles in a 2-column grid** (order and icons in §8) **plus the full-width Health checkup tile** (three stacked pages in mustard, coral tint and teal, rotated −8°/−2°/5°; "PDF · 5 PAGES" pill; "Health checkup"; "Lab report, prescription and bill in one file, split for you") → "Recent on this phone." with **the newest 4 only**, then from 5 saved results a full-width outline "View all documents" button with an ink count pill and arrow → Save results toggle → Private by design (teal panel, decorative dashed circles, coral lock, two coral ticks) → site link pill. Recent rows: 46 px icon tile (radius 16, colour per type), full title (max 2 lines), "{type} · {date}", round remove ×.

### 5.3 All documents (05)
Back, "Delete all" (opens Delete for all), Fraunces 42 title + "{n} saved", search (title + type, client side, nothing stored), type filter chips with counts (All, Health, Money, Bills, Notices, Legal, Forms; hidden at 0), groups "This week" / "Earlier in {month}" / month names. Same rows as Home. Empty search: "No documents match".

### 5.4 Reading (06–09)
Same layout for all four: back, "Processing securely" pill, 300 px illustration panel (radius 40, ink border), file name in Fraunces 32 (or "{n} photos"), subtitle, steps card with real progress from `useReadingStage`, Cancel. **Pick the variant**: photos or more than one file → B; target language not English → C; otherwise A and D alternate. If the pick equals `sarvam.readingVariant`, take the next letter (A → B → C → D → A). Save the letter shown. Keep the 90 s timer, the reassurance text after about 20 s and Cancel exactly. Third step label: "Writing in {language}". B's page counter uses the real page count.

### 5.5 Result (10–15): one screen, assembled from the data, for ANY document
Bills, challans, forms, legal notices, government papers, insurance, lab reports, prescriptions, bank papers, investments, and uploads that hold several documents. Nothing is special-cased by sample. Each block is its own component, shown only when its data exists, in this order:
1. **Top bar**: round back, language pill (mustard when a non-English language is active), round menu (two-line icon). Translucent `#F4F5F2` with blur once scrolled.
2. **Summary card**: type chip (colour and icon §7.4), date chip, View document chip (or "Photo · N pages"), headline (Fraunces 30–34; Indic: Noto 600), then the **glance block** (first match wins):
   - **A Split amounts** (10): three amounts, the largest equals the sum of the other two, and the type is insurance, utility_bill, telecom_bill, tax_receipt or receipt → 48 px split bar (teal "{n}% {label}", coral with a 135° ink stripe; grows 700 ms) + 3-cell stat strip (Fraunces 20, tabular, no overflow at 360 px).
   - **B Amount to pay** (14 challan): exactly one amount → coral-tint card "TO PAY", Fraunces 44 amount, "by {date} · {n} days left", joined to an ink date tile when a due date exists.
   - **C Deadline** (12, 14 legal): no amounts and an upcoming date → ink date tile (month, Fraunces 48–52 day, time or year) joined to a coral-tint panel (label, "{n} days left", thin progress bar). Past: "Date has passed" ink chip, no Remind me.
   - **D Values** (11): up to 4 text values with units → 2-column tiles (label, Fraunces 28 value + unit, printed range, flag pill). Flag pill: **High** coral and **Low** coral tint only when the document prints that flag; **In range** teal tint when the row has a printed range and no printed flag. Sarvam never decides High/Low itself. A date value is a teal-tint tile.
   - **D+ Sectioned values** (15, lab part): more than 4 values → "Look at these first." coral-tint card (every value with a printed High/Low, max 6, each row: label, "{section} · page n", Fraunces 22 value, flag; tap scrolls to its section; hidden when none), then one accordion per section using the report's own heading: round icon tile, heading 16/700, "{n} values · page {p}", status pill ("{k} outside" coral / "All in range" or "In range" teal tint), chevron. Sections with flags first and open, in report order; all-in-range sections collapsed. Inside: the D tiles.
   - **F Amount strip** (14 investment, 15 bill): 2–3 amounts that are not A or B → 3-cell strip (the last cell mustard), optional comparison bars of the printed amounts only (striped outline for the smaller, teal for the larger). **Never draw a trend line or any unprinted value.**
   - **E Headline only** (14 form): no glance values.
   - Under the glance: "All … found in your document" with the teal tick when every value is matched; otherwise the evidence chip per value.
3. **Medicine reminders.** (13; §5.6) for medical documents with `medicines`.
4. **In simple words.** mustard panel, ink circle with sparkle, Fraunces 28 title, 16.5 px paragraphs, amounts and dates in bold.
5. **What you need to do.** outline card. Checklist by default: checkbox 26 px (teal accent), text, coral-tint date chip ("By {date}" or "{date} · {time}"), mustard "Remind me" when upcoming, "Calculated" chip when calculated, "Add all dates" for 2+ dates; header pill "{n} of {m} done" wraps under the title when it doesn't fit. **Numbered steps** (14 form) when no action has a date and there are 3+ actions: 30 px mustard number circles, the field name from the quote in a dashed mustard-wash monospace chip, the instruction below; tapping marks done (teal ✓ circle, struck through, 55 % opacity); header "{n} of {m}"; then the outline hint "Stuck on a box? Tap **Ask** and say which one." For multi-document results each action carries a small "From: {part title}" tag (teal tint for a lab report, coral tint for a prescription, mustard soft for a bill).
6. **Watch out** coral panel(s); for medical documents "Not a diagnosis" first.
7. **Places & contacts.** one outline card; rows with a 44 px round tile (address coral tint, place teal, phone mustard, email teal tint), label, value, one action (Map / Directions / Call mustard / Email).
8. **Key facts.** ink panel radius 40, coral number circles, teal-tint ticks, first 5 then "Show all {N} facts". In multi-document results each fact shows "{part} · page n" under it in `#B3B8B3`.
9. Disclaimer line (investment: "It does not give investment advice"; medical: "It does not replace your doctor"), then "Was this explanation right?" with mustard Yes and outline No.
10. **Bottom bar**: Listen (ink pill, coral play circle), Ask (mustard, speech-bubble icon), Share (round 56 px outline). Long labels (Tamil etc.): 14 px coral triangle instead of the circle, nowrap, 13.5 px minimum, Share 52 px.

**Multi-document layout (15)** when `parts.length > 1`: the summary card gets the chips "{n} documents" (ink dot with stacked-pages icon, neutral `#E2E5E0` chip), "PDF · {pages} pages", View document; headline from the API; then **IN THIS UPLOAD**: one 78 px page thumbnail per page tinted by its part (teal tint, coral tint, mustard soft; lines in the part colour), and under them a coloured bracket per part (teal / coral / mustard bars spanning the part's pages) with the part label; "Split using the headings on your pages" tick. Then a **document tab bar** (outline pill, the active tab mustard with an ink number dot; sticky under the top bar; scroll-spy updates it; tapping scrolls to the part). Then "Look at these first" (if any), then each part in page order under a header (40 px square icon tile in the type colour, "DOCUMENT n OF m · PAGES a–b" caps, Fraunces 26 title with coral full stop, "{issuer} · {date}") followed by that part's own blocks (lab → sections + In simple words + Not a diagnosis; prescription → the medicine panel titled "{n} medicines." with a "Review {date}" pill; bill/statement → F strip with "Paid by …" tick). Then one merged What you need to do, Key facts, rating and bottom bar. More than 5 parts: tabs scroll horizontally.

### 5.6 Prescription (13), Medicine reminders (21), Reminders (20)
**Result (13)**: type chip "Prescription" (pill icon, teal tint), date chip, "Photo · N pages"; headline "{n} medicines prescribed, for {min} to {max} days." (from `medicines`, falling back to the API headline). Directly under it the **Medicine reminders.** panel (teal tint, radius 32): 40 px teal circle with pill icon, Fraunces 26 title; dashed ink note on `#F4F5F2` with a coral warning icon "Check these against your prescription before adding. Sarvam does not give medical advice."; one card per medicine (radius 24): name 17/700, `strength_text` exactly as returned in 500 weight, `frequency_raw` exactly as written in a monospace pill; slot chips (30 px): Morning mustard "Morning 8:00", Afternoon coral tint "Afternoon 2:00", Evening coral tint "Evening 6:00", Night ink "Night 9:00", Bedtime ink "Bedtime 10:00"; "{food timing} · {n} days" (After food / Before food / At bedtime / Any time). Non-daily patterns ("Once a week", "SOS"): no slot, dashed mustard-wash chip "Pick a day and time" (weekly) or outline "Only when needed" (SOS). Full-width mustard "Set medicine reminders" → screen 21.
**Medicine reminders sheet (21)**: title "Medicine reminders." on one line; coral-tint dashed note "Check every time against your prescription. Tap a time to change it."; per medicine an outline card with a 3-column grid of slot tiles (radius 16: checkbox, caps slot name 11.5, Fraunces 20 time; tap the time → native time picker). **Ticked by default only when the medicine is matched and decoded**; otherwise unticked with "Not ticked: the photo was unclear, check it". Null duration: `#B3361A` "How many days? The prescription doesn't say." + chips 3/5/7/10/14/30 (none selected; Add blocked until chosen). Footer summary line + mustard "Add {k} reminders". Output through the existing `ics.ts` (one VEVENT per ticked slot, "Take {name} {strength_text}", disclaimer, `RRULE:FREQ=DAILY;COUNT={days}`). Never invent a duration or a dose.
**Reminders (20)**: "Add to calendar." list with date tiles (coral month band + Fraunces day; medicines a teal "DAILY ×n" tile), ALERT ME 2 × 2 (On the day 9 AM / 1 day before / 3 days before / 1 week before; mustard selected; remembered in `sarvam.alert`), mustard "Add {n} to my calendar" (.ics) and outline "Open in Google Calendar". Past dates not listed.

### 5.7 Sheets (16–19, 22–24)
- **Listen (16)**: segmented Quick summary | Full details, ink player card, 34-bar waveform, captions Fraunces 26, mustard 78 px pause, Voice Female | Male, **Speed Slow | Normal | Fast** = 0.9× / 1× / 1.15×.
- **Ask (17)**: ink question bubble; **lavender** answer bubble with teal "S." avatar, evidence tick + Play; outline suggestion chips; input pill with coral mic and mustard send; placeholder "Type your question…".
- **Share or save (18)**: teal "Hide personal details" row (coral eye-off tile, toggle), "WHAT WILL BE SHARED" preview rendered from `buildShare().segments` (masked segments as dashed mustard-wash monospace chips), then **five 56 px round targets with 12 px labels in a 5-column grid**: WhatsApp (`#25D366`, real glyph from the source), Email (mustard), Copy text (coral), **Save image** (teal tint, image icon → screen 19), More (ink, `navigator.share`). Never build share text yourself.
- **Save as image (19)** — IN SCOPE now. Sheet titled "Save as image." with close (back to Share). Left: a 140 × 260 preview card rotated −3° showing the real rendered image thumbnail (shutter flash motion); right: "The whole explanation as one tall image. Keep it in Photos, or send it to family or your doctor." + teal-tint "Works offline" chip. Segmented **Whole page | Summary only** (mustard selected; remembered in `sarvam.snapshotMode`). "Hide personal details" row (toggle; default ON; same state as Share). Buttons: outline **Share image** and mustard **Save to Photos** (download icon).
  Behaviour: render an off-screen export view (390 px wide, `#F4F5F2`, the same components without the bottom bar, sheets or animations) from `redactResult(result, { hidePersonal })`; Summary only = summary card + In simple words + What you need to do + Watch out; footer line "Explained by Sarvam · not the original" with the date. Capture with `html-to-image` `toPng` (pixelRatio 2, fonts embedded from the self-hosted files, wait for `document.fonts.ready`). If the page is taller than 8,000 px CSS, use pixelRatio 1. **Save to Photos**: iOS/Android → `navigator.share({ files: [new File([png], name, { type: 'image/png' })] })` (the share sheet offers "Save Image"); desktop → download. **Share image**: `navigator.share` with the file (and the generic title from `buildShare`), fallback download. File name `Sarvam-{document type}-{yyyy-mm-dd}.png`, never a personal value. Works offline (no network). Toast "Image saved" / "Couldn't make the image. Try Summary only." Never include the original document photo.
- **Password (22)**, **Delete (23)**, **Accessibility (24)**: as the screens (Accessibility tiles map to existing settings: Larger text, Read aloud, High contrast, Simple words, Slower voice, My language; selected tiles mustard; text-size slider with preview).

### 5.8 States (25)
Offline: ink panel with the drifting crossed-out cloud, mustard "{n} saved results" chip, Fraunces 42 title, mustard "Open saved results" (→ All documents) and outline "Try again". Same layout for timeout, rate limit (countdown), unreadable document (tips), file too large, unsupported type, HEIC, server error, each with its own title and one primary action. Banners become outline cards with an icon tile; toasts are ink pills.

## 6. Accessibility of the new parts
Tabs on 15: `role="tablist"`, arrow keys, `aria-controls`. Accordions: `aria-expanded`. Page map: one `role="img"` with an `aria-label` listing the parts and pages. Look at these first rows are links. Save as image buttons announce results.

## 7. Mapping rules (also drawn on screen 26)
1. Glance layout: §5.5-2 (A → F, first match wins; D+ when more than 4 values).
2. Blocks appear only when their data exists, in §5.5 order. Actions render as steps per §5.5-5.
3. Reading variant: §5.4.
4. **Document → icon and colour** (Home tiles, Recent, All documents, type chip, part headers): medical report → flask, teal, cream icon · medical with `medicines` → pill, teal tint · insurance → shield, mustard · government_notice → stamped page, teal tint (pension → ₹, coral) · bank / receipt → bank columns, coral tint · investment → rising line, teal tint · utility_bill → bolt, mustard · telecom_bill → wifi, ink · challan → car, coral, white icon · tax_receipt → house, teal tint · court_legal → gavel, ink · form → clipboard, mustard · bill inside a multi upload → receipt, mustard · agreement / other → pen, `#F4F5F2` · upload with several documents → stacked pages, ink dot on `#E2E5E0`. Filter groups: Health = medical; Money = insurance, bank, receipt, pension, investment; Bills = utility, telecom, tax_receipt, challan; Notices = government_notice; Legal = court_legal, agreement; Forms = form.
5. Hide personal details display: chips per screen 26 §6; formats come from `buildShare` / `redactResult`.

## 8. Sample templates → screens (must match exactly)
Home sample tiles, in order: Lab report (flask, teal) · Insurance letter (shield, mustard) · Pension notice (₹, coral, PHOTO) · Phone invoice & warranty (phone, ink) · Property tax notice (house, teal tint) · Traffic e-challan (car, coral) · Prescription (pill, teal tint, PHOTO) · Mutual fund statement (rising line, teal) · Court summons (gavel, ink) · Bank deposit slip (form) (clipboard, mustard, PHOTO) · then the full-width Health checkup tile. Tapping a sample opens its cached result (Antigravity provides the cached results); it must look exactly like:
| Sample | Screen |
|---|---|
| sample-insurance-letter.pdf | 10 |
| sample-lab-report.pdf (new) | 11 |
| sample-pension-notice.jpg in Tamil | 12 |
| sample-prescription.jpg (new) | 13 → 21 |
| sample-echallan.pdf | 14 challan |
| sample-court-summons.pdf (new) | 14 legal notice |
| sample-mutual-fund-statement.pdf (new) | 14 investment |
| sample-bank-deposit-slip.jpg (new) | 14 form |
| sample-health-checkup.pdf (new) | 15 |
Only "days left" (relative to today) and the done state of steps may differ.

## 9. Do not
Hard-code sample text; draw trends or unprinted values; decide High/Low; compute doses or durations; use lavender outside the two places; use the old warm cream; add packages beyond §1.4; weaken any privacy rule.

## 10. Order of work
1. Fonts, tokens (`#F4F5F2` everywhere), Tailwind theme, shared components, icons, transitions. 2. Home (10 samples + health tile) + All documents. 3. Result shell + glance A–F + sectioned values + every block + numbered steps. 4. Multi-document layout (15). 5. Prescription panel + both reminders sheets. 6. Share + **Save as image**. 7. Reading A–D. 8. Listen, Ask, Password, Delete, Accessibility. 9. Onboarding. 10. States. 11. Motion + reduced-motion pass. 12. QA (§11).
If short of time, finish 1–6 completely first. A half-restyled screen is worse than an untouched one.

## 11. Acceptance (all required)
1. Side by side at 390 px against every `design/png/` file (open each sample from Home for 10–15): list and fix every difference in spacing, size, colour, border, radius, font, weight, icon, illustration, copy and motion (compare against `design/motion/*.mp4`). List any you could not remove.
2. No clipping or overlap at 360 and 430 px, in en, ta, hi, ml, or, with Larger text on. No "…" except where the design has it.
3. Each glance layout A–F, sectioned values, numbered steps and the multi-document layout render from the samples; the prescription panel and both reminders sheets behave as §5.6; each reading variant A–D shows under its rule; View all appears from the fifth saved result.
4. Save as image: Whole page and Summary only produce a PNG; with Hide ON the PNG contains no personal value from the sample (check with the four samples that have names); works with the network off; file name has no personal value.
5. All motion matches the videos and stops under reduced motion.
6. Every flow in §1.5 works. `tsc -b && vite build` and all web tests pass (quote counts). i18n parity.
7. Contrast report for every text/background pair. Bundle before/after (fonts ≤ ~120 KB gzip; `html-to-image` lazy chunk).
8. `git status` clean except your changes.

## Report, then HANDOFF (last thing)
Per section done / not done, the difference list, screens and sizes checked, tests and build output, bundle sizes, could-not-test items, `git diff --stat origin/main...HEAD`.
```
HANDOFF
from: Cursor
PR: #<n> (NOT merged; for Grok preview test and Vigneshwaran's approval)
branch: feat/sarvam-design-v3 at <SHA>
rebased on Antigravity's merge: <yes, main SHA / no, why>
tests: <web count>, build <ok/failed>
not done / differences from design: <short list>
needs from Antigravity: <missing interface or behaviour, else "none">
```
