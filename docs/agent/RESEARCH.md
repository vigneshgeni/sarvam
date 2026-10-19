# Research Note: Google Agent Stack (ADK, Agent Engine, Memory Bank) for Ask Sarvam

**Date:** 19 October 2026  
**Project:** Sarvam (https://github.com/vigneshgeni/sarvam)  
**Branch:** `feat/agent-ask`  
**Target:** Google Cloud AI Builder Cup 2026 Evaluation  

---

## 1. ADK for Python (Agent Development Kit)

- **Package and Current Version:**  
  The official Google Agent Development Kit for Python is published on PyPI as [`google-adk`](https://pypi.org/project/google-adk/). The current release is **`2.12.0`** (Python $\ge$ 3.10 compatible).
- **Installation:**  
  ```bash
  pip install google-adk==2.12.0
  ```
  Dependency verification: installs cleanly alongside `fastapi`, `pydantic>=2.10`, and `google-genai>=0.8.0` without breaking existing dependencies in `api/requirements.txt`.
- **Tool Definition (Plain Python Functions):**  
  ADK natively extracts schemas from standard Python type hints and docstrings. No manual JSON schema declarations are needed.
  ```python
  def days_until(date_text: str) -> dict:
      """Calculate days remaining from today (Asia/Kolkata) until date_text.
      
      Args:
          date_text: ISO date (YYYY-MM-DD) or human date ('05 Dec 2026').
      """
      ...
  ```
  Source: [Google ADK Documentation - Tools](https://google.github.io/adk-docs/tools/)
- **Agent and Session Orchestration:**  
  ADK provides `Agent` and `InMemoryRunner` for managing conversations:
  ```python
  from google.adk.agents import Agent
  from google.adk.runners import InMemoryRunner

  agent = Agent(
      name="ask_sarvam",
      model="gemini-2.5-flash",
      instruction="Answer only from tool results...",
      tools=[search_document, verify_quote, days_until, relative_deadline, prepare_calendar_event],
  )
  runner = InMemoryRunner(agent=agent, app_name="sarvam")
  ```
- **Running Inside FastAPI:**  
  The agent runner runs asynchronously inside any standard FastAPI async route handler:
  ```python
  session = await runner.session_service.create_session(app_name="sarvam", user_id="ephemeral_user")
  async for event in runner.run_async(user_id=session.user_id, session_id=session.id, new_message=user_content):
      # stream or collect text and tool events
  ```
  Source: [ADK Framework Integration Guide](https://google.github.io/adk-docs/runners/)
- **Vertex AI Authentication with Application Default Credentials (ADC):**  
  ADK builds on `google-genai`. To route requests through Vertex AI using ADC without API keys:
  ```bash
  export GOOGLE_GENAI_USE_VERTEXAI=true
  export GOOGLE_CLOUD_PROJECT=sarvam-510715
  export GOOGLE_CLOUD_LOCATION=asia-south1
  ```
  The SDK automatically picks up ambient credentials via `google.auth.default()`. No secrets or credentials are hardcoded.  
  Source: [Google GenAI SDK Vertex AI Auth](https://cloud.google.com/vertex-ai/generative-ai/docs/sdks/overview)

---

## 2. Agent Runtime (Vertex AI Reasoning Engine / Agent Platform)

- **Regional Availability Check for `asia-south1` (Mumbai):**  
  While general Vertex AI model endpoints and prediction exist in `asia-south1`, the official [Supported locations for agents in Agent Platform](https://cloud.google.com/gemini/enterprise/agent-platform/docs/locations-agents) explicitly lists supported regions for agent infrastructure features (Agent Runtime, Sessions, Memory Bank):
  > "Selecting a supported location ensures data-at-rest residency for your agent infrastructure features (agent source code, deployment packages, session history, memory bank entries, and metadata)..."
  
  The locations listed on this page are strictly:
  - **Americas:** `us-central1` (Iowa), `us-east1` (South Carolina), `us-east4` (Northern Virginia), `us-west1` (Oregon)
  - **Europe:** `europe-west1` (Belgium), `europe-west2` (London), `europe-west3` (Frankfurt), `europe-west4` (Netherlands), `europe-west6` (Zurich), `europe-west8` (Milan), `europe-southwest1` (Madrid)
  - **Multi-region:** `us`, `eu`
  - **Global:** `global` (for Memory Bank and Sessions only)
  
  **`asia-south1` (Mumbai) is NOT listed** on the official Agent Platform supported locations page. Managed Agent Runtime and Memory Bank cannot be deployed with India data-at-rest residency today.
  Source: [Supported locations for agents in Agent Platform](https://cloud.google.com/gemini/enterprise/agent-platform/docs/locations-agents)
- **Latency Impact:**  
  Because `asia-south1` is not available on the managed Agent Platform, deploying an agent there would require targeting `europe-west1` or `us-central1`. Cross-region RTT adds 150–240 ms per hop. In a 2–4 turn reasoning loop, cross-region transit adds 500–1,000 ms of pure network latency over running locally in India.
- **Deployment Steps (if deploying to a supported region like `us-central1`):**  
  - *Option 1 (ADK CLI):*  
    ```bash
    adk deploy agent_engine --project=sarvam-510715 --region=us-central1 api/agent
    ```
  - *Option 2 (Vertex AI Python SDK):*  
    ```python
    from vertexai.preview import reasoning_engines
    remote_agent = reasoning_engines.ReasoningEngine.create(
        agent_instance,
        display_name="sarvam-agent-ask",
        requirements=["google-adk==2.12.0", "google-genai>=0.8.0"],
        staging_bucket="gs://sarvam-agent-staging",
    )
    ```
  Source: [Vertex AI Reasoning Engine Deployment](https://cloud.google.com/vertex-ai/generative-ai/docs/reasoning-engine/deploy)
- **Cost Structure:**  
  - *Compute (Serverless Container):* ~$0.0994 per 3,600 vCPU-seconds (~$0.0276/vCPU-hr) and ~$0.0105 per 3,600 GiB-seconds (~$0.0029/GiB-hr).
  - *Free Tier:* Monthly allowance of 180,000 vCPU-seconds and 360,000 GiB-seconds.
  - *Per-Call Cost:* Overwhelmingly driven by underlying Gemini token usage. vCPU compute execution during tool dispatch is fractions of a millicent.  
  Source: [Google Cloud Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing#reasoning-engine)
- **Tracing and Observability:**  
  Agent Engine automatically exports OpenTelemetry spans to Google Cloud Trace (`projects/sarvam-510715/traces`), providing latency breakdowns for tool calls and model reasoning turns.

---

## 3. Memory Bank

- **What It Stores and Where:**  
  Vertex AI Memory Bank extracts and stores structured long-term semantic user memories, entity facts, and preferences. Per Google's [locations documentation](https://cloud.google.com/gemini/enterprise/agent-platform/docs/locations-agents), Memory Bank is supported in US and European regions (`us-central1`, `europe-west1`, etc.) or `global`. It is **not supported in `asia-south1`**. Memory entries stored in `global` or `us-central1` leave Indian borders.
- **User Data Deletion:**  
  Supports criteria-based purging via API:
  ```python
  client.memory_banks.memories.purge(name=bank_name, filter='scope.user_id="USER_ID"', force=True)
  ```
  Individual items can also be deleted by memory resource ID.
- **Anonymous Users (Sarvam Has No Sign-In):**  
  Memory Bank can technically be keyed by an anonymous client identifier (e.g. `client.scope.user_id = anonymous_uuid`). **However, without persistent user accounts:**
  1. If a user clears browser cache, uninstalls the PWA, or switches devices, server-side memories are orphaned permanently unless an aggressive TTL cleanup runs.
  2. Storing unauthenticated user document facts server-side conflicts with Sarvam's core privacy guarantee: **the server stores zero user documents and zero user history**.
- **Memory Bank Cost:**  
  - *Storage:* ~$0.30 per GiB-month (or ~$0.25 per 1,000 memories/month).
  - *Retrieval:* ~$0.50 per 1,000 memories returned.
  - *Generation:* Standard Gemini token consumption for fact extraction and memory consolidation.

---

## 4. ADK Sessions vs Sarvam's Current History

- **Current Ask Architecture:**  
  Completely stateless on the server. The phone's AskSheet stores conversational state in browser memory/IndexedDB and sends the last 8 turns as text in `history`. `api/reader.py` (`last_ask_turns`) trims it to 4,000 characters. The Cloud Run container stores zero state.
- **ADK Sessions:**  
  ADK's `Runner` requires a `SessionService`. In production multi-instance Cloud Run, a stateful session store would require external infrastructure (Redis/Firestore) and introduces state synchronization and privacy liabilities.
- **Architecture Decision:**  
  Instantiate an **ephemeral `InMemorySessionService` per request** seeded with the client's transmitted history turns. Once the response is generated, the in-memory session is discarded. This satisfies the ADK runner interface while maintaining Sarvam's strict zero-server-storage privacy architecture.

---

## 5. Cost and Latency Estimate (Real Empirical Data from 5 Live Calls)

Empirical testing on Vertex AI ADC with real documents (`sample-echallan.pdf`, `sample-lab-report.pdf`, `sample-court-summons.pdf`):

| Call # | Question & Sample | Model | Steps | Tokens (In / Out) | Cost (USD) | Latency (s) |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| 1 | Fine amount & due date (`echallan`) | `gemini-2.5-flash` | 1 | 871 / 32 | $0.000150 | 9.17 s |
| 2 | Days left to pay (`echallan`) | `gemini-2.5-flash` | 1 | 319 / 35 | $0.000069 | 4.38 s |
| 3 | Prepare calendar reminder draft (`echallan`) | `gemini-2.5-flash` | 1 | 320 / 30 | $0.000066 | 1.10 s |
| 4 | Cholesterol level (`lab-report`) | `gemini-2.5-flash` | 1 | 586 / 28 | $0.000105 | 6.59 s |
| 5 | Court hearing date & place (`summons`) | `gemini-2.5-flash` | 1 | 741 / 38 | $0.000134 | 3.33 s |

**Summary Statistics:**
- **Median Latency:** **4.38 s** (comfortably under the 12 s pass bar).
- **Average Cost per Ask:** **$0.000095** (< 0.01 US cents / query).
- **2–4 Tool Step Projection:** ~1,200–2,500 prompt tokens, ~100–200 completion tokens, total cost ~$0.00025–$0.00045 per agent Ask turn.
- **Model Note on Latency:** Live benchmarking revealed that `gemini-3.7-flash` with dynamic thinking or global routing currently takes 35–77 s per turn, causing 504 timeouts. Disabling thinking (`thinking_budget=0`) or routing to `gemini-2.5-flash` is critical for meeting the $\le 12$ s median latency pass bar.

---

## 6. Recommendation: Option A or Option B for the Finale

**Recommendation: Option A (ADK Agent Running In-Process Inside FastAPI on Cloud Run)**

### 3 Core Reasons:
1. **Zero Cloud Resource Risk (Protects Live Judging App):**  
   Hard Rule 3 strictly prohibits creating or changing GCP resources without owner consent. Option A requires zero new GCP infrastructure, zero new IAM roles, and zero staging buckets. It deploys inside the existing Cloud Run service container definition.
2. **Sub-Millisecond Tool Execution & Reliability:**  
   Our existing verification code (`api/evidence.py`, `api/dates.py`, `api/redact.py`) runs directly in-process. In Option A, tool calls execute with zero IPC/network overhead. In Option B, tools require remote serialization and network hops back to document context.
3. **Instant, Fail-Safe Fallback:**  
   If the agent hits a timeout, error, or fails post-validation, Option A falls back to today's single-call Ask in the exact same process in milliseconds, guaranteeing zero disruption to judges.

### Smallest Meaningful Setup for Google Agent Platform:
- Package the agent logic using official `google-adk` abstractions (`Agent`, `InMemoryRunner`).
- Connect through the unified `google-genai` SDK with Vertex AI ADC (`GOOGLE_GENAI_USE_VERTEXAI=true`).
- Provide the complete, tested deployment specification (`docs/agent/DEPLOY_DEV.md`) enabling one-command promotion to Vertex AI Agent Engine (`adk deploy agent_engine`) when the owner provisions the dev service.
