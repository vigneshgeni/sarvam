# UI spec (matches `ui-reference/*.dc.html`)

The reference files are approved designs. Each is a 390×844 phone screen with inline styles, and the script at the bottom of each file shows its states. Re-create them in React + Tailwind and match the spacing, sizes, copy and colours closely. Use real camera video wherever the reference shows a drawn scene, and real people tiles (video, or an initial avatar when the camera is off) wherever it shows drawn faces.

## Tokens
| Token | Value | Use |
| --- | --- | --- |
| ink | `#1B1B1B` | text, 2 px outlines on cards and buttons |
| bg | `#F5F4F2` | app background |
| coral | `#C96846` | brand dot, badges, End and save |
| teal | `#214D47` | primary buttons (Join, Share with everyone), switches on |
| mustard | `#E3B660` | Invite, Add reminder, active chips, Gemini orb |
| paleTeal | `#D3E5E0` | privacy notes, success chips |
| sand | `#EAE7E0` | secondary chips |
| callRed | `#E5533D` | live dot, End call / Leave |
| dark sheet | `#1B1B1B` with `rgba(255,255,255,.08)` cards | Gemini Live sheet |
| radius | cards 18 to 28 px, pills 22 to 30 px | |
| type | DM Sans 13 to 21 px, Fraunces for big headings (30 to 37 px), Noto Sans Tamil/Devanagari for Indic | |

## Screens and states

### 1. Home (`VoiceHome.dc.html`). Changes to the existing `HomeScreen.tsx`
Top to bottom:
1. Header: "Sarvam." | bell (badge, opens Notifications) | Ask icon | accessibility badge
2. Language chips
3. **Hero card, collapsible** (chevron; `grid-template-rows` 1fr↔0fr animation)
4. **Ask Sarvam bar**: white pill, sparkle icon, "Ask Sarvam" / "Remembers your documents and Live Relay chats", teal mic circle. Opens Ask.
5. **Today and tomorrow** card: Gmail icon top right (opens Connect Google), rows with time | colour bar | title + source | Add or Added
6. **Live Relay** card (teal, full width, mustard pulse icon, "Beta" tag): "Scan or show anything, talk with Gemini Live and invite family." Opens the camera.
7. Choose files (existing). **Take photo is removed**, because Live Relay replaces it.
8. AI note (existing)
9. Try a sample (existing 2-column grid)
10. Recent on this phone (existing). Relay sessions and form drafts appear here too.
11. Private by design + Save results on this phone switch (existing)

### 2. Live Relay camera (`LiveScanner.dc.html`)
- Full-screen camera. Mustard page frame. Hint pill: "Fit the page in the frame", or "N pages · add more or Proceed"
- Bottom bar:
    - Left: before any capture, a mic toggle. After, a thumbnail stack with a coral count badge, where each new capture animates in
    - Centre: shutter, with a flash on capture
    - Right: End before any capture, Proceed after
- Pill once there are pages: "Gemini is reading in the background"
- Extra in the build: a "Fill a form" chip appears when the sidecar detects a form, and opens screen 9

### 3. Scanned pages + Gemini Live, solo (`LiveCaptured.dc.html`)
- Header: back | title + "N pages · scanned" | Original/தமிழ் toggle
- Page area (400 px): white scanned page, previous/next buttons, dots. "Invite family" mustard pill at the top right (starts the room, screen 4)
- Dark bottom sheet, collapsed 380 px and expanded 640 px via its handle:
    - wave + "Gemini Live · listening"
    - chat (newest at the bottom)
    - memory card ("From your memory") and reminder card with Apple Reminders/Only in Sarvam (web: Add reminder / Add to Calendar)
    - controls: mic, keyboard, End and save

### 4. Video call, host (`RelayRoom.dc.html`)
- Full-screen **active camera** video
- Top:
    - Pill "Live · Room 7K2Q · 12:40" with a blinking red dot
    - Mustard **Invite** button
- Tile row under the header, 84×100 tiles: **Gemini** (orb, glows while speaking), then one tile per person (video, or an avatar when the camera is off). Each tile has a language tag at the top left and the name plus a muted icon at the bottom left
- Chips at y≈180:
    - "Page 1 pinned · Everyone sees it"
    - "Showing Arun's camera · Take back"
    - Camera request card: "Arun wants to show his camera" with Allow / Not now
- Bottom stack above the controls:
    - **Private card** (dashed teal border, "Only you can see this", Gmail icon, text, **Share with everyone** / **Keep private**). On share, it shows a 5-second "Sharing… Undo" state
    - Reminder suggestion card (Add reminder / Add to Calendar). Once added: "Reminder added · on Home and in Notifications"
    - Captions panel: "Live captions", or "Transcript · saved on your phone" when expanded. Speaker names are coloured: Gemini mustard, guests pale teal or pale coral. Shared lines are tagged "(shared by you, from Gmail)"
- Controls: mic | camera on/off | **Pin** (big white ring) | transcript toggle | red End call
- Invite sheet:
    - QR, the code in large letters, "Expires in 30 min · up to 3 people"
    - **Guests can show their camera** switch
    - Share on WhatsApp, Copy link
    - Privacy note: "Guests see your camera and hear the room and Gemini until you end it. Anything from your Gmail, Drive or memory stays private until you tap Share. Nothing is recorded in the cloud."

### 5. Guest phone (`RelayGuest.dc.html`)
- Join step:
    - "Sarvam." heading, then "Vignesh invited you to a Live Relay call"
    - Document card, Your name, language chips ("Answers for you in")
    - **Join with mic on, camera off**
    - Note: "No app or sign-up…"
- In the call: the host's video full screen, title "Vignesh's camera" (or "Your camera" while showing), the tile row, the "Shared by Vignesh" card with Got it, and captions in the guest's language ("Amma (from Tamil): …")
- Controls: mic | **Show** camera (→ Waiting → Stop) | raise hand | red Leave
- Left screen: "You left the call · Nothing from this call is kept on your phone or in the cloud." with Rejoin

### 6. Session saved (`LiveSaved.dc.html`)
The existing saved-session design. Use the relay session title, participants, captions with names, pinned pages and cards. Actions: Open transcript, Ask about this, Share summary (redacted).

### 7. Notifications (`VoiceNotifications.dc.html`)
The existing panel: reminders from calls, forms and Gmail. In-app banner toast when a reminder is added.

### 8. Connect Google + plan (`GoogleConnect.dc.html`)
- Intro:
    - Title "Let Sarvam keep an eye on your bills and tickets"
    - 3 service rows with switches: Gmail (read-only), Drive (only files you pick), Calendar (adds only after you tap)
    - "What Sarvam will never do" box
    - **Continue with Google**
    - "Google shows its own permission screen next."
- Connected:
    - Account card
    - Per-service status
    - "See 3 new reminders from Gmail"
    - "Ask before sharing in calls · Always on" (locked)
    - **Disconnect Google and delete what Sarvam found**
- Your plan: Free. Auto and Basic are Included. Top models are locked as "Sarvam Plus". Note: "Nothing is charged today."

### 9. Fill a form (`FormFill.dc.html`)
- Header: "KYC update form", with progress "6 of 9 filled · 2 need you" or "8 of 9 filled · sign by hand"
- Scanned form with values in **blue handwriting-style text** (Caveat font, `#2B4DB0`). Missing boxes are tinted coral, the signature box mustard
- Dark sheet: Gemini Live conversation, plus chips: "6 from your details", "2 need you", "Signature: by hand"
- Buttons: **Answer by voice**, then **Review and save**. A **Later** button saves a draft
- Save sheet:
    - Format: **PDF** (looks like the paper form), Word (typed), Google Doc (needs Google)
    - WhatsApp, Email, Save to Files, **Keep in Sarvam**
    - Note: "Kept forms stay on this phone under Recent, marked 'Draft · sign by hand'. Your ID numbers are never read aloud in a call."
- First time only: a **My details** setup sheet (name, DOB, mobile, address, occupation, nominee). ID numbers are optional, with the switch "Save ID numbers on this phone".

### 10. Ask Sarvam (`Ask.dc.html`). Existing screen, keep it
- Answers in the asker's language and script
- Tool chips under answers: Memory, Documents, Calendar, Reminder, Gmail
- Approval cards for every action
- Model picker: Free sees Auto + Basic, Plus is locked

## Motion and accessibility
- Only these animations: page drop into the stack, shutter flash, Gemini orb pulse, card fade-up. All of them are off under `prefers-reduced-motion`.
- Captions panel: `aria-live="polite"`. Private card: `role="region" aria-label="Private to you"`.
