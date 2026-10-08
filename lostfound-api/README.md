# sarvam-lf-api (Lost & Found)

Separate Cloud Run service from Explain. This API **does** store posts. The Explain API (`api/`) still stores nothing.

Listens on **port 8100**.

## Local demo (no GCP)

```bash
cd lostfound-api
python3 -m pip install --target .deps -r requirements.txt
LF_DEMO_MODE=true LF_AADHAAR_LITE=false LF_STORE=memory PORT=8100 \
  PYTHONPATH=.deps:. python3 -m uvicorn main:app --host 127.0.0.1 --port 8100
```

```bash
curl http://127.0.0.1:8100/lf/health
```

Demo mode seeds fictional found/lost posts (names like Asha / Arjun, TEST passport **Z1234567**). Guest tokens come from `POST /lf/demo/guest`. The labelled Demo finder approves a matching claim after about 8 seconds when answers contain the expected keywords.

Aadhaar fingerprinting is **off** (`LF_AADHAAR_LITE=false`). ID numbers are HMAC-fingerprinted in memory and discarded. Bank card numbers are rejected. Sarvam never handles money; UPI links are built for the owner’s own app after return.

## Tests

```bash
PYTHONPATH=.deps:. python3 -m pytest -q
```

## What the human must do before production (do not run against prod from this agent)

1. In Firebase (project `sarvam-510715`): enable Authentication, Google + Anonymous providers, authorised domains (localhost + hosting). Copy web config into `web/.env.local` (never commit it).
2. Enable APIs and create the database/secrets:

```bash
gcloud services enable firestore.googleapis.com secretmanager.googleapis.com identitytoolkit.googleapis.com --project=sarvam-510715
gcloud firestore databases create --location=asia-south1 --project=sarvam-510715
openssl rand -hex 32 | gcloud secrets create LF_ID_PEPPER --data-file=- --project=sarvam-510715
openssl rand -base64 32 | tr '+/' '-_' | gcloud secrets create LF_FIELD_KEY --data-file=- --project=sarvam-510715
```

3. Service account `sarvam-lf-api` with `roles/datastore.user`, `roles/secretmanager.secretAccessor`, `roles/aiplatform.user`.
4. Firestore TTL on `posts.expiresAt` and indexes from `firestore.indexes.json`. Rules in `firestore.rules` deny all client access.
5. Local ADC: `gcloud auth application-default login`.
6. Do not deploy until asked. P5 will add Cloud Run notes.

## Flags

| Flag | Contest default |
|---|---|
| `LF_DEMO_MODE` | true |
| `LF_AADHAAR_LITE` | false |
| `LF_PUBLIC_LOST_FEED` | false |
| `LF_MATCH_THRESHOLD` | 45 |
| `LF_POST_TTL_DAYS` | 90 |
| `PORT` | 8100 |
