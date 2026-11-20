# Test plan

Test the logic with unit tests and fakes, test two people with two Playwright browser contexts, and test the real voice and camera on real phones after every phase.

## Unit tests (`web/tests/*.test.mjs`, node:test, existing style)
- Page stack: cap at 10, retake replaces the right page
- Audio: the 48 kHz to 16 kHz downsample keeps the duration; a 40 ms chunk is 640 samples
- Live client: resumption handle stored and reused, goAway triggers a reconnect, interrupted flushes the player
- Speaker labelling: the active speaker at transcription time is the line's label; a speaker change sends one note
- Camera handoff state machine: host → request → grant → guest; Take back; guest leaves → host; two requests queue
- Room code: 4 characters, no ambiguous characters; expired and full rooms are refused
- Session save/load: captions, pins and cards round-trip; Save results off means nothing is stored
- Form fill: box (0–1000) to PDF points; charGrid split; checkbox mark; date formats; ID masking; signature never filled
- Memory search: "what did Arun say about the bill" ranks today's session first; at most 3 excerpts
- Reminders: dedupe by title + time; .ics output (existing tests stay green)
- Private cards: never broadcast before Share; Undo cancels; Disconnect clears gmailItems

## Playwright e2e (`web/e2e/relay.spec.ts`)
Launch Chromium with:
```
--use-fake-ui-for-media-stream --use-fake-device-for-media-stream
--use-file-for-fake-video-capture=e2e/media/bill.y4m
--use-file-for-fake-audio-capture=e2e/media/question-ta.wav
```
- Mock Gemini Live with a fake `LiveClient` (scripted replies) behind a test flag. Use the real LiveKit test project, or a local `livekit-server --dev` in Docker if available.
- **Host and guest flow:**
    1. The host creates a room. The guest context opens `/r/CODE`, then enters a name and Tamil.
    2. The guest sees the host video.
    3. The guest's caption reaches the host. The fake Gemini reply caption reaches both.
    4. The guest asks for the camera, the host allows it, and activeCamera changes.
    5. The host ends the call. The guest sees "You left the call". Recent shows the session.
- **Negative cases:** an expired code, a 5th person and a join after End are all refused.
- **Privacy:** the guest page never receives a `card` message before Share.
- **Form fill:** with the detect/extract endpoints mocked, the PDF downloads and its text layer contains the profile name.
- Run against the Firebase emulators: `firebase emulators:start --only firestore,auth --config firebase.relay.json`.

## Real devices (5 minutes after each phase)
| Device | Role | Check |
| --- | --- | --- |
| iPhone, PWA from the Home Screen | Host | Camera, mic, audio plays after Start, lock/unlock resumes, Tamil speech, the share sheet with the PDF |
| Laptop Chrome | Guest / judge | Join by link, captions, hold-to-talk / open mic, Show camera |
| Second phone (Android Chrome or a borrowed iPhone) | Guest | Join by QR on mobile data, not Wi-Fi |

Use earphones on one device when phones are in the same room, or the audio echoes.

## Antigravity prompts that work
- "Write the failing test first for X, then implement until `npm test` passes. Show me the diff."
- "Run the Playwright relay spec headed and show me the trace if it fails."
- "Use the browser agent to open the guest link and click through join, ask and leave. Screenshot each step."
