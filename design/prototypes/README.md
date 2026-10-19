# Sarvam UI Prototypes (3 New Screens)

Interactive UI prototypes for three new screens designed for **Sarvam** in the exact **Design v3** design system.

Built as standalone, zero-dependency HTML files with embedded styling and JavaScript. They use only fictional sample data (from `web/public/samples/`) and make **no backend or API calls**.

---

## Files and Paths

| File | Screen / Purpose | Direct Open Command |
|---|---|---|
| [`index.html`](file:///Users/vigneshwaran/Projects/sarvam/design/prototypes/index.html) | **Review Hub & Gallery**: Side-by-side interactive 390×844 phone frames with global language switch, scaling, and screen selector. | `open design/prototypes/index.html` |
| [`1-reading-progress.html`](file:///Users/vigneshwaran/Projects/sarvam/design/prototypes/1-reading-progress.html) | **Screen 1: Reading Progress**: Replaces the wait spinner during document processing. Live streaming of document type, key points, explanation-ready CTA, and error recovery. | `open design/prototypes/1-reading-progress.html` |
| [`2-whats-due-timeline.html`](file:///Users/vigneshwaran/Projects/sarvam/design/prototypes/2-whats-due-timeline.html) | **Screen 2: "What's Due" Timeline**: Aggregates upcoming deadlines and medicine times from saved documents grouped as Overdue, This week, This month, and Later. Includes source quote sheet, calendar add sheet, and empty state. | `open design/prototypes/2-whats-due-timeline.html` |
| [`3-voice-first-ask.html`](file:///Users/vigneshwaran/Projects/sarvam/design/prototypes/3-voice-first-ask.html) | **Screen 3: Voice-First Ask**: Big 104px microphone button, listening soundwave animation, live typing transcript, document quote answer card, general info answer card, audio playback, mic-denied state, and type-instead fallback. | `open design/prototypes/3-voice-first-ask.html` |

---

## How to Open & Try

Each `.html` file is self-contained. Open by double-clicking in Finder or via terminal:

```bash
# Open the full interactive 3-screen gallery:
open design/prototypes/index.html

# Or open individual screens:
open design/prototypes/1-reading-progress.html
open design/prototypes/2-whats-due-timeline.html
open design/prototypes/3-voice-first-ask.html
```

### Deep-Link URL Parameters

You can also test specific screen states directly via URL query parameters:

- **Screen 1 (Reading Progress)**:
  - `?lang=en&state=ready` — Finished explanation-ready state (English)
  - `?lang=ta&state=ready` — Finished explanation-ready state (Tamil)
  - `?lang=en&state=error` — Friendly photo-too-blurry error state with "Try again"
- **Screen 2 ("What's due" Timeline)**:
  - `?lang=en` — Timeline view with Overdue, This week, This month, Later
  - `?lang=ta` — Timeline view in Tamil
  - `?lang=en&item=later_pension` — Opens source quote sheet for Pension notice
  - `?empty=true` — Shows "Nothing due" empty state
- **Screen 3 (Voice-First Ask)**:
  - `?lang=en` — Initial voice-first screen with big mic button
  - `?lang=ta` — Voice-first screen in Tamil
  - `?lang=en&q=1` — Answered document question with quote & "Found in your document"
  - `?lang=en&q=2` — General question with "General information, not from your document"
  - `?denied=true` — Microphone permission denied banner & "Type instead"

---

## Design v3 Fidelity Checklist

- **Surfaces & Colors**:
  - Cool off-white background: `#F4F5F2`
  - High-contrast ink outlines and text: `#1A1A1A` with 1.5px border
  - Coral accent: `#D9603B` on wordmark dot (`Sarvam.`), heading full stops, and alert badges
  - Coral soft: `#F8D9CB` on date chips & document badges
  - Forest teal: `#034F46` and `#CFE5E0` on secure badges and verified evidence
  - Primary mustard: `#E9B44C` on primary action buttons and active chips
  - Lavender: `#F0D7FF` on Ask answer card
- **Typography**:
  - Headings: `Fraunces` weight 400 with coral full stops
  - Body & UI: `DM Sans` (400 body, 500-700 UI)
  - Indic: `Noto Sans Tamil` with clean font rendering
- **Evidence Badges**:
  - `Found in your document` (`உங்கள் ஆவணத்தில் உள்ளது`)
  - `Calculated` (`கணக்கிடப்பட்டது`)
  - `Check against original` (`அசல் ஆவணத்துடன் சரிபார்க்கவும்`)
  - `General information, not from your document` (`பொதுவான தகவல், உங்கள் ஆவணத்திலிருந்து அல்ல`)
- **Device Dimensions**: Standard mobile 390 × 844 px phone frame, large tap targets (44–56 px).
- **Motion & Accessibility**: Calm, non-flashing animations (`sv-fade-up`, `sv-sheet-up`, `sv-scan-beam`), High Contrast toggle, and Larger Text support.
