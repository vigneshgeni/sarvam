# Sarvam Web (React + TypeScript + Vite + Tailwind)

Official notice explainer PWA for Sarvam.

## Running Locally with API

### 1. Start the API (in a separate terminal)
```bash
cd ../api
source .venv/bin/activate
uvicorn main:app --reload --port 8080
```

### 2. Start Web Dev Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

Environment configuration is in `.env`:
```env
VITE_API_URL=http://localhost:8080
```

## Build and Lint
```bash
npm run lint
npm run build
```
