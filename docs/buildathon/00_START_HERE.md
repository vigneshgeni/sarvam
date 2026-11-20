# Sarvam Live Relay: buildathon handoff (20 to 21 Nov)

Put this whole folder in the repo at `docs/buildathon/` on the branch `feat/buildathon-live-relay`. Then Antigravity can read it.

## What each file is for

| File | Who reads it | When |
| --- | --- | --- |
| `01_MORNING_RUNBOOK.md` | You | From waking up to submission, step by step, including what to say to mentors |
| `02_ANTIGRAVITY_RULES.md` | Antigravity | Paste it into Antigravity's workspace rules before the first prompt |
| `03_PRODUCT_SPEC.md` | Antigravity + you | What we build, what we don't, privacy rules, edge cases |
| `04_ARCHITECTURE.md` | Antigravity | How the parts connect, data shapes, Gemini Live setup |
| `05_UI_SPEC.md` | Antigravity | Design tokens and every screen, with links to `ui-reference/` |
| `06_BUILD_PHASES.md` | You paste one phase at a time | Copy-paste prompts P0 to P7, each with "done when" checks |
| `07_TEST_PLAN.md` | Antigravity + you | Unit, Playwright two-browser and iPhone checks |
| `08_DEMO_PITCH_SUBMISSION.md` | You | 60-second pitch, 3-minute demo, submission checklist |
| `ui-reference/*.dc.html` | Antigravity | The approved screen designs: inline styles, copy and states. They are design references only. Don't import them |

## How to start Antigravity (2 minutes)

1. Copy this folder into `~/Projects/sarvam/docs/buildathon/`.
2. In Antigravity, open the workspace rules (Customizations, then Rules) and paste all of `02_ANTIGRAVITY_RULES.md`.
3. Open a new agent chat on branch `feat/buildathon-live-relay` and paste this:

> Read docs/buildathon/03_PRODUCT_SPEC.md, 04_ARCHITECTURE.md and 05_UI_SPEC.md fully. Don't write code yet. Reply with: (1) a 10-line summary of what we're building, (2) the existing files you'll reuse (api.ts, utils/db.ts, utils/ics.ts, CalendarEditSheet, HomeScreen.tsx, the redact and transcribe endpoints), and (3) any question that blocks Phase P0. Then wait.

4. Then paste the Phase P0 prompt from `06_BUILD_PHASES.md`. Do one phase at a time, and review each diff before accepting it.

## How we'll work during the day

- When something looks wrong, send me (Claude) a screenshot or the error. I'll write the exact fix prompt for Antigravity.
- After every phase: `npm run build && npm test`, a commit, then a preview deploy so you can test on your iPhone (see the runbook).
