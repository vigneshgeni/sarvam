# Deploy Sarvam

Run these from the repo root on your machine. This file is a runbook only. Do not treat a docs change as a deploy.

Project: `sarvam-510715`  
Region: `asia-south1`  
Explain API service: `sarvam-api`  
Current Cloud Run origin: `https://sarvam-api-422313883027.asia-south1.run.app`

`ALLOWED_ORIGINS` (comma-separated, no spaces):

```
http://localhost:5173,http://127.0.0.1:5173,https://sarvam-510715.web.app,https://sarvam-510715.firebaseapp.com
```

Those four origins are the full list to set on the Explain API:

| Origin | Why |
| --- | --- |
| `http://localhost:5173` | Vite dev server |
| `http://127.0.0.1:5173` | Vite dev server via loopback |
| `https://sarvam-510715.web.app` | Firebase Hosting |
| `https://sarvam-510715.firebaseapp.com` | Firebase Hosting alternate domain |

The API also allows the two localhost origins in code. The env var is still set to the full list so Hosting is included and the setting stays obvious.

## 1. Explain API on Cloud Run

From the repo root:

```bash
gcloud run deploy sarvam-api \
  --project sarvam-510715 \
  --source api \
  --region asia-south1 \
  --platform managed \
  --memory 1Gi \
  --concurrency 8 \
  --min-instances 1 \
  --allow-unauthenticated \
  --set-env-vars "ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://sarvam-510715.web.app,https://sarvam-510715.firebaseapp.com"
```

Grant **Vertex AI User** (`roles/aiplatform.user`) to the Cloud Run service identity (not your user account):

```bash
PROJECT_NUMBER="$(gcloud projects describe sarvam-510715 --format='value(projectNumber)')"
RUNTIME_SA="$(gcloud run services describe sarvam-api \
  --project sarvam-510715 \
  --region asia-south1 \
  --format='value(spec.template.spec.serviceAccountName)')"
if [ -z "$RUNTIME_SA" ]; then
  RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi
gcloud projects add-iam-policy-binding sarvam-510715 \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/aiplatform.user"
```

Use the service URL printed by `gcloud run deploy` if it differs from the origin above.

## 2. Build the web app

`VITE_API_URL` is read when Vite builds. Put the Cloud Run origin in `web/.env.production` (gitignored) or pass it inline. Do not commit that file.

```bash
cd web
VITE_API_URL="https://sarvam-api-422313883027.asia-south1.run.app" npm run build
```

`npm run build` runs `tsc -b && vite build` and writes `web/dist`.

## 3. Firebase Hosting

From the repo root, after the build in section 2:

```bash
npx firebase deploy --only hosting --project sarvam-510715
```

Hosting serves `web/dist`, rewrites unknown paths to `/index.html`, sends `Cache-Control: no-cache` for `/sw.js` and `/index.html`, and caches `/assets/**` for one year (`public, max-age=31536000, immutable`).

## 4. Post-deploy smoke test

```bash
curl -fsS "https://sarvam-api-422313883027.asia-south1.run.app/health"
curl -fsS -D - -o /dev/null "https://sarvam-510715.web.app/"
curl -fsS -D - -o /dev/null "https://sarvam-510715.web.app/index.html"
curl -fsS -D - -o /dev/null "https://sarvam-510715.web.app/sw.js"
```

Expect `/health` to return `{"status":"ok"}`. Expect `Cache-Control: no-cache` on `/index.html` and `/sw.js`.

Then open `https://sarvam-510715.web.app` and run the three built-in samples (lab report, insurance letter, pension notice). Each should reach the result screen.

Confirm a hashed file under `/assets/` returns `Cache-Control: public, max-age=31536000, immutable` (the filename changes every build; copy it from `index.html`).
