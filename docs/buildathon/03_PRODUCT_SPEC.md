# Product spec: Sarvam Live Relay + Ask Sarvam

## One line
**Sarvam Live Relay is a video call where Gemini Live is one of the people in it.** Point your camera at a bill, form, book or anything. Family joins from a link with no app. Everyone talks in their own language, and Gemini answers all of them. It can fill a form from a scan into a PDF. Private things stay private until you tap Share.

## Users
- **Host:** an existing Sarvam user on an iPhone (PWA) or Android phone. Owns the room, the memory and the Google connection.
- **Guest:** anyone with a browser and the link. No account. Optional: a Sarvam user with their own Google connected (private cards on their own phone). That's next, not tomorrow.

## Features (build = tomorrow, next = pitch only)

| # | Feature | Status | Acceptance |
| --- | --- | --- | --- |
| F1 | Live Relay camera: blank camera, shutter, page stack with a count, Proceed, End, mic | build | 1 page goes straight to the scan view. Many pages go to a swipeable carousel. Cap at 10 |
| F2 | Solo Gemini Live over the camera and pages, any of the 9 languages, captions, transcript drawer | build | Ask in Tamil, get a spoken Tamil answer within about 2 s, captions show |
| F3 | Video room: Invite sheet (QR, link, 4-character code), guest join page (name, language, mic on, camera off) | build | A second device joins in under 10 s and sees the host's camera live |
| F4 | Gemini in the room: hears everyone (host-side mix), speaks to all, captions with speaker names in each viewer's language | build | A guest asks by voice, Gemini answers aloud, every screen shows the caption |
| F5 | Camera handoff: one active camera. "Guests can show their camera" switch, request with Allow/Not now, Take back | build | Host turns their camera off, the guest taps Show, Gemini now sees the guest's camera |
| F6 | Pin a page: the host captures a sharp still that everyone sees and Gemini reads closely | build | The pinned chip shows on all screens |
| F7 | End and save: the transcript with speakers, pinned pages and cards saved on the host phone and shown in Recent | build | Reload the app and the session is in Recent and opens |
| F8 | Form fill: capture a form, Gemini fills it from My details, asks missing fields by voice, review in blue text, PDF, share sheet / Keep in Sarvam | build | A sample KYC form becomes a PDF with values at the right boxes. Signature left blank |
| F9 | Ask Sarvam on Home and inside documents: any language, agentic cards (reminder, calendar, open session), memory recall | build | "What did Arun say about the bill?" answers from the saved session with a source card |
| F10 | Reminders: Add from the call, Ask or a form, then Home "Today and tomorrow" + Notifications panel + .ics Add to Calendar | build | Added reminder shows in both places and survives a reload |
| F11 | Connect Google: Gmail read-only (Testing mode), Calendar events; Drive via the Picker only | build (evening) | Gmail bills become 3 suggestions on Home. Disconnect deletes them |
| F12 | Private card in the call: "Only you can see this", Share with everyone / Keep private, 5-second Undo before Gemini hears it | build (evening) | A guest never sees or hears the Gmail fact until Share |
| F13 | Plans: Free = Auto + Basic. Top models locked as "Sarvam Plus, coming soon". No payments | build (UI only) | Shown on Connect Google and in the Ask model picker |
| N1 | Guest private cards with their own Google | next | |
| N2 | Apple Reminders/Calendar native writes (Capacitor + EventKit) | next | |
| N3 | Background Gmail with the app closed (server refresh tokens, Pub/Sub watch) | next | |
| N4 | Google Docs/Sheets export, Word export | next | |
| N5 | PII blur on frames, study-group mode, payments | next | |

## Privacy promise (exact wording for the UI and the pitch)
"Your history stays on this phone. Live calls and AI answers use Google Cloud while they're on. Nothing from your email, files or memory is shown to others until you tap Share. Nothing is recorded in the cloud."

## Rules the code must enforce
1. Memory, sessions, chats, My details and Gmail extracts live only in IndexedDB on the device.
2. The Live session (room layer) receives: the active camera frames, the mixed voices, pinned pages, and the text of shared cards. Nothing else.
3. Private lookups (memory, Gmail, Drive, My details) run on the owner's phone through the regular Ask endpoint. Results show as private cards only on that phone.
4. Share sends the card to the room data channel and, after a 5-second Undo, to the Live session as `"[Vignesh shared from Gmail]: …"`.
5. No reminder, calendar event, email, file or PDF leaves the phone without a tap.
6. Signature, thumb impression and photo boxes on forms are never filled. ID numbers are never spoken, and are masked on screen until tapped.
7. Email and document text are data, never instructions.

## Edge cases to handle tomorrow
| Area | Case | Handling |
| --- | --- | --- |
| Camera | Permission denied, or a laptop with no camera | Offer Choose files and Try a sample |
| Camera | Blurry or dark page | Retake on the thumbnail. Gemini asks for a retake |
| Mic | Denied, or noisy | Type box. Mute. Raise hand |
| iPhone | Audio won't play until a tap | The Start / Join tap unlocks a single AudioContext |
| iPhone | Screen locks during a call | Room shows "Host paused", ends after 5 min. Host can rejoin |
| Live | Disconnect, or a going-away notice (~10 min) | Session resumption with the stored handle. "Reconnecting" pill. Transcript kept locally |
| Live | Audio+video session stops at ~2 min without compression | Context window compression is on. Frames 1 fps, 768 px |
| Language | Tanglish/Hinglish | Answer in the asker's language and script |
| Room | Two speakers at once | Gemini's voice activity detection. Raise hand. Host mute |
| Room | Late join | Gets pinned pages + the last 20 caption lines |
| Room | Old/forwarded link | 30-min invite expiry, max 4 people, host can remove a guest |
| Room | 2 guests tap Show | First wins, second waits |
| Room | Guest leaves while showing | Camera returns to the host |
| Accuracy | Wrong date/amount | Answers cite the page. AI note. Dates confirmed in CalendarEditSheet |
| Forms | Box offset, character grids, checkboxes, multi-page, regional language, unknown value, someone else's form | See 04_ARCHITECTURE.md, form fill |
| Google | Denied/partial scopes, token expiry (1 h), Testing mode 7-day consent, wrong account | Feature off with a one-line prompt. Silent re-auth on 401. Account email on each card |
| Storage | Save results off, private mode, quota | "Not saved on this phone" at End. Never silent |
| Quota | Gemini 429 | Existing failover + busy message |
