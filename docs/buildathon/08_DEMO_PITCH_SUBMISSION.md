# Demo, pitch and submission

## 60-second pitch (mentors, intro, Saturday evaluation)
> Sarvam already explains any Indian paperwork in 9 languages. Today I'm adding **Live Relay**: a video call where Gemini Live is one of the people in it. I point my phone at a bill or a form. My family joins from a link on their own phones, with no app. They see what my camera sees, and we all talk to Gemini together. Amma asks in Tamil, my brother asks in English, and Sarvam answers each of them. If something from my email matters, it shows only on my phone until I tap Share. It can also fill a form from a scan and hand me a PDF to send on WhatsApp. When the call ends, it's saved on my phone, and tomorrow I can ask Sarvam "what did we decide?" Gemini Live is one person and one AI. Live Relay is a family deciding together.

## 3-minute demo (Saturday)
1. **Home (10 s):** the reminder card, the Ask bar and the Live Relay card.
2. **Start Live Relay on the iPhone (20 s):** point at the printed bill and ask in Tamil "why is it so high?". Gemini answers aloud.
3. **Invite (30 s):** the QR is on the projector or your laptop. A judge joins from their phone and asks in English "when is it due?". Both phones show the caption, and Gemini answers aloud.
4. **Private card (30 s):** the BESCOM email card shows only on your phone. Show the judge their screen is empty. Tap Share; now it appears for them and Gemini mentions it.
5. **Camera handoff (20 s):** turn your camera off. The judge taps Show and points their phone at something. Gemini describes it.
6. **Form fill (40 s):** scan the sample form. It fills 6 boxes and asks "nominee?". Answer by voice, Review, PDF, and open the WhatsApp share sheet.
7. **End and recall (20 s):** End call, then Home, then Ask "what did the judge ask?". The answer comes with a source card.
8. **One slide (10 s):** what's next (native Apple Reminders, background Gmail, guest private cards, study groups) and the privacy line.

Backup: a 90-second screen recording made at the 6 PM freeze, in case the venue Wi-Fi fails.

## Deck (6 slides; reuse the Slides deck "Agentic Sarvam Voice" and update it)
1. The problem: Indian families decide about paperwork together, across cities and languages.
2. Live Relay: the video-call moment (screenshot of the host + guest).
3. Privacy: private until you Share (screenshot of the private card).
4. Form fill: scan to PDF to WhatsApp.
5. How it works: one Live session on the host's phone, WebRTC room, sidecar cards, on-device memory (Vertex AI, Firebase, Cloud Run).
6. What's next and the ask.

## Submission checklist (portal opens 11:00 PM Fri, closes 9:00 AM Sat)
- [ ] Preview URL works on two phones (one on mobile data), and the guest QR works
- [ ] GitHub branch `feat/buildathon-live-relay` pushed. The README section "What I built at the buildathon" lists the commit range for 20 Nov
- [ ] Demo video, about 2 minutes, uploaded
- [ ] Deck link
- [ ] Any other fields the mentors named at 11:30
- [ ] Confirmation email or screenshot saved
- [ ] Credits: check the Cloud billing page so nothing runs past the coupon (scale min instances to 0 after Saturday)
