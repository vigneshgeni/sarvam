# Architecture: Live Relay, form fill, Ask, Google

## The shape in one paragraph
The host's phone is the bridge. It runs **one Gemini Live session** for the whole room. The session's inputs are the active camera (1 frame per second) and one audio mix of everyone's voices. Gemini's voice is played on the host's phone and published into the call so everyone hears it. A WebRTC room (LiveKit Cloud) carries video and voices between phones. Guests never connect to Gemini. **Live is used only for conversation (no tools).** Cards (reminders, memory nudges, Gmail facts) come from a **sidecar**: regular Gemini calls through our API on Vertex AI. Private lookups run on the owner's phone and never enter the Live session.

```
Host phone (PWA)                                   Guests (browser, no app)
  camera, mic ─┐                                     mic (+ camera when allowed)
  guest audio ─┼─ Web Audio mix (16 kHz PCM) ─┐            │
  active video ─ canvas 1 fps JPEG ───────────┤            │
                                              ▼            │
                              Gemini Live (Vertex AI, us-central1)
                                              │ 24 kHz audio + transcripts
  play locally + publish "gemini" audio ◄─────┘
  LiveKit room ◄──────────── video, voices, data channel (captions, cards, pins) ────────────► guests
  IndexedDB: sessions, chats, profile, reminders, gmailItems (private)
  Sidecar: /api/relay/suggest, /api/ask (private excerpts), /api/formfill/*
```

## Connecting to Gemini Live (decide in P0 with a 30-minute spike)

**Option B, try first (15 min): Firebase AI Logic web SDK, Vertex backend.**
```ts
import { initializeApp } from 'firebase/app'
import { getAI, getLiveGenerativeModel, VertexAIBackend, ResponseModality, startAudioConversation } from 'firebase/ai'
const app = initializeApp(relayConfig, 'relay')            // named app: don't clobber the existing app
const ai = getAI(app, { backend: new VertexAIBackend('us-central1') })
const live = getLiveGenerativeModel(ai, {
  model: 'gemini-live-2.5-flash-native-audio',             // confirm the name in Vertex AI Studio
  generationConfig: { responseModalities: [ResponseModality.AUDIO] },
  systemInstruction: SYSTEM_PROMPT,
})
const session = await live.connect()
```
Pass if: it connects, `startAudioConversation(session)` lets you talk in Tamil and hear Tamil back, and you can also push camera frames and text into the same session.

Notes from Firebase's docs:
- On Vertex (Agent Platform), only the Live **2.5** models are listed, and they are **not available in `global`**. Use a region.
- Function calling with Live on web isn't documented yet. That's fine, because we don't use Live tools.

**Option A, fallback (more code, always works): our own WebSocket proxy on Cloud Run with the Python `google-genai` SDK on Vertex.** This is the SDK the app already uses in `api/reader.py`.
```python
# api/relay/live_proxy.py  (FastAPI WebSocket at /api/relay/live)
from google import genai
from google.genai import types
client = genai.Client(vertexai=True, project=PROJECT, location=LIVE_LOCATION)
config = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    system_instruction=SYSTEM_PROMPT,
    input_audio_transcription=types.AudioTranscriptionConfig(),
    output_audio_transcription=types.AudioTranscriptionConfig(),
    context_window_compression=types.ContextWindowCompressionConfig(sliding_window=types.SlidingWindow()),
    session_resumption=types.SessionResumptionConfig(handle=resume_handle),
)
async with client.aio.live.connect(model=LIVE_MODEL, config=config) as session:
    # browser → server frames: {"t":"audio", b64 PCM16 16k} | {"t":"video", b64 JPEG} | {"t":"text", s}
    await session.send_realtime_input(audio=types.Blob(data=pcm, mime_type="audio/pcm;rate=16000"))
    await session.send_realtime_input(video=types.Blob(data=jpeg, mime_type="image/jpeg"))
    await session.send_client_content(turns=types.Content(role="user", parts=[types.Part(text=s)]), turn_complete=True)
    async for msg in session.receive():  # → browser: audio 24k b64, input/output transcription, resumption handle, go_away
        ...
```
- Auth: the browser sends its Firebase ID token in the first WebSocket message, and the server verifies it.
- Cloud Run: allow WebSockets, `--timeout 3600`, min instances 1 during the demo.

Either way, the client exposes one interface, `LiveClient { connect(), sendAudio(pcm16), sendFrame(jpeg), sendText(text, turnComplete), onAudio, onInputText, onOutputText, onInterrupted, close() }`, so the rest of the app doesn't care which option won.

**Required settings:** input and output transcription on, context window compression on, session resumption on. Handle `goAway` by reconnecting with the last handle. Without compression, an audio+video session stops after about 2 minutes, and connections reset about every 10 minutes.

**System prompt (room layer):**
```
You are Sarvam, a calm, friendly helper in a family video call in India. Several people may speak; each turn may start with a note like "(Arun is speaking, English)". Answer the person who asked, in the language and script they used (Tamil, Tanglish, Hindi, Hinglish, English, Telugu, Kannada, Malayalam, Bengali, Marathi, Odia). Keep answers short: 1 to 3 sentences, numbers and dates exact, read from what the camera or the pinned page shows. If you can't read something, ask them to hold it closer. You do not know anyone's personal details, emails or past conversations unless a line starting with "[shared by …]" gives them to you. Never read out ID numbers. Never invent amounts, dates or names.
```

## Video room (WebRTC)
**Primary: LiveKit Cloud** (free tier). Web: `livekit-client`. Server: Python `livekit-api` for tokens.
- `POST /api/relay/rooms` (host, Firebase ID token): creates the code (4 characters, no 0/O/1/I), `expiresAt = now + 30 min`, writes Firestore `relayRooms/{code}`, returns `{ code, url, livekitToken }`.
- `POST /api/relay/join` `{ code, name, lang }` (guest, anonymous Firebase auth): checks the room is open, not expired, members < 4. Returns a LiveKit token: `canPublish` audio only, plus video when `allowGuestCamera` is on or the host granted it.
- Tracks:
    - Host publishes `camera`, `mic` and `gemini` (Gemini's voice from a `MediaStreamAudioDestinationNode`).
    - Guests publish `mic`, and `camera` only while they are the active camera.
- Data channel (reliable) message types:
    - `caption {id, speaker, lang, text, final}`
    - `card {id, kind, text, sharedBy, source}`
    - `pin {id, jpegUrl?}`
    - `camera {active: uid}`
    - `cameraRequest {uid}`
    - `cameraGrant {uid}`
    - `hand {uid, up}`
    - `end {}`
- Active speaker: LiveKit `ActiveSpeakersChanged` plus local mic level. When the speaker changes, the host sends Live a text note `"(Arun is speaking, English)"` with turnComplete false.

**Fallback if LiveKit isn't allowed:** peer-to-peer `RTCPeerConnection` mesh (≤4 people), with Firestore `relayRooms/{code}/signals` for offers, answers and ICE candidates, STUN `stun:stun.l.google.com:19302`. It works on the same Wi-Fi or a hotspot, but may fail on some mobile networks (no TURN server).

## Firestore (buildathon project only; rules file `firestore.relay.rules`, deployed with `--config firebase.relay.json`)
```
relayRooms/{code}: { hostUid, status: 'open'|'ended', createdAt, expiresAt, allowGuestCamera: bool,
                     activeCamera: uid, members: { [uid]: { name, lang, joinedAt } } }
```
Rules: anyone signed in (anonymous counts) can read a room they know the code of while `status == 'open'` and it hasn't expired. Only `hostUid` can update `status`, `activeCamera` and `allowGuestCamera`. Members can write only their own member entry. At End, the host sets `status: 'ended'` and deletes the doc. Nothing else is stored in the cloud.

## Host audio pipeline
- One `AudioContext`, created on the Start tap (an iPhone requirement).
- Inputs: the local mic (`echoCancellation`, `noiseSuppression` on) plus each remote guest audio track, through a `GainNode` mixer and an `AudioWorkletNode` that downsamples to 16 kHz mono PCM16 in 40 ms chunks.
- Output: Gemini's 24 kHz PCM is queued into an `AudioWorklet` player, then goes to the speakers and to a `MediaStreamDestination`, which is published as the `gemini` track.
- Gemini's own voice is never mixed back into the input.
- Barge-in: when Live sends `interrupted`, flush the player queue.

## Frames to Gemini
- Take the active camera's `<video>` (own or remote), draw it to a 768 px canvas, and encode it with `toBlob('image/jpeg', 0.7)` at 1 per second.
- Pin: send one sharp full-resolution still as a client-content image part, plus the text "Pinned page".
- On a camera change, send the text `"(Now showing Arun's camera)"`.

## Sidecar (cards)
- **Room-safe suggestions:**
    - After each final user caption, `POST /api/relay/suggest { lines: last 8, lang }` calls Gemini Flash on Vertex with a response schema `[{kind:'reminder'|'calendar', title, whenISO, source:'call'}]`.
    - The result shows as a card to the host, who can Add.
    - Optional: broadcast it to everyone.
- **Private nudges (owner's phone only):**
    - Keyword-match the latest captions against IndexedDB (sessions, documents, gmailItems).
    - On a hit, call the existing Ask endpoint with the top 3 excerpts.
    - The result is a private card (`Only you can see this`).
    - Share: broadcast to the room and, after a 5-second Undo, `sendText("[shared by Vignesh, from Gmail]: …", true)`.

## Form fill
1. `POST /api/formfill/detect { images: [jpeg…] }` sends the images to Gemini 2.5 (Flash, or Pro if Flash misses boxes) on Vertex with a response schema:
   `fields: [{ id, label, type: 'text'|'date'|'checkbox'|'signature'|'photo'|'charGrid', page, box: [ymin,xmin,ymax,xmax] (0–1000), cells?: number, profileKey?: string, required: bool }]`.
   Prompt it to map labels to profile keys: `fullName, dob, gender, mobile, email, addressLine, city, state, pin, occupation, fatherOrSpouseName, nomineeName, nomineeRelation, nomineeDob, pan, aadhaar`.
2. The client fills from `profile` (IndexedDB). Missing required fields go to Live with the text "Ask the user, one at a time, for: Nominee name, Relation."
3. After each user answer, `POST /api/formfill/extract { fields: missing, transcript: since last ask }` returns `{ id: value }`.
4. The review screen draws the values in blue on the page image. Tap a box to edit.
5. PDF: `pdf-lib`. Each page is the original JPEG at full size. For text, `y = pageH * (1 - box.ymax/1000)` plus padding, size fitted to the box height. A charGrid writes one character per cell. A checkbox draws ✓. Signature and photo boxes are skipped. If the input is a fillable PDF (an AcroForm), fill its fields instead.
6. Share: `navigator.canShare({ files: [pdf] })` then `navigator.share({ files: [pdf], title })`. Otherwise download. Keep in Sarvam saves to the `drafts` store, and it shows in Recent as "Draft · sign by hand".

## IndexedDB additions (extend `web/src/utils/db.ts`; bump the version; migrations are additive)
- `relaySessions`: `{ id, startedAt, endedAt, title, participants[], captions[], pins[], cards[] }`
- `profile`: `{ id: 'me' | familyId, … }` (ID numbers saved only if `saveIds` is true)
- `drafts`: `{ id, title, pdfBlob, fields, createdAt, status }`
- `gmailItems`: `{ id, title, amount?, dueISO?, source: { from, subject, date }, createdAt }`
- `askChats`: `{ id, turns[] }`
- `reminders`: reuse the existing reminders storage if present; otherwise add one

## Google connection (evening, P6)
- Firebase Auth `GoogleAuthProvider` on the **relay** app, with scopes `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/calendar.events`. Request a scope only when its feature is first used.
- Get the access token from `GoogleAuthProvider.credentialFromResult(result).accessToken`. It lasts about 1 hour; on a 401, re-run the sign-in quietly.
- Gmail: `GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=newer_than:14d (bill OR invoice OR due OR ticket OR PNR OR appointment OR booking)&maxResults=20`, then `messages/{id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date` plus the snippet.
  Send only the subject, sender, date and snippet to `/api/ask` with an extraction prompt. Save the extracted items to `gmailItems`. Never store bodies.
- Check when the app opens and every 15 minutes while it's open.
- Disconnect: revoke the token (`https://oauth2.googleapis.com/revoke?token=…`), clear `gmailItems` and pending suggestions.
- Testing mode limits: 100 test users, consent lapses after 7 days, and an "unverified app" warning. That's expected for the demo.

## Environment variables
`web/.env.relay.local` (gitignored):
```
VITE_RELAY=1
VITE_API_URL=https://sarvam-relay-api-xxxx.a.run.app
VITE_LIVEKIT_URL=wss://<project>.livekit.cloud
VITE_LIVE_MODEL=gemini-live-2.5-flash-native-audio
VITE_LIVE_LOCATION=us-central1
VITE_RELAY_FB_API_KEY=… VITE_RELAY_FB_AUTH_DOMAIN=… VITE_RELAY_FB_PROJECT_ID=sarvam-buildathon
VITE_RELAY_FB_APP_ID=… VITE_RELAY_FB_STORAGE_BUCKET=… VITE_RELAY_FB_SENDER_ID=…
```
`api/.env.local` (gitignored; Secret Manager on Cloud Run):
```
GOOGLE_CLOUD_PROJECT=sarvam-buildathon
LIVE_LOCATION=us-central1
LIVE_MODEL=gemini-live-2.5-flash-native-audio
LIVEKIT_URL=… LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=…
```

## Deploy (buildathon project only; I run these myself)
```
gcloud run deploy sarvam-relay-api --source api --region asia-south1 --project sarvam-buildathon \
  --allow-unauthenticated --timeout 3600 --min-instances 1 --set-secrets LIVEKIT_API_SECRET=livekit-secret:latest
cd web && npm run build -- --mode relay
firebase hosting:channel:deploy relay --project sarvam-buildathon --expires 7d
firebase deploy --only firestore:rules --config ../firebase.relay.json --project sarvam-buildathon
```
