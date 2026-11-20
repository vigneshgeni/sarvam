# Sarvam Live Relay — Deploy Commands (Run by Hand Only)

Per `docs/buildathon/09_UPDATE_SAME_PROJECT.md`:
- Cloud project: `sarvam-510715`
- Cloud Run service: **NEW** service `sarvam-relay-api` in `asia-south1` (NEVER touch `sarvam-api`)
- Firebase Hosting: **preview channel** `relay` only (NEVER `firebase deploy` or live channel)
- No Firestore rule changes, no `firebase.json` changes.

## Local Dev Setup (Two Terminals)

```bash
# Terminal 1: API with LiveKit Cloud credentials from api/.env.relay.local
cd ~/Projects/sarvam/api
set -a && source .env.relay.local && set +a
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Web in relay mode (Vite proxies /api/* to localhost:8000)
cd ~/Projects/sarvam/web
VITE_API_URL=http://127.0.0.1:8000 npm run dev -- --mode relay --host
```

## Step 1: Login & Check Project

```bash
gcloud auth login
gcloud config set project sarvam-510715
gcloud services enable secretmanager.googleapis.com run.googleapis.com --project sarvam-510715
```

## Step 2: Store LiveKit Secrets in Secret Manager

Read the three values from your local `api/.env.relay.local` (never commit them):

```bash
source ~/Projects/sarvam/api/.env.relay.local

for NAME in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET; do
  gcloud secrets describe "$NAME" --project sarvam-510715 >/dev/null 2>&1 || \
    gcloud secrets create "$NAME" --replication-policy=automatic --project sarvam-510715
done

printf '%s' "$LIVEKIT_URL"        | gcloud secrets versions add LIVEKIT_URL        --data-file=- --project sarvam-510715
printf '%s' "$LIVEKIT_API_KEY"    | gcloud secrets versions add LIVEKIT_API_KEY    --data-file=- --project sarvam-510715
printf '%s' "$LIVEKIT_API_SECRET" | gcloud secrets versions add LIVEKIT_API_SECRET --data-file=- --project sarvam-510715
```

Grant the Cloud Run runtime service account access to read those secrets (if not already granted):

```bash
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

## Step 4: Read the `sarvam-relay-api` URL

```bash
RELAY_API_URL=$(gcloud run services describe sarvam-relay-api \
  --region asia-south1 \
  --project sarvam-510715 \
  --format='value(status.url)')
echo "RELAY_API_URL=$RELAY_API_URL"
curl -s "${RELAY_API_URL}/api/relay/health"
```

## Step 5: Rebuild Web & Deploy to Firebase Preview Channel `relay`

```bash
cd ~/Projects/sarvam/web
VITE_RELAY_API_BASE="$RELAY_API_URL" VITE_RELAY_SKIP_APPCHECK=1 npm run build -- --mode relay
cd ~/Projects/sarvam
npx firebase-tools hosting:channel:deploy relay --project sarvam-510715 --expires 30d
```

## Cost Guard (After the Event)

- Set a billing budget alert (e.g. ₹2,000) on `sarvam-510715` in Cloud Console > Billing > Budgets & alerts.
- After judging finishes, scale `sarvam-relay-api` back to zero minimum instances so it costs nothing when idle:

```bash
gcloud run services update sarvam-relay-api \
  --region asia-south1 \
  --project sarvam-510715 \
  --min-instances 0
```
