# Sarvam Live Relay — Demo Script & Pitch

## 60-Second Pitch

Every Indian family has a WhatsApp group full of blurry photos of hospital bills, bank notices, electricity bills, and government forms—and an older parent trying to understand them alone.

Today we built **Sarvam Live Relay**, powered by **Gemini Live** and **Vertex AI**.

1. **Point and talk**: Open Live Relay, point your phone camera at any bill, notice, or error screen, and talk naturally in Tamil, Hindi, or English. A local noise gate and echo ducker keep the conversation steady even in a noisy room.
2. **Bring family into the call with one link**: Tap *Invite family*. Amma joins on her phone via a 4-letter code or WhatsApp link—no app, no login. Gemini hears everyone in the room, knows who is speaking, answers aloud to everyone in their own language with live translated captions, and lets Amma hand over her camera when she needs to show a page.
3. **Fill forms and remember everything privately**: Tap *Fill a form* to auto-fill scanned paper forms into a printable PDF—always leaving the signature blank to sign by hand—and later ask *Ask Sarvam* on Home in Tanglish ("Arun bill pathi enna sonnaan?") to recall past calls and set reminders only when you tap *Add*. Everything stays on your device.

---

## 3-Minute Live Demo Script (Exact Taps)

### Setup before stepping on stage
- **Phone A (Host, iPhone Safari)**: Open the `relay` preview URL; unmute ring/silent switch; have a sample bill + printed KYC form on the table.
- **Phone B (Guest, Android/iPhone/Laptop)**: Ready on the browser address bar (or WhatsApp Web) to open `/r/<CODE>`.
- Optional: open `?seed=ask` once on Phone A beforehand if you want an extra historical call ready in Ask Sarvam.

### 0:00 – 0:40 | Live Video Mode + Scanned Pages (Phone A)
1. On Home, tap **Live Relay** -> show the teal intro card -> tap **Start scanning**.
2. Point Phone A at the gas/electricity bill. Wait for the `Live` green dot (~1 s).
3. Speak aloud in English or Tamil: *"What is the total amount and due date on this bill?"*
4. Let Gemini speak the short 2-sentence answer aloud. Show clean captions (no emoji or noise lines).
5. Tap **Freeze and ask** -> show `"Page 1 added"` toast -> tap the `1 pinned` chip -> briefly pinch-zoom in `PageViewer` -> tap **X** to close.

### 0:40 – 1:45 | Family Video Room + Gemini Hears Everyone + Camera Handoff (Phone A + Phone B)
6. On Phone A, tap **Invite family** -> show QR code + 4-letter code boxes -> toggle ON **Guests can show their camera** -> tap **Hide** so the compact `"Room XXXX · 1 in the room"` pill stays out of the way.
7. On Phone B, open `<preview-url>/r/<CODE>`, enter **Amma**, pick **தமிழ்**, tap **Join with mic on**.
8. Point out the privacy banner on Phone A: *"Everyone in the room can see the camera"*.
9. On Phone B, Amma asks aloud in Tamil: *"இது எப்போது கட்ட வேண்டும்?"* (When do we have to pay this?)
10. Show Gemini answering aloud on **both** phones with speaker-labelled captions on both screens.
11. On Phone B, tap **Show my camera** -> on Phone A, tap **Allow**.
12. Point Phone B at the second document -> show `"Amma's camera"` chip on Phone A and Gemini reacting to Phone B's view -> tap **Take back camera** (optional) -> tap **End** on Phone A.
13. Point out Phone B immediately showing **Room ended**, and Phone A returning to Home with the new **Live Relay** badge under Recent -> tap it briefly to show the saved read-only transcript and pinned page.

### 1:45 – 2:30 | Form Fill to PDF (Phone A)
14. From Home (or the **Fill a form** chip on Live camera), tap **Fill a form** -> select the sample KYC form (or captured form photo).
15. Show detected fields auto-filled from on-device **My details**, with **Applicant Signature** explicitly marked *Sign by hand* (never forged).
16. Answer the missing Nominee field -> tap **Review & Save PDF** -> show the generated PDF preview and tap **Keep in Sarvam** (appears in Recent as *Draft · sign by hand*).

### 2:30 – 3:00 | Ask Sarvam on Home + Privacy Close (Phone A)
17. On Home, tap the **Ask Sarvam** bar -> type or ask *"What did we discuss about the bill?"* (or *"Arun bill pathi enna sonnaan?"*).
18. Show the grounded answer with the tappable source card back to the saved session.
19. Ask *"Remind me two days before"* -> show the explicit **Add / Not now** approval card -> tap **Add** -> show it appearing on Home under Reminders.
20. Close: *"One family call, any Indian language, private on your phone."*

---

## Venue Network Backup Plan

- **If venue Wi-Fi blocks WebRTC UDP or drops**:
  1. Switch Phone A & Phone B to a **5G mobile hotspot** (LiveKit Cloud falls back to TURN/TLS over 443 automatically, and hotspot avoids corporate/venue UDP firewalls).
  2. If the venue is very loud and open-mic VAD struggles: tap the **VAD / Hold** button on Phone A to switch to **Hold to Talk** (guaranteed zero background triggers).
  3. If Gemini Live WebSocket stalls on congested venue Wi-Fi: the built-in watchdog nudges at 6 s and auto-reconnects with session resumption at 12 s; or type the question directly in the `LiveSheet` text box.
  4. If internet completely drops during judging: **Form Fill** (with sample KYC form + `My details` + client-side `pdf-lib` PDF generation), **Ask Sarvam** on-device memory search, and saved **Live Relay** transcripts in Recent still open cleanly on-device, and the recorded demo video + saved Playwright traces (`docs/buildathon/shots/trace/`) serve as immediate proof.
