# Deploy notes for sarvam-lf-api (do not deploy from this document)

Project: `sarvam-510715`. Region: **asia-south1**. Service name: `sarvam-lf-api`.
Explain stays on `sarvam-api` (port 8080 locally). Lost & Found is a **separate** Cloud Run service.

Contest prototype: `LF_DEMO_MODE=true`, `--min-instances 1`, `--max-instances 1`.
Demo state is in memory: scale-to-zero or a second instance would wipe a judge's half-finished flow.
After judging, set `--min-instances 0` again to avoid cost.

## 1. Secrets and IAM

Secrets (already created in P0 human steps; do not print values):

- `LF_ID_PEPPER`
- `LF_FIELD_KEY`

Service account `sarvam-lf-api@sarvam-510715.iam.gserviceaccount.com` needs:

- `roles/datastore.user`
- `roles/secretmanager.secretAccessor`
- `roles/aiplatform.user`

```bash
gcloud iam service-accounts create sarvam-lf-api \
  --project=sarvam-510715 \
  --display-name="sarvam-lf-api"

gcloud projects add-iam-policy-binding sarvam-510715 \
  --member=serviceAccount:sarvam-lf-api@sarvam-510715.iam.gserviceaccount.com \
  --role=roles/datastore.user
gcloud projects add-iam-policy-binding sarvam-510715 \
  --member=serviceAccount:sarvam-lf-api@sarvam-510715.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding sarvam-510715 \
  --member=serviceAccount:sarvam-lf-api@sarvam-510715.iam.gserviceaccount.com \
  --role=roles/aiplatform.user
```

## 2. Firestore TTL and indexes

```bash
gcloud firestore indexes composite create --project=sarvam-510715 \
  --database='(default)' --file=firestore.indexes.json
# or: firebase deploy --only firestore:indexes --project sarvam-510715

gcloud firestore fields ttls update expiresAt \
  --collection-group=posts \
  --enable-ttl \
  --project=sarvam-510715
```

`firestore.rules` deny **all** client reads/writes. The API is the only door.

## 3. Build and deploy Cloud Run (asia-south1)

Replace `FIREBASE_HOSTING_ORIGIN` with the live Hosting URL (e.g. `https://sarvam-510715.web.app`).

```bash
cd lostfound-api

gcloud builds submit --tag asia-south1-docker.pkg.dev/sarvam-510715/sarvam/lf-api:latest \
  --project=sarvam-510715

gcloud run deploy sarvam-lf-api \
  --image asia-south1-docker.pkg.dev/sarvam-510715/sarvam/lf-api:latest \
  --region asia-south1 \
  --project sarvam-510715 \
  --service-account sarvam-lf-api@sarvam-510715.iam.gserviceaccount.com \
  --min-instances 1 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --allow-unauthenticated \
  --set-env-vars "PROJECT=sarvam-510715,MODEL=gemini-3.7-flash,VERTEX_LOCATION=global,LF_DEMO_MODE=true,LF_AADHAAR_LITE=false,LF_STORE=firestore,LF_COLLECTION_PREFIX=,LF_ALLOWED_ORIGINS=https://sarvam-510715.web.app,https://sarvam-510715.firebaseapp.com,http://127.0.0.1:41777,http://localhost:41777" \
  --set-secrets "LF_ID_PEPPER=LF_ID_PEPPER:latest,LF_FIELD_KEY=LF_FIELD_KEY:latest"
```

Cloud Run sets `PORT`. Do not hard-code 43123 in production.

## 4. Firebase Auth authorised domains

In Authentication → Settings → Authorised domains, keep:

- `localhost`
- `sarvam-510715.firebaseapp.com`
- `sarvam-510715.web.app`
- any custom Hosting domain

Providers: **Google** and **Anonymous** only. No phone OTP.

## 5. Firebase Hosting

Point the PWA at the LF API origin in Hosting env / `.env.production`:

```
VITE_LF_API_URL=https://sarvam-lf-api-<hash>-asia-south1.run.app
VITE_API_URL=https://<explain-cloud-run>
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=sarvam-510715.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=sarvam-510715
VITE_FIREBASE_APP_ID=...
```

Do **not** rewrite `/lf/*` through Hosting to Explain. Either:

- call `VITE_LF_API_URL` cross-origin (CORS via `LF_ALLOWED_ORIGINS`), or
- add a Hosting rewrite only for `/lf/**` → `sarvam-lf-api`.

The service worker must not precache or runtime-cache `/lf/` (see `web/vite.config.ts` `navigateFallbackDenylist` + `NetworkOnly`).

## 6. Explain API CORS (`ALLOWED_ORIGINS`)

On `sarvam-api` (Explain), add the Hosting origin if missing:

```bash
gcloud run services update sarvam-api \
  --region asia-south1 \
  --project sarvam-510715 \
  --update-env-vars "ALLOWED_ORIGINS=https://sarvam-510715.web.app,https://sarvam-510715.firebaseapp.com,http://127.0.0.1:41777,http://localhost:5173"
```

Do not send Lost & Found traffic to Explain.

## 7. Post-deploy smoke (human)

1. `curl -sS "$LF_URL/lf/health"` → `status=ok`, `demoMode=true`, `aadhaarLite=false`.
2. Open Hosting URL. Home shows **Explain | Lost & Found**. Explain samples still load.
3. Lost & Found → Continue as guest → Try the 2-minute demo → strong match → maroon plastic cover / Chennai → Demo finder ~8s → thank-you UPI copy.
4. Reload: tab remembered (`sarvam.tab`). Language chips still switch Explain strings.
5. Browser Network: `/lf/*` is `no-store` / not served from the PWA cache. `/api/*` Explain behaviour unchanged.
6. Confirm no ID numbers in Cloud Run logs.

Do not run these deploy commands until the human says so.
