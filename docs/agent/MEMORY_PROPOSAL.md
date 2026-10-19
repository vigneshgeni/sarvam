# Opt-In Memory Bank Proposal for Sarvam

**Document:** Architecture Design & Privacy Proposal  
**Target:** Google Cloud Vertex AI Memory Bank integration for Sarvam  
**Date:** 19 October 2026  
**Status:** Proposal Only (Not Built / Not Deployed)  

---

## 1. Executive Summary & Privacy Principles

Sarvam currently adheres to a strict **zero-server-storage privacy model**:
1. Documents and analysis results live exclusively in browser storage (IndexedDB) on the user's phone.
2. The Cloud Run API is completely stateless.
3. No personal names, document text, or identification numbers are stored on any server.

Integrating Google Cloud Vertex AI Memory Bank offers conversational continuity across sessions, but must **never compromise user trust or expose sensitive document data**.

This proposal describes a strictly **opt-in**, **privacy-first** design for Memory Bank.

---

## 2. What Would Be Remembered (Safe Preferences & Confirmed Deadlines Only)

Only high-level user preferences and explicitly user-confirmed calendar dates would be stored in the Memory Bank:

| Remembered Entity | Example | Purpose |
|:---|:---|:---|
| **Preferred Language** | `ta` (Tamil), `hi` (Hindi) | Automatically opens subsequent document readings and Ask threads in the user's preferred language. |
| **Preferred Spoken Voice** | `female` or `male`, speech rate `0.9` | Remembers Text-to-Speech playback preferences. |
| **Confirmed Deadlines** | `{"title": "Property Tax Rebate", "date": "2026-11-30"}` | Enables future cross-document prompts such as *"What upcoming deadlines do I have this month?"* without needing to re-upload older documents. |

---

## 3. What Is NEVER Remembered (Strict Redaction & Blacklist)

The following data categories are **hard-blocked** and will never be sent to or indexed by Memory Bank:

- **Medical & Clinical Data:** Lab test values (blood sugar, cholesterol, HbA1c), medication names, dosages, diagnoses, and hospital names.
- **Identity & Legal Numbers:** Aadhaar, PAN, voter ID, driving licence, passport, vehicle registration, and court case numbers.
- **Financial Details:** Bank account numbers, IFSC, credit/debit card numbers, UPI IDs, policy numbers, and transactional line items.
- **Personal PII:** Phone numbers, home addresses, dates of birth, and family member names.
- **Raw Document Text & Photos:** Document images, scanned PDFs, and verbatim OCR transcripts are never committed to Memory Bank.

Before any memory candidate is passed to the Memory Bank API, it must pass through `api/redact.py` (`keep_verbatim_spans`) and an entity filter. If any blocked category is detected, memory creation is aborted.

---

## 4. How It Works Without Sign-In (Anonymous Architecture)

Sarvam has **no user accounts and no passwords**. It relies on Firebase Anonymous Authentication to provide an opaque UID, or a locally generated cryptographic client UUID stored in IndexedDB:

1. **Client-Owned Pseudonym:**  
   The phone generates an opaque client identifier (e.g. `client_uuid = "anon-8f92b7c4-..."`). This ID is stored in the device's local IndexedDB.
2. **Scoping Memories:**  
   When the user opts in, requests to the Memory Bank API scope entries by this pseudonymous ID:
   ```python
   # Memory Bank creation scoped by client pseudonym
   client.memory_banks.memories.create(
       parent=memory_bank_resource,
       memory={
           "scope": {"user_id": client_uuid},
           "content": {"language_preference": "ta", "voice": "female"}
       }
   )
   ```
3. **No Cross-Device Tracking:**  
   Because there is no email or phone login, the memory profile is tied solely to that single browser/device instance. If the user clears browser data or uninstalls the app, a new UUID is generated and the old memories become unreachable.
4. **Automated Server TTL:**  
   All anonymous memories are provisioned with a 60-day Time-To-Live (TTL). If no interactions occur for 60 days, Google Cloud automatically purges the orphaned record.

---

## 5. "Forget Everything" Control (Right to Erasure)

Users retain complete, one-tap control over their memories:

1. **Settings UI:**  
   A prominent **"Forget Everything" (எல்லாவற்றையும் அழி / सब कुछ भूलें)** button in the App Settings.
2. **Atomic Deletion API:**  
   Tapping the button triggers an immediate API call to purge all memories tied to the user's pseudonymous ID:
   ```python
   # API endpoint: DELETE /api/memory
   client.memory_banks.memories.purge(
       name=f"projects/{PROJECT_ID}/locations/{LOCATION}/memoryBanks/{BANK_ID}",
       filter=f'scope.user_id="{client_uuid}"',
       force=True,
   )
   ```
3. **Local Cleanup:**  
   The browser immediately purges the client UUID, clearing all local and remote memory associations.
4. **Confirmation:**  
   The UI displays a clear confirmation message in the user's language confirming all stored preferences and deadlines were permanently erased.

---

## 6. Cost & Operational Overhead

- **Storage:** ~$0.25 to $0.30 per GiB-month. At ~200 bytes per user preference record, 100,000 active users consume less than 25 MB (< $0.01 / month).
- **Retrieval:** ~$0.50 per 1,000 queries.
- **Generation:** Standard Gemini token costs during initial fact extraction.
- **Opt-in Rate Impact:** Because this feature is strictly opt-in, cloud costs scale strictly with engaged users who actively request cross-session recall.
