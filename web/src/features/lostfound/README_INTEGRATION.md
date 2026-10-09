# Lost & Found — integration (P5 only)

Do **not** wire this into `App.tsx` until phase P5, after rebasing `feat/lostfound` on `main`.

Until then, run the standalone preview (phone chrome, Sarvam colours from the prototype):

```bash
# terminal 1
cd lostfound-api
PYTHONPATH=.deps:. python3 -m uvicorn main:app --host 127.0.0.1 --port 8100

# terminal 2
cd web
npx vite --config src/features/lostfound/vite.config.ts src/features/lostfound
```

Open http://127.0.0.1:43123

## 2-minute judge path

1. Tap **Continue as guest (demo)**.
2. Tap **Try the 2-minute demo** (or: I lost something → Passport → test number **Z1234567** → Adyar, Chennai, yesterday).
3. See the **strong match**, answer “maroon plastic cover” and “Chennai”.
4. Wait ~8 seconds for the labelled **Demo finder** to approve.
5. Share a demo phone if you want, mark returned. On the thank-you card: **Open UPI app** (the `upi://` link is the button href only) or **Copy link**. Amount chips and the demo-finder label stay on the card.

## P5 seam (human / later agent)

- `web/src/App.tsx`: segmented tab Explain | Lost & Found rendering `<LostFoundHome />`.
- `web/.env.example`: `VITE_LF_API_URL`, `VITE_FIREBASE_*`.
- `web/package.json`: add `firebase` (auth only).
- Service worker: never cache `/lf/*`.

Language is read from `localStorage` key `sarvam.lang` (same as Explain).

## Demo mode (web)

The web app reads `demoMode` from `GET /lf/health` (API flag `LF_DEMO_MODE`). No `VITE_` variable is required. When `demoMode` is true, only **Continue as guest (demo)** is shown, with a **Demo** label next to the heading. When it is false and Firebase is not configured, the UI shows “Sign-in is not available right now”.

## Browser back (test script)

Walk this on a phone (iOS swipe-back or Android hardware back). History entries use only `{ lf: { depth, screenId } }`.

1. Lost & Found root → **I lost something** → pick a category → **Continue** to step 2 → back → step 1 → back → root.
2. Root → open a feed card → **This might be mine** (claim sheet) → back (sheet closes, card remains) → back (feed / root) → back (browser default; leaves Lost & Found’s own history, does not trap).
3. Mid-flow, reload the page: you return to the Lost & Found root, not a blank overlay.

Bottom sheets (claim, report, share, safety tips, privacy) close on back before any screen change. At the Lost & Found root, back is not intercepted.

## Firebase / gcloud (human)

See `lostfound-api/README.md`. Local demo **does not** need gcloud, Firestore, or Firebase Auth.
