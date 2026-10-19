# Deployment Guide for Dev Environment: Cloud Run & Agent Runtime

**Target:** Development & Staging Environments Only  
**Status:** Documentation Only — **DO NOT RUN THESE COMMANDS DURING THE LIVE AI BUILDER CUP EVALUATION**  
**Hard Rule Reminder:** Do not deploy to `sarvam-api` (production) or Firebase Hosting. All steps below target isolated dev services.

---

## 1. Option A: Deploying ADK In-Process to a Dev Cloud Run Service

This deploys the FastAPI backend with the ADK agent running in-process to a separate development Cloud Run service (`sarvam-api-dev`) in `asia-south1`.

### Step 1: Set Environment Variables
```bash
export PROJECT_ID="sarvam-510715"
export REGION="asia-south1"
export DEV_SERVICE="sarvam-api-dev"
export IMAGE_TAG="gcr.io/${PROJECT_ID}/${DEV_SERVICE}:v1"
```

### Step 2: Build the Container via Cloud Build
```bash
# Submit build from the api directory
gcloud builds submit api/ \
  --project="${PROJECT_ID}" \
  --tag="${IMAGE_TAG}"
```

### Step 3: Deploy to Cloud Run (Development)
```bash
gcloud run deploy "${DEV_SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE_TAG}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --concurrency=10 \
  --timeout=60s \
  --set-env-vars="PROJECT=${PROJECT_ID},VERTEX_LOCATION=global,AGENT_ASK=1,MODEL=gemini-2.5-flash"
```

### Step 4: Verify the Dev Service
```bash
DEV_URL=$(gcloud run services describe "${DEV_SERVICE}" --platform=managed --region="${REGION}" --format="value(status.url)")
curl -s "${DEV_URL}/health"
```

---

## 2. Option B: Deploying Agent to Vertex AI Agent Runtime (Reasoning Engine)

This packages the ADK agent and provisions a managed serverless runtime on Vertex AI in `asia-south1`.

### Prerequisites (Requires Owner Confirmation First)
1. Vertex AI API enabled: `aiplatform.googleapis.com`
2. Staging Cloud Storage bucket in `asia-south1`: `gs://sarvam-agent-staging`

### Method 1: Using Google ADK CLI
```bash
# 1. Authenticate with ADC
gcloud auth application-default login

# 2. Deploy via ADK CLI to asia-south1
adk deploy agent_engine \
  --project="sarvam-510715" \
  --region="asia-south1" \
  --staging_bucket="gs://sarvam-agent-staging" \
  api/agent
```

### Method 2: Programmatic Deployment via Python SDK
Create a deployment script `deploy_remote_engine.py`:
```python
import os
import vertexai
from vertexai.preview import reasoning_engines
from agent.agent import create_ask_agent
from agent.tools import DocumentContext, create_agent_tools

PROJECT_ID = "sarvam-510715"
LOCATION = "asia-south1"
STAGING_BUCKET = "gs://sarvam-agent-staging"

vertexai.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET,
)

class SarvamRemoteApp:
    def __init__(self):
        pass

    def query(self, question: str, lang: str, result_json: str) -> dict:
        import asyncio
        from agent.runner import run_agent_turn
        res = asyncio.run(run_agent_turn(question=question, lang=lang, result_json=result_json))
        return res.model_dump()

remote_engine = reasoning_engines.ReasoningEngine.create(
    SarvamRemoteApp(),
    display_name="sarvam-agent-ask-engine",
    requirements=[
        "google-adk==2.12.0",
        "google-genai>=2.30.0",
        "pydantic>=2.10.0",
    ],
)

print(f"Agent Engine deployed successfully! Resource Name: {remote_engine.resource_name}")
```

### Step 3: Querying the Remote Reasoning Engine
```python
from vertexai.preview import reasoning_engines

engine = reasoning_engines.ReasoningEngine(remote_engine.resource_name)
response = engine.query(
    question="What is the fine amount?",
    lang="en",
    result_json='{"source_kind": "text_pdf", "source_text": "Fine amount Rs. 1,000.00"}'
)
print(response)
```

---

## 3. Rollback & Teardown

If any testing issues occur in development:
1. To disable the agent on Cloud Run dev:
   ```bash
   gcloud run services update "${DEV_SERVICE}" --region="${REGION}" --update-env-vars="AGENT_ASK=0"
   ```
2. To delete the dev Cloud Run service:
   ```bash
   gcloud run services delete "${DEV_SERVICE}" --region="${REGION}" --quiet
   ```
3. To delete the remote Reasoning Engine:
   ```bash
   gcloud ai reasoning-engines delete "${ENGINE_ID}" --region="asia-south1" --quiet
   ```
