# Judging rubric (from the 20 Nov slide, "Proposed Weight") and what we do about it

| Parameter | Weight | What earns a high score here |
| --- | --- | --- |
| Functional Product & Implementation | 30% | The demo works live on real phones, start to finish, without us explaining around bugs |
| Technical Architecture & Engineering Quality | 20% | Clean structure, tests, security, error handling, a README that explains it |
| Google AI Integration & Implementation Depth | 20% | Several Google AI pieces used properly, not one API call |
| Problem-Solution Alignment | 15% | A real problem, and a demo that solves exactly that problem |
| UX, Usability & Accessibility | 10% | No-app guest join, Indic languages, captions, readable and usable by anyone |
| Innovation & Differentiation | 5% | Multi-person Gemini Live is the hook. Don't spend build time on more novelty |

Priority when time is short: Functional (30) first, then Architecture (20) and Google AI (20) together, then Problem fit (15), UX (10), Innovation (5).

## 1. Functional Product & Implementation (30%)
- Never cut: Gemini Live on the host camera, a guest seeing it and hearing Gemini, the saved session, form fill to PDF.
- A smaller feature that works every time beats a bigger one that works sometimes. Cut order stays: Drive/Word/Google Doc outputs, in-call Gmail card, P5 reminders, guest open mic, multi-page.
- After every phase: test on the real iPhone and one second device, on mobile data for the guest.
- Keep a stable preview URL and one rehearsed demo path. Make a 90-second backup screen recording at the 6 PM freeze.
- Every failure shows a clear message (App Check, mic denied, room full, expired code), never a blank screen.

## 2. Technical Architecture & Engineering Quality (20%)
- Keep the LiveClient interface, the room-state design and the privacy model in the README as a short diagram.
- Tests: unit tests for the state machines (camera handoff, private card, page stack, form fill maths), plus the Playwright two-browser spec. `npm run build && npm test` green on the final commit.
- Security: no secrets in the repo, `.env.*.local` ignored, App Check on, the private card never sent to guests before Share (tested), tokens never logged.
- Production hygiene: remove the dev-only /relay-spike route and the WebSocket logging patch from the production build. Reconnect and resumption handled.
- Separate service (`sarvam-relay-api`) and a Hosting preview channel, so production is untouched.

## 3. Google AI Integration & Implementation Depth (20%)
List only what is really built, and show each in the README and the deck's "How it works" slide:
- Gemini Live (native audio) via Firebase AI Logic on Vertex: voice in and out, transcription both ways, context window compression, session resumption, interruption handling, multilingual
- Gemini multimodal for form detection with a structured response schema, and extraction from the voice transcript
- Gemini for translation of captions and card suggestions (sidecar)
- Firebase AI Logic with App Check (reCAPTCHA Enterprise), Cloud Run, Firebase Hosting, Vertex AI billing in one Google Cloud project
- Say why: one Live session on the host's phone is what makes it a shared room.

## 4. Problem-Solution Alignment (15%)
- One sentence: Indian families decide about paperwork together, across cities and languages, and the paperwork is hard to read and hard to fill.
- Demo uses a real-looking electricity bill and a real KYC form, in Tamil and English, with two people on two phones.
- Every demo step maps to the problem: understand it, discuss it, act on it (reminder, filled form).

## 4b. UX, Usability & Accessibility (10%)
- Guest joins by link or QR with no app and no sign-up.
- Captions on all speech, in the viewer's language; the captions region is `aria-live="polite"`.
- Large touch targets, readable contrast, Noto fonts for Tamil and Hindi, text that scales.
- Reduced-motion respected; every icon button has a label; check with VoiceOver once on the iPhone.
- Clear states: connecting, reconnecting, muted, camera off, waiting for permission.

## 5. Innovation & Differentiation (5%)
- The hook is already built: Gemini Live is one of the people in a family video call, with private-until-Share cards. Say it in the first 10 seconds. Don't add features for this row.

## Final-hour checklist (P7)
- [ ] Demo runs twice in a row without a restart
- [ ] README has the diagram, the Google AI list, how to run, known limits
- [ ] Tests and build green, preview URL works on two phones
- [ ] Deck's slide 5 lists the Google AI pieces above
- [ ] Backup video saved
