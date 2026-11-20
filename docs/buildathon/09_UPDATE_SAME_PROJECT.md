# Update, 20 Nov morning: use the existing Cloud project (overrides 01, 02 and 04 where they differ)

**Decision:** build in the existing project `sarvam-510715`. It already has billing, Vertex AI, Cloud Run and Hosting. We keep production safe with these rules:

1. **API:** deploy a NEW Cloud Run service `sarvam-relay-api` from the same `api/` folder. Never redeploy or change `sarvam-api`.
2. **Web:** deploy only to a Hosting **preview channel**: `firebase hosting:channel:deploy relay --project sarvam-510715 --expires 7d`. Never `firebase deploy` and never the live channel.
3. **No Firestore rule changes.** Skip the `relayRooms` Firestore collection. Room state (code, expiry, members, activeCamera, allowGuestCamera) lives in:
    - the relay API's memory (Cloud Run `--min-instances 1 --max-instances 1` for the demo), mirrored into LiveKit room metadata,
    - room events over the LiveKit data channel.
   Don't create `firestore.relay.rules` or `firebase.relay.json`.
4. **Firebase AI Logic:** enable it in the `sarvam-510715` Firebase console with the Vertex AI provider. Use a **named** Firebase app `'relay'` initialised from the existing web config (`VITE_RELAY_FB_*` = the same values as prod). Don't touch the existing Firebase initialisation.
5. **Anonymous Auth:** only needed if the existing app doesn't use Firebase Auth. Turning on the Anonymous provider doesn't affect existing users. If unsure, ask before enabling it.
6. **Gmail (evening, P6):** before adding Gmail scopes, check whether the production app already uses Google sign-in.
    - If it does, **don't** change the existing OAuth consent screen, because switching it to Testing would lock out real users. Instead, make a separate small Cloud project just for the Gmail OAuth client, or cut P6 to "pitch only".
    - If production doesn't use Google sign-in, use the existing project in Testing mode.
7. **Cost guard:** in Billing, set a budget alert (for example ₹2,000) on `sarvam-510715` today. Check Billing > Credits to see whether the event credits are still active. The session said they were valid only until about midnight on 19 Nov.

**Paste this to Antigravity once, before P0:**
> Read docs/buildathon/09_UPDATE_SAME_PROJECT.md. It overrides 02_ANTIGRAVITY_RULES.md and 04_ARCHITECTURE.md wherever they mention the "sarvam-buildathon" project, Firestore relayRooms, firestore.relay.rules or firebase.relay.json. Confirm the 7 rules back to me in one line each, then start P0.
