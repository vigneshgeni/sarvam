# Sarvam Live Relay — Final Deploy & Submission Guide (Run by Hand Only)

Per `docs/buildathon/09_UPDATE_SAME_PROJECT.md`:
- Cloud project: `sarvam-510715`
- Cloud Run service: **NEW** service `sarvam-relay-api` in `asia-south1` (**NEVER** touch `sarvam-api`)
- Firebase Hosting: **preview channel** `relay` only (**NEVER** run `firebase deploy` without `hosting:channel:deploy`)
- No Firestore rule changes, no `firebase.json` changes.

---

## Local Dev Setup (Two Terminals)

```bash
# Terminal 1: FastAPI with LiveKit Cloud credentials from api/.env.relay.local
cd ~/Projects/sarvam/api
set -a && source .env.relay.local && set +a
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Web in relay mode (Vite proxies /api/* to localhost:8000)
cd ~/Projects/sarvam/web
VITE_API_URL=http://127.0.0.1:8000 npm run dev -- --mode relay --host
```

---

## Step 1: Login & Verify Project

```bash
gcloud auth login
gcloud config set project sarvam-510715
gcloud config get-value project
gcloud services enable secretmanager.googleapis.com run.googleapis.com --project sarvam-510715
```

## Step 2: Store LiveKit Secrets in Secret Manager

Reads values from your local gitignored `api/.env.relay.local` (never commit or echo them):

```bash
source ~/Projects/sarvam/api/.env.relay.local

for NAME in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET; do
  gcloud secrets describe "$NAME" --project sarvam-510715 >/dev/null 2>&1 || \
    gcloud secrets create "$NAME" --replication-policy=automatic --project sarvam-510715
done

printf '%s' "$LIVEKIT_URL"        | gcloud secrets versions add LIVEKIT_URL        --data-file=- --project sarvam-510715
printf '%s' "$LIVEKIT_API_KEY"    | gcloud secrets versions add LIVEKIT_API_KEY    --data-file=- --project sarvam-510715
printf '%s' "$LIVEKIT_API_SECRET" | gcloud secrets versions add LIVEKIT_API_SECRET --data-file=- --project sarvam-510715

PROJECT_NUM=$(gcloud projects describe sarvam-510715 --format='value(projectNumber)')
SA="${PROJECT_NUM}-compute@developer.gserviceaccount.com"
for NAME in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET; do
  gcloud secrets add-iam-policy-binding "$NAME" \
    --project sarvam-510715 \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

## Step 3: Deploy NEW Cloud Run Service `sarvam-relay-api`

```bash
cd ~/Projects/sarvam
gcloud run deploy sarvam-relay-api \
  --source api \
  --region asia-south1 \
  --project sarvam-510715 \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 1 \
  --set-secrets "LIVEKIT_URL=LIVEKIT_URL:latest,LIVEKIT_API_KEY=LIVEKIT_API_KEY:latest,LIVEKIT_API_SECRET=LIVEKIT_API_SECRET:latest"
```

## Step 4: Read the `sarvam-relay-api` URL & Health Check

```bash
RELAY_API_URL=$(gcloud run services describe sarvam-relay-api \
  --region asia-south1 \
  --project sarvam-510715 \
  --format='value(status.url)')
echo "RELAY_API_URL=$RELAY_API_URL"
curl -s "${RELAY_API_URL}/api/relay/health"
```

## Step 5: Build Web & Deploy Firebase Preview Channel `relay`

```bash
cd ~/Projects/sarvam/web
VITE_RELAY_API_BASE="$RELAY_API_URL" VITE_RELAY_SKIP_APPCHECK=1 npm run build -- --mode relay
cd ~/Projects/sarvam
npx firebase-tools hosting:channel:deploy relay --project sarvam-510715 --expires 30d
```

Copy the printed preview URL (for example `https://sarvam-510715--relay-XXXX.web.app`) for the smoke test and submission portal.

---

## 10-Line Smoke Test (Two Phones)

1. Open the preview URL on **Phone A (Host, iPhone Safari)**; ensure ring/silent switch is unmuted.
2. Tap **Live Relay** -> confirm teal intro card on cream -> tap **Start scanning** -> verify live video + Gemini status `Live`.
3. Point at a bill and ask aloud in Tamil or English -> confirm Gemini answers aloud with clean captions (no emoji/`{}`).
4. Tap **Freeze and ask** -> tap the `1 pinned` chip -> verify full-screen `PageViewer` zoom -> close viewer.
5. Tap **Invite family** -> turn ON **Guests can show their camera** -> copy link or read the 4-letter code.
6. On **Phone B (Guest)**, open `<preview-url>/r/<CODE>`, enter `"Amma"`, pick **தமிழ்**, tap **Join with mic on**.
7. Confirm Phone B sees Phone A's camera and Phone A shows `"Everyone in the room can see the camera"`.
8. Speak on Phone B in Tamil -> confirm Gemini answers aloud on BOTH phones with speaker-labelled captions.
9. Tap **Show my camera** on Phone B -> tap **Allow** on Phone A -> confirm camera switches to `"Amma's camera"`.
10. Tap **End** on Phone A -> confirm Phone B shows **Room ended** and Phone A's Home Recent opens the saved **Live Relay** transcript.

---

## Submission Checklist (Portal Opens 11:00 PM)

- [ ] **Prototype URL**: Firebase Hosting `relay` preview channel URL from Step 5
- [ ] **Repository URL & Branch**: GitHub repo URL, branch `feat/buildathon-live-relay`
- [ ] **Pitch Deck**: PDF under **10 MB**
- [ ] **Optional Demo Video**: Public Google Drive or YouTube link (up to 3 minutes; see `docs/buildathon/DEMO_SCRIPT.md`)

---

## Cost Guard (Do Today & Right After Event)

1. In Cloud Console -> **Billing -> Budgets & alerts**, set a budget alert (e.g. ₹2,000) on `sarvam-510715` and verify whether event credits are active.
2. Right after judging ends, scale `sarvam-relay-api` back to zero minimum instances so it incurs zero idle cost:

```bash
gcloud run services update sarvam-relay-api \
  --region asia-south1 \
  --project sarvam-510715 \
  --min-instances 0
```
