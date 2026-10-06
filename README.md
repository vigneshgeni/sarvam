# Sarvam

> Official notice & letter explainer in Indian languages · Google Cloud AI Builder Cup 2026

Sarvam turns official notices, utility bills, insurance letters, and pension notices into clear next steps in your language (English, தமிழ், हिंदी, and more).

---

## Architecture Overview

- **Web Frontend (`web/`)**: React 19 + Vite + TypeScript + Tailwind CSS PWA. Runs on phone browsers and desktop (max 430px centered frame).
- **Backend API (`api/`)**: FastAPI on Python 3.12+, powered by Gemini on Google Cloud Vertex AI (with ADC). Evidence exact-matching and date computations run deterministically in code.
- **Samples (`web/public/samples/`)**: Fictional test files for instant exploration (pension notice, insurance letter, lab report).

---

## Running API and Web Together Locally

### 1. Prerequisites

- Python 3.12+ (or 3.13)
- Node.js 20+ & npm
- Google Cloud credentials set up (`gcloud auth application-default login`) with project `sarvam-510715` (or configured via `PROJECT` env variable)

### 2. Start the Backend API (Port 8080)

In your first terminal:

```bash
cd api
source .venv/bin/activate
# If not yet installed:
# pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

Verify the API is healthy:
```bash
curl http://localhost:8080/health
# {"status":"ok"}
```

### 3. Start the Web Frontend (Port 5173)

In your second terminal:

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser (or use device mode at 390px/430px width).

### 4. Configuration

The frontend connects to the API via `VITE_API_URL` defined in `web/.env`:

```env
VITE_API_URL=http://localhost:8080
```

---

## How to Test Locally

1. **Try a sample**:
   - On the Home screen, click any sample under **"Try a sample"** (e.g. *Pension notice*, *Blood test report*, or *Insurance claim letter*).
   - Watch the 3-step scanner animation on the **Reading screen**.
   - Verify the **Result screen** displays in the section 4 order:
     1. Document title & type with evidence summary line (e.g., *Check against original* for photos, *Matched to document* for PDF quotes, or *Calculated* for relative dates).
     2. **What you need to do** (with date chips, past date badge if applicable, evidence chips, and tap to view the verbatim source passage).
     3. **In simple words** (plain-language summary).
     4. **Watch out** (steady amber card, warnings directly from document).
     5. **Key facts** (amounts, IDs, dates with *"From your document"* passage toggles).
     6. **Conflicts** if any conflicting details exist.
     7. **Disclaimer** and bottom bar (*Listen* + *Share*).
   - Test changing the language via the top dropdown on the Result screen (e.g. switch between English, தமிழ், and हिंदी) — it calls the API again and renders the full explanation in the chosen language.

2. **Choose file (Upload)**:
   - Click **"Choose file"** and select a PDF or image (`.pdf`, `.jpg`, `.png`).
   - The files stage in the review tray with thumbnail, file size, and remove button.
   - Click **"Done"** to run the explanation flow.

3. **Take photo (Camera)**:
   - On mobile (or camera-supported devices), click **"Take photo"** to open the camera (`capture="environment"`).
   - Capture up to 3 pages with the live page counter (`Page X of 3`).
   - Remove individual pages or tap **"Add next page"**.
   - Click **"Done"** to run the explanation flow. Images are automatically resized in the browser to max 1600px JPEG (~0.85 quality) before uploading.

4. **Run Unit Tests**:
   - Backend: `api/.venv/bin/pytest api`
   - Frontend build & lint: `cd web && npm run lint && npm run build`
