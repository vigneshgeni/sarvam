# Phase notes (feat/lostfound)

## P0 — Setup — GATE PASSED
- Branch `feat/lostfound` from latest `main` (0a23716). Worktree only; `main` untouched.
- `GET /lf/health` on port **8100** returns ok with `demoMode=true`, `aadhaarLite=false`.
- `cd web && npm run build` passes. `LostFoundHome` is the feature entry; `App.tsx` not edited (P5 seam).

## P1 — Pure logic — GATE PASSED
- 60 pytest tests: ids, pii, geo, matching (12+ pairs), serializer leak-fuzz, crypto, extract Aadhaar reduction, demo e2e (strong match, claim, approve, share, return, delete), no-log of ID/phone, card-number reject.

## Demo slice a judge can run (~2 min)
Standalone UI (prototype colours, type, hero buttons, sheets) at port 43123, talking to the API. Guest demo, seeded found posts, TEST passport **Z1234567**, Demo finder auto-approve after ~8s, UPI copy after return. No money handled. No ID numbers stored.

## Not done (later phases)
- P2 Firestore + Firebase Auth (blocked on human gcloud/Firebase). In-memory store + demo tokens used.
- P3/P4 polish, Tamil/Hindi already present for core strings; more screens still thin.
- P5 App.tsx tab seam, firebase package, SW `/lf/*` no-cache, Cloud Run deploy notes. **Do not rebase/edit App.tsx until P5.**
- Gemini `/lf/extract` falls back locally if ADC is missing.

## Could not test
- UPI app chooser and share sheet on a real iPhone.
- Google sign-in (Firebase not configured).
- gcloud/Firestore against `sarvam-510715` (no credentials in this environment; not run).
