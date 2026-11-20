# Build phases: paste one prompt at a time into Antigravity

Each phase ends with:
- `cd web && npm run build && npm test` passing
- a commit on `feat/buildathon-live-relay`
- a preview deploy, then a test on the iPhone (see the runbook)

If the agent drifts, reply with "Stop. Re-read docs/buildathon/02_ANTIGRAVITY_RULES.md and the phase's Done-when list."

---

## P0: Setup and the Live spike (10:00 to 10:30)
```
Phase P0. Read docs/buildathon/04_ARCHITECTURE.md ("Connecting to Gemini Live" and "Environment variables").
1. Add a Vite mode "relay": web/.env.relay.example with every VITE_ variable from the doc (no values). Make sure .env.*.local is gitignored.
2. Add @vitejs/plugin-basic-ssl, used only when VITE_RELAY_HTTPS=1, so `npm run dev -- --host` works on an iPhone over HTTPS.
3. Create web/src/features/relay/firebaseRelay.ts: a NAMED Firebase app 'relay' from the VITE_RELAY_FB_* variables, plus helpers for anonymous sign-in and getIdToken. Don't touch the existing Firebase initialisation in features/feedback.
4. Create web/src/features/relay/live/LiveClient.ts, the interface from the doc, and implement Option B (Firebase AI Logic, VertexAIBackend(VITE_LIVE_LOCATION), model VITE_LIVE_MODEL, AUDIO response, input+output transcription, context window compression, session resumption with the handle kept in memory).
5. Add a dev-only page at /relay-spike: a Start button (creates the AudioContext on tap), mic in, Gemini audio out, captions printed, and a button that sends the current camera frame as JPEG.
6. Tell me what you couldn't do with Option B (camera frames? transcription? resumption?). If Option B can't do audio in/out in Tamil within 30 minutes, STOP and propose Option A (Python WebSocket proxy in api/relay/live_proxy.py using google-genai on Vertex) with a file list.
Done when: on my iPhone over HTTPS, I say a Tamil sentence and hear a Tamil reply, captions show, and a camera frame question ("what is in my hand?") is answered.
```

## P1: Solo Live over the camera and pages (10:30 to 11:30)
```
Phase P1. Follow 05_UI_SPEC.md screens 1 to 3 and ui-reference/VoiceHome, LiveScanner, LiveCaptured.
1. Home (HomeScreen.tsx): make the hero card collapsible, add the Ask Sarvam bar (opens the existing Ask), add the Live Relay card (Beta), remove Take photo. Keep Choose files, Try a sample, Recent, Private by design, and the Save results switch exactly as they are.
2. features/relay/CameraScreen.tsx: getUserMedia (environment camera), shutter, page stack with a count (max 10), Proceed, End, mic toggle. Captured pages are JPEGs (long edge 1600 px) held in memory.
3. features/relay/LiveSheet.tsx + PagesView.tsx: the scanned page carousel, the dark Gemini Live sheet (collapsed/expanded), captions, keyboard input, End and save.
   - On Proceed: send each page as a still image with the text "Pinned page N", then the system prompt from 04_ARCHITECTURE.md.
   - While the camera is open, stream 1 frame per second (768 px).
4. Audio: a single AudioContext from the Start tap, mic to 16 kHz PCM16 via an AudioWorklet, Gemini 24 kHz playback via an AudioWorklet, and flush on "interrupted".
5. Reconnect on goAway or network loss with the resumption handle, showing a "Reconnecting" pill.
6. Unit tests: page stack cap, PCM downsample length maths, resumption handle storage.
Done when: on the iPhone PWA, I scan 2 pages of the sample bill, ask in Tamil "why is this bill high?", and hear an answer that quotes the amount. Captions show. The existing Home features still work.
```

## P2: Video room (11:45 to 1:30)
```
Phase P2. Follow 04_ARCHITECTURE.md "Video room" + "Firestore" and 05_UI_SPEC.md screens 4 and 5 (layout only; Gemini joins in P3).
1. API: api/relay/router.py mounted in api/main.py with one line.
   - POST /api/relay/rooms (verify the Firebase ID token; create a 4-character code; Firestore relayRooms/{code}; return a LiveKit token for the host).
   - POST /api/relay/join (open, not expired, <4 members; token can publish audio, and video only if allowed).
   - POST /api/relay/end.
   Use livekit-api for tokens. Read the secrets from the environment.
2. firestore.relay.rules + firebase.relay.json exactly as described in the doc. Don't edit firestore.rules or firebase.json.
3. Web:
   - features/relay/RoomHost.tsx: Invite sheet (QR via a small qrcode lib, code, link, "Guests can show their camera" switch, WhatsApp share via wa.me with the link, Copy link), the host video full screen, the tile row, controls.
   - features/relay/RoomGuest.tsx at path /r/:code: join step (name, language, Join with mic on, camera off), the call view, Leave, and the left screen.
   - Use livekit-client. Reconnect on network change.
4. "Invite family" on the solo screen upgrades the solo session into a room without losing pages or captions.
5. Playwright (two browser contexts, fake media flags): the host creates a room, the guest joins by link, and the guest sees the host video track subscribed.
Done when: my iPhone hosts, the laptop joins by QR/link, and both see the host camera and hear each other.
Before deploying: show me the exact gcloud and firebase commands for the buildathon project. I'll run them.
```

## P3: Gemini in the room, camera handoff, End and save (2:30 to 4:00)
```
Phase P3.
1. Host audio mix: the local mic plus every remote guest audio track go through Web Audio gain nodes into the 16 kHz worklet and on to LiveClient.sendAudio. Gemini's output plays locally AND is published as a LiveKit audio track named "gemini". Never feed Gemini's output back into the input.
2. Speaker notes: on an ActiveSpeakersChanged change, send the text "(Name is speaking, Language)" with turnComplete=false. Label input transcription lines with the current speaker. Broadcast captions over the data channel {caption}.
3. Guest caption language: if a line's language differs from the viewer's, call POST /api/relay/translate (Gemini Flash on Vertex, cached by line id). Show "(from Tamil)".
4. Camera handoff per 03_PRODUCT_SPEC F5 and 05_UI_SPEC:
   - one activeCamera in Firestore
   - cameraRequest, then Allow / Not now on the host; auto-grant when allowGuestCamera is on and the host camera is off
   - Take back; the camera returns to the host when the guest leaves
   - Frames to Gemini come from the active camera's video element. Send "(Now showing Arun's camera)".
5. Pin: the host captures a full-resolution still, sends it to Live as an image + "Pinned page", and broadcasts {pin} so guests show the pinned chip.
6. End call: broadcast {end}, set the room ended and delete the doc, save relaySessions in IndexedDB (title, participants, captions, pins, cards), and show the Session saved screen. The session appears in Recent. Respect the Save results switch.
7. Tests:
   - unit: speaker labelling, camera handoff state machine (request, grant, take back, leave), session save/load
   - Playwright: host + guest, guest requests the camera, host allows, activeCamera changes; End shows the guest left screen
Done when: two-phone demo. Amma (guest) asks in Tamil by voice, Gemini answers aloud on both phones, captions show names, the guest shows their camera after I turn mine off, and End saves the session to Recent.
```

## P4: Form fill to PDF (4:00 to 6:00)
```
Phase P4. Follow 04_ARCHITECTURE.md "Form fill" and 05_UI_SPEC.md screen 9 + ui-reference/FormFill.dc.html.
1. api/formfill/router.py:
   - POST /api/formfill/detect (images → fields with boxes 0–1000, types, profileKey; Gemini on Vertex with a response schema)
   - POST /api/formfill/extract (missing fields + transcript → values JSON)
   Use api/reader.py get_client().
2. IndexedDB: the profile store + a My details setup sheet (first use). ID numbers only if "Save ID numbers on this phone" is on.
3. features/formfill/FormFillScreen.tsx:
   - fill from the profile
   - missing fields → send Live "Ask the user, one at a time, for: …"; after each user turn, call /extract
   - blue Caveat text on the page image, tap a box to edit, signature/photo never filled, ID numbers masked until tapped
4. PDF with pdf-lib (the image page + text at the box coordinates; charGrid per cell; ✓ for checkboxes; AcroForm fill when the input is a fillable PDF). File name: "<Form title> - filled - <date>.pdf".
5. Share: Web Share API with files, else download. Keep in Sarvam saves to drafts and shows in Recent as "Draft · sign by hand".
6. Entry points: a "Fill a form" chip on the camera/pages screen, and Ask ("fill this form").
7. In a room, form values show only on the owner's phone, and the PDF is shared only via the share sheet.
8. Tests: box-to-PDF coordinate maths, charGrid splitting, the date format follows the form's, ID masking, draft save/load.
Done when: I scan the sample KYC form, it fills 6 fields, asks me for the nominee by voice, and I get a PDF on the iPhone that I can send to WhatsApp or save to Files. Signature blank.
```

## P5: Ask Sarvam on Home, reminders, notifications (6:30 to 8:30)
```
Phase P5.
1. The Ask bar on Home opens the existing Ask screen in "home" mode. Before calling the existing Ask endpoint, search IndexedDB (relaySessions, documents, drafts, gmailItems): keyword + recency score, top 3 excerpts, each with a source id. Pass the excerpts as context. Never send everything.
2. Answer in the user's language and script (existing language matching). Show a source card that opens the session at that caption.
3. Agentic cards: propose_reminder, propose_calendar_event and open_session as approval cards (Add / Not now). Reuse CalendarEditSheet and utils/ics.ts. Never act without a tap.
4. Reminders appear in Home "Today and tomorrow" and in the Notifications panel. Add an in-app banner toast on add. Dedupe by title + time.
5. Web Push: skip it. In-app only, plus the .ics Add to Calendar.
Done when: from Home I ask in Tanglish "Arun bill pathi enna sonnaan?" and get a Tanglish answer from today's saved session with a source card, and "remind me two days before" creates a reminder that shows on Home and in Notifications.
```

## P6: Connect Google + private card in the call (8:30 to 10:00)
```
Phase P6. Follow 04_ARCHITECTURE.md "Google connection", 03_PRODUCT_SPEC F11/F12, and 05_UI_SPEC screens 4 and 8.
1. features/google/ConnectGoogle.tsx (screen 8): service switches, Continue with Google (Firebase Auth GoogleAuthProvider on the relay app with only the chosen scopes), connected state, Disconnect (revoke the token + clear gmailItems).
2. Gmail scan: on app open and every 15 min while open. Metadata + snippet only → /api/ask extraction → gmailItems → suggestions on Home with the Gmail icon. Silent re-auth on 401.
3. Private card in the call (host only): keyword-match recent captions against gmailItems + relaySessions + documents. Show "Only you can see this" with Share with everyone / Keep private. Share starts a 5-second Undo, then broadcasts {card sharedBy} and sends "[shared by Vignesh, from Gmail]: …" to Live.
4. Plans UI: Free = Auto + Basic; Plus is locked, and nothing is charged.
5. Tests:
   - unit: a private card is never broadcast before Share, Undo cancels the Live text, Disconnect clears the items
   - Playwright: the guest never receives the card before Share
Done when: in a two-phone call, the BESCOM email card shows only on my iPhone, and after Share the guest sees "Shared by Vignesh" and Gemini mentions it.
```

## P7: Polish, tests, submission material (10:00 to 11:00 PM)
```
Phase P7.
1. Run all tests and fix failures. Run the Playwright relay spec headed once and save the trace.
2. README.md: add a section "What I built at the buildathon (20 Nov 2026)": features, architecture diagram (text), commit range, how to run, privacy notes, known limits (Testing-mode Gmail, LiveKit free tier, iPhone needs a tap for audio).
3. Make sure every new string exists in all 9 languages.
4. Remove the dev-only /relay-spike route from the production build.
5. Final preview deploy commands for me to run, and a checklist of the URLs to put in the submission.
```
