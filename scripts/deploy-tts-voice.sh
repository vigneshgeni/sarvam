#!/usr/bin/env bash
# Sarvam: create or update the SEPARATE voice-only server "sarvam-tts" (Gemini TTS for the iPhone
# app's Listen). It never touches the live API (sarvam-api) or Firebase Hosting.
#
# Run from the repo root on the feat/live-activity branch:
#   bash scripts/deploy-tts-voice.sh
# Needs: gcloud logged in (gcloud auth login) with access to project sarvam-510715.
set -euo pipefail

PROJECT="sarvam-510715"
REGION="asia-south1"
SERVICE="sarvam-tts"
MODEL="${GEMINI_TTS_MODEL:-gemini-3.1-flash-tts-preview}"   # cheaper: gemini-2.5-flash-tts

if [ "$SERVICE" = "sarvam-api" ]; then echo "Refusing: that is the live service."; exit 1; fi
cd "$(git rev-parse --show-toplevel)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" = "main" ]; then echo "Refusing: run this from feat/live-activity, not main."; exit 1; fi
echo "Branch: $BRANCH  Service: $SERVICE  Model: $MODEL"

# Voice only (every other path is 404), 0 copies when idle, at most 2 copies,
# 10 reads per minute per phone, at most 150 reads per copy per day (spend guard).
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source api \
  --allow-unauthenticated \
  --memory 1Gi \
  --concurrency 4 \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 90 \
  --set-env-vars "SARVAM_VOICE_ONLY=1,GEMINI_TTS_MODEL=$MODEL,TTS_RATE_LIMIT=10,SPEAK_DAILY_CAP=150,PROJECT=$PROJECT,GOOGLE_CLOUD_PROJECT=$PROJECT"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo
echo "Service URL: $URL"

echo "Check 1: /health"
curl -sS -o /dev/null -w "  status %{http_code}\n" "$URL/health"
echo "Check 2: explain is blocked (expect 404)"
curl -sS -o /dev/null -w "  status %{http_code}\n" -X POST "$URL/api/explain"
echo "Check 3: one short Tamil read (expect 200 and a WAV file)"
curl -sS -o /tmp/sarvam-tts-check.wav -w "  status %{http_code}, %{size_download} bytes, %{time_total}s\n" \
  -X POST "$URL/api/speak" -H "Content-Type: application/json" \
  -d '{"text":"வணக்கம். இது ஒரு சோதனை.","lang":"ta","voice":"female","voice_index":0}'
echo "  Play it: afplay /tmp/sarvam-tts-check.wav"

echo
echo "Next: build the app so Listen uses this server (no Mac needed afterwards):"
echo "  cd web && VITE_TTS_API_URL=$URL npm run build && npx cap sync ios"
