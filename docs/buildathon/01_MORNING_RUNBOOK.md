# Runbook: Fri 20 Nov, 8 AM, to Sat 21 Nov, 9 AM

Official agenda (from the Hack2skill email):
- Registration 8:00 to 9:00
- Intro 9:00 to 9:30
- Build starts 10:00
- 1st mentor round 11:30
- Lunch 1:30 to 2:30
- Mid-day check-in 4:00
- Day 1 wrap-up 6:00 PM
- Submission opens 11:00 PM and **closes 9:00 AM Saturday, with no extension**
- Saturday: mentor evaluation 10:00 to 1:00, showcase 2:00 to 5:30, results 6:00

**Use one Google account for everything** (Cloud credits, Firebase, Gmail test user). You have two: vigneshwaran638@gmail.com, where the event QR came, and vignesh.vidhy25@gmail.com, which Antigravity is signed in with. Pick one and stay with it.

---

## 7:00 to 7:45, at home
- [ ] QR code on your phone (the "RSVP / Entry QR" email), and a government ID
- [ ] Laptop, phone and charger. A second phone for testing as a guest, if you can borrow one
- [ ] Two made-up documents, printed or on screen: an electricity bill with a due date, and a simple form (KYC or school form). Don't use real IDs.
- [ ] Earphones (to test the guest without echo)

## 8:00 to 9:00, registration (be in by 8:45)
1. Scan your QR at the desk.
2. Ask for **Antigravity credits**. You're solo, so you count as team leader. Skip this if you already have Antigravity Pro.
3. Redeem the **Google Cloud event credits** from the agenda email ("Get your credits"). The coupon lasts 24 hours from redemption and needs a billing account with a card, one coupon per billing account. Doing it now covers you through submission.
4. Cloud setup (about 20 min, at your seat):
    - Create a Google Cloud project, `sarvam-buildathon`, and link it to the billing account with the credits.
    - Enable these APIs: **Vertex AI API**, **Cloud Run**, **Cloud Build**, **Artifact Registry**, **Secret Manager**, **Gmail API**, **Google Calendar API**.
    - Open the Firebase console and add Firebase to that same project.
    - Enable these Firebase services:
        - **Authentication**, with the Google and Anonymous providers
        - **Firestore**, in Native mode, location `asia-south1`
        - **Hosting**
        - **AI Logic**: open it in the Firebase console and pick the Vertex AI (Agent Platform) provider
    - Register a web app and copy the config into `web/.env.relay.local`. The variable names are in `04_ARCHITECTURE.md`.
    - Open Google Auth Platform (the OAuth consent screen): set it to External, Testing, add your Gmail as a **test user**, and add the scopes `gmail.readonly` and `calendar.events`.
    - Open Vertex AI Studio in the Cloud Console and try a Live audio conversation in Tamil. Note the exact Live model name it offers (expected: `gemini-live-2.5-flash-native-audio`) and a supported region (try `us-central1` first).
5. Sign up for **LiveKit Cloud** (free tier) and create a project. Keep the URL, API key and secret for `api/.env.local`. Don't commit them. If the organisers say third-party SDKs aren't allowed, skip this and use the peer-to-peer fallback in `04_ARCHITECTURE.md`.

## 9:00 to 9:30, intro
Listen for and write down: the judging criteria, the submission fields (repo link, live link, video, deck?), whether existing products are allowed, and the Wi-Fi rules.

## 9:30 to 10:00, talk to a mentor or organiser (2 minutes)

**Say this:**
> "I'm Vignesh, solo. Sarvam is my existing app that explains Indian paperwork in 9 languages. Today I'm adding **Live Relay**: a video call where Gemini Live is one of the people in it. I point my camera at a bill or form, my family joins from a link on their own phones, everyone talks in their own language, and Gemini answers all of us. It can also fill a form from a scan and give me a PDF to share. Private things from my email or memory never show to others unless I tap Share."

**Ask these 5 questions:**
1. Does a new capability inside an existing product count as "net new" for judging?
2. Can I use a third-party video SDK like LiveKit, or should it be Google-only?
3. What exactly does the submission need: live link, repo, video, deck? Any length limits?
4. Can judges join the demo from their own phones on the venue Wi-Fi during evaluation?
5. Are the Gemini Live API on Vertex and Firebase AI Logic fine to use with the event credits?

Write the answers in your notes. If anything changes the plan, send it to me.

## 10:00 onwards, build (one phase at a time from `06_BUILD_PHASES.md`)

| Time | Phase | Show at the checkpoint |
| --- | --- | --- |
| 10:00 to 10:30 | **P0** Setup, env, Live spike (decides Option A or B) | Live answers a Tamil question in the browser |
| 10:30 to 11:30 | **P1** Solo Live: capture pages, scan view, Gemini Live voice, captions | 11:30 mentor round: show P1 on your iPhone |
| 11:45 to 1:30 | **P2** Video room: invite (QR, link, code), guest joins, host camera to everyone | Guest phone sees your camera live |
| 2:30 to 4:00 | **P3** Gemini in the room: voice mix, captions with names, camera handoff, End and save | 4:00 check-in: two-phone demo |
| 4:00 to 6:00 | **P4** Form fill to PDF, share sheet, Keep in Sarvam | 6:00 wrap-up: freeze, deploy preview, record a 90-second backup video |
| 6:30 to 8:30 (home) | **P5** Ask Sarvam on Home + reminders + notifications | |
| 8:30 to 10:00 | **P6** Connect Google (read-only Gmail) + private card + Share in the call | |
| 10:00 to 11:00 | **P7** Tests, README section, deck, demo video | |
| **11:00 PM** | **Submit** as soon as the portal opens. Save the confirmation | |

**If you're late, cut in this order:**
1. Drive and the Google Doc/Word outputs
2. The in-call Gmail card (keep Gmail reminders on Home)
3. P5 reminders (keep Ask recall)
4. Open mic for guests (keep hold-to-talk)
5. Multi-page capture (keep one page)

**Never cut:** Gemini Live on the host camera, a guest seeing it and hearing Gemini, the saved session, and form fill to PDF.

---

## How to test on your iPhone (the host)

Camera and mic in Safari need **HTTPS**. You have two ways to get it.

**A. Preview deploy (most reliable; do it after every phase)**
```
cd ~/Projects/sarvam/web
npm run build -- --mode relay
firebase hosting:channel:deploy relay --project sarvam-buildathon --expires 7d
```
Open the `https://sarvam-buildathon--relay-xxxx.web.app` link it prints on your iPhone.

**B. Live reload over the LAN (fast loops)**
- Antigravity adds `@vitejs/plugin-basic-ssl` in P0. Then run `npm run dev -- --host --mode relay`.
- On the iPhone, open `https://<your-Mac-IP>:5173` and accept the certificate warning.
- If the venue Wi-Fi blocks phone-to-laptop traffic, turn on your iPhone hotspot, join it from the Mac, and use the Mac's hotspot IP.

**Install as a PWA:** in Safari tap Share, then Add to Home Screen. Open Sarvam from the icon, allow Camera and Microphone, and tap once to start (iPhone needs a tap before audio plays).

**Host from the iPhone, guest on the laptop or a second phone:**
1. On the iPhone, open Live Relay and tap Invite. The QR and code `7K2Q` show.
2. On the laptop, open the link or scan the QR with the second phone. Enter a name and language, then Join.
3. Use earphones on one device so the audio doesn't echo between two devices in the same room.

**If something breaks:** screenshot it, or copy the console error (on the Mac: Safari > Develop > [your iPhone] > the page), and send it to me. I'll write the fix prompt.
