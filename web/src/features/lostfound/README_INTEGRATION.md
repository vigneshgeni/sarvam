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
5. Share a demo phone if you want, mark returned, copy the UPI thank-you link (opens in a real UPI app on a phone; here it copies).

## P5 seam (human / later agent)

- `web/src/App.tsx`: segmented tab Explain | Lost & Found rendering `<LostFoundHome />`.
- `web/.env.example`: `VITE_LF_API_URL`, `VITE_FIREBASE_*`.
- `web/package.json`: add `firebase` (auth only).
- Service worker: never cache `/lf/*`.

Language is read from `localStorage` key `sarvam.lang` (same as Explain).

## Firebase / gcloud (human)

See `lostfound-api/README.md`. Local demo **does not** need gcloud, Firestore, or Firebase Auth.
