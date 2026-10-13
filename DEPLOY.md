# Deploy Sarvam

Run these from the repo root on your machine, in this order. This file is a runbook. Do not treat a docs change as a deploy.

Project: `sarvam-510715`  
Region: `asia-south1`  
Explain API service: `sarvam-api`

`ALLOWED_ORIGINS` (comma-separated, no spaces):

```
http://localhost:5173,http://127.0.0.1:5173,https://sarvam-510715.web.app,https://sarvam-510715.firebaseapp.com
```

| Origin | Why |
| --- | --- |
| `http://localhost:5173` | Vite dev server |
| `http://127.0.0.1:5173` | Vite dev server via loopback |
| `https://sarvam-510715.web.app` | Firebase Hosting |
| `https://sarvam-510715.firebaseapp.com` | Firebase Hosting alternate domain |

## APIs to enable

Cloud Text-to-Speech API is required for Chirp 3 HD (`en`, `ta`, `hi`, `te`, `ml`, `kn`). Vertex AI is required for Explain and, after the language PR lands, for Odia Gemini TTS (preview). `api/tts.py` on this branch has no region setting; Chirp 3 HD is called through the Cloud Text-to-Speech client. Vertex for Explain uses `VERTEX_LOCATION` (default `global`) in `api/reader.py`.

Console (you): open [Google Cloud APIs](https://console.cloud.google.com/apis/library?project=sarvam-510715) if `gcloud` is not logged in.

```bash
gcloud config set project sarvam-510715
gcloud auth login
gcloud auth application-default login
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  texttospeech.googleapis.com \
  firestore.googleapis.com
```

`gcloud auth login` and `gcloud auth application-default login` are console / browser steps only you can complete.

## Cloud Run (Explain API)

`--max-instances 4` caps spend on this public, unauthenticated API. `gcloud` splits `--set-env-vars` on commas, so the origin list uses a custom `^@^` delimiter.

```bash
gcloud run deploy sarvam-api \
  --project sarvam-510715 \
  --source api \
  --region asia-south1 \
  --platform managed \
  --memory 1Gi \
  --concurrency 8 \
  --min-instances 1 \
  --max-instances 4 \
  --allow-unauthenticated \
  --set-env-vars "^@^ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://sarvam-510715.web.app,https://sarvam-510715.firebaseapp.com@GOOGLE_CLOUD_PROJECT=sarvam-510715@PROJECT=sarvam-510715"
```

`api/reader.py` reads `PROJECT` (default `sarvam-510715`) and passes that id into `genai.Client`. It does not read `GOOGLE_CLOUD_PROJECT`. ADC is used for credentials, not to pick the project. `PROJECT` is set here so Vertex uses this project; `GOOGLE_CLOUD_PROJECT` is set for other Google libraries.

Copy the service URL from the command output.

```bash
API_URL="$(gcloud run services describe sarvam-api \
  --project sarvam-510715 \
  --region asia-south1 \
  --format='value(status.url)')"
echo "$API_URL"
```

Grant **Vertex AI User** to the Cloud Run service identity (not your user account):

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

## Firebase console (you)

Do these in the Firebase console for `sarvam-510715` if they are not already done:

1. Create the Firestore database in **Native mode** in **asia-south1**.
2. Enable the **Anonymous** sign-in provider.
3. Register a Web app if you have not, and copy `apiKey`, `authDomain`, `projectId`, `appId`.
4. In Authentication → Settings → Authorised domains, add `sarvam-510715.web.app` and `sarvam-510715.firebaseapp.com`. `localhost` is there by default.
5. `npx -y firebase-tools login` if you have not logged in (browser).

Put the four public client keys in `web/.env` (gitignored). Do not commit that file.

```
VITE_API_URL=<the Cloud Run URL>
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=sarvam-510715
VITE_FIREBASE_APP_ID=
```

`web/.env.example` lists the same names.

## Build the web app and deploy Hosting plus rules

`VITE_*` values are read at build time.

```bash
cd web
VITE_API_URL="$API_URL" \
VITE_FIREBASE_API_KEY="$VITE_FIREBASE_API_KEY" \
VITE_FIREBASE_AUTH_DOMAIN="$VITE_FIREBASE_AUTH_DOMAIN" \
VITE_FIREBASE_PROJECT_ID=sarvam-510715 \
VITE_FIREBASE_APP_ID="$VITE_FIREBASE_APP_ID" \
npm run build
cd ..
npx -y firebase-tools deploy --only hosting,firestore:rules --project sarvam-510715
```

Hosting serves `web/dist`, rewrites unknown paths to `/index.html`, sends `Cache-Control: no-cache` for `/sw.js` and `/index.html`, and caches `/assets/**` for one year.

## Smoke test

```bash
chmod +x scripts/smoke.sh
scripts/smoke.sh "$API_URL" "https://sarvam-510715.web.app"
```

Expect four `PASS` lines: `health`, `cors`, `explain`, `speak`. The script does not print document text or audio content. `/api/speak` may return `audio/wav` or `audio/mpeg`.

Then open `https://sarvam-510715.web.app` and run the built-in samples. Each should reach the result screen. Confirm `Cache-Control: no-cache` on `/index.html` and `/sw.js`.

## Install on an iPhone (you)

1. On the phone, open Safari to `https://sarvam-510715.web.app`.
2. Share → Add to Home Screen.
3. Open the icon, run a sample, and send one rating (Yes, or No then Send).

## Feedback counts

From the repo root, with Application Default Credentials and permission to read Firestore:

```bash
python3 -m venv scripts/.venv
scripts/.venv/bin/pip install -r scripts/requirements.txt
GOOGLE_CLOUD_PROJECT=sarvam-510715 scripts/.venv/bin/python scripts/feedback_summary.py
```

The script counts `feedback` documents and skips `sample: true`. It does not read or store document text. Firestore is not added to the Explain API.
