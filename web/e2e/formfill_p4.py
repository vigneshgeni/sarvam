#!/usr/bin/env python3
"""
Playwright E2E test for Phase P4 (Form fill to PDF) at 390x844 on port 5174.
Mocks /api/formfill/detect and /api/formfill/extract, verifies:
1. Scan/pick synthetic KYC form -> 6 fields auto-filled from My details, signature blank.
2. Missing nominee field asked -> answered -> filled on screen.
3. Review and save -> PDF produced (verifies PDF page count == 1 and filled text exists via pypdf, signature blank).
4. Keep in Sarvam -> saves draft and appears in Home Recent as "Draft · sign by hand".
"""

import io
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = REPO_ROOT / "web"
PORT = 5174


MOCK_FIELDS = [
    {"id": "full_name", "label": "Full Name", "type": "text", "box": [320, 105, 930, 150], "page": 0, "profileKey": "fullName", "required": True},
    {"id": "dob", "label": "Date of Birth", "type": "date", "box": [320, 175, 930, 220], "page": 0, "profileKey": "dob", "dateFormat": "DD-MM-YYYY", "required": True},
    {"id": "mobile", "label": "Mobile Number", "type": "text", "box": [320, 245, 930, 290], "page": 0, "profileKey": "mobile", "required": True},
    {"id": "address", "label": "Address", "type": "text", "box": [320, 315, 930, 370], "page": 0, "profileKey": "addressLine", "required": True},
    {"id": "pan", "label": "PAN", "type": "charGrid", "box": [320, 395, 930, 440], "page": 0, "profileKey": "pan", "cells": 10, "required": True},
    {"id": "occupation", "label": "Occupation", "type": "text", "box": [320, 465, 930, 510], "page": 0, "profileKey": "occupation", "required": True},
    {"id": "nominee_name", "label": "Nominee Name", "type": "text", "box": [320, 535, 930, 580], "page": 0, "profileKey": "nomineeName", "required": True},
    {"id": "signature", "label": "Applicant Signature", "type": "signature", "box": [320, 680, 740, 760], "page": 0, "profileKey": None, "required": False},
]


def start_vite_server():
    proc = subprocess.Popen(
        ["npm", "run", "dev", "--", "--port", str(PORT), "--strictPort"],
        cwd=str(WEB_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    base_url = None
    deadline = time.time() + 25
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                raise RuntimeError("Vite server exited prematurely")
            time.sleep(0.1)
            continue
        clean = re.sub(r"\x1b\[[0-9;]*m", "", line)
        m = re.search(r"(https?://localhost:\d+)", clean)
        if m:
            base_url = m.group(1)
            break
    if not base_url:
        proc.terminate()
        raise RuntimeError("Could not detect Vite server URL")
    return proc, base_url


def advance_past_onboarding(page):
    skip_btn = page.get_by_role("button", name="Skip")
    fill_btn = page.locator('[data-testid="home-fill-form-btn"]')
    for _ in range(40):
        if fill_btn.is_visible():
            return
        if skip_btn.is_visible():
            skip_btn.click()
            fill_btn.wait_for(state="visible", timeout=5000)
            return
        time.sleep(0.1)
    fill_btn.wait_for(state="visible", timeout=5000)


def find_chromium_executable():
    cache_dir = Path.home() / "Library" / "Caches" / "ms-playwright"
    for pattern in [
        "chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chromium-*/chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ]:
        for m in sorted(cache_dir.glob(pattern), reverse=True):
            if m.is_file():
                return str(m)
    return None


def main():
    proc, base_url = start_vite_server()
    try:
        with sync_playwright() as p:
            launch_kwargs = {"headless": True}
            exe = find_chromium_executable()
            if exe:
                launch_kwargs["executable_path"] = exe
            browser = p.chromium.launch(**launch_kwargs)
            context = browser.new_context(viewport={"width": 390, "height": 844})
            page = context.new_page()

            # Mock /api/formfill/detect and /api/formfill/extract
            def handle_detect(route):
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps({"formTitle": "KYC update form", "fields": MOCK_FIELDS}),
                )

            def handle_extract(route):
                payload = json.loads(route.request.post_data or "{}")
                transcript = payload.get("transcript", "")
                out = {}
                for f in payload.get("fields", []):
                    if f["id"] == "nominee_name" and "Priya" in transcript:
                        out["nominee_name"] = "Priya S"
                    else:
                        out[f["id"]] = None
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(out),
                )

            page.route("**/api/formfill/detect", handle_detect)
            page.route("**/api/formfill/extract", handle_extract)

            page.goto(base_url, wait_until="domcontentloaded")
            advance_past_onboarding(page)

            # Seed profile in IndexedDB with 6 details (nominee intentionally blank)
            page.evaluate(
                """
                async () => {
                  const db = await new Promise((resolve, reject) => {
                    const req = indexedDB.open('sarvam_db', 4);
                    req.onupgradeneeded = (e) => {
                      const d = e.target.result;
                      if (!d.objectStoreNames.contains('recent_results')) {
                        const s = d.createObjectStore('recent_results', { keyPath: 'id' });
                        s.createIndex('timestamp', 'timestamp', { unique: false });
                      }
                      if (!d.objectStoreNames.contains('original_files')) {
                        const s = d.createObjectStore('original_files', { keyPath: 'resultId' });
                        s.createIndex('timestamp', 'timestamp', { unique: false });
                      }
                      if (!d.objectStoreNames.contains('read_cache')) {
                        d.createObjectStore('read_cache', { keyPath: 'id' });
                      }
                      if (!d.objectStoreNames.contains('profile')) {
                        d.createObjectStore('profile', { keyPath: 'id' });
                      }
                      if (!d.objectStoreNames.contains('drafts')) {
                        const s = d.createObjectStore('drafts', { keyPath: 'id' });
                        s.createIndex('createdAt', 'createdAt', { unique: false });
                      }
                    };
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                  });
                  await new Promise((resolve, reject) => {
                    const tx = db.transaction('profile', 'readwrite');
                    tx.objectStore('profile').put({
                      id: 'me',
                      fullName: 'Asha R',
                      dob: '1990-01-05',
                      mobile: '9876500001',
                      addressLine: '12 Main Rd',
                      city: 'Bengaluru',
                      state: 'Karnataka',
                      pin: '560100',
                      occupation: 'Salaried',
                      fatherOrSpouseName: '',
                      nomineeName: '',
                      nomineeRelation: '',
                      nomineeDob: '',
                      gender: '',
                      email: '',
                      saveIds: true,
                      pan: 'ABCDE1234F',
                      aadhaar: '',
                      updatedAt: Date.now()
                    });
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                  });
                }
                """
            )

            # Open Fill a form picker -> Sample KYC form
            page.locator('[data-testid="home-fill-form-btn"]').click()
            page.locator('[data-testid="formfill-pick-sample"]').wait_for(state="visible", timeout=5000)
            page.locator('[data-testid="formfill-pick-sample"]').click()

            page.locator('[data-testid="formfill-screen"]').wait_for(state="visible", timeout=5000)

            # Assert 6 fields filled from profile, 1 missing (Nominee Name), signature blank
            progress = page.locator('[data-testid="formfill-progress"]')
            progress.wait_for(state="visible", timeout=5000)
            page.wait_for_function(
                "() => document.querySelector('[data-testid=\"formfill-progress\"]')?.textContent?.includes('6 of 8 filled')",
                timeout=5000,
            )

            # Assert PAN is masked until tapped (charGrid renders one cell per span)
            pan_text = re.sub(r"\s+", "", page.locator('[data-testid="form-field-pan"]').inner_text())
            assert "ABCDE" not in pan_text, f"PAN should be masked before tap, got: {pan_text}"
            assert "34F" in pan_text, f"Masked PAN should show last 3 chars, got: {pan_text}"

            # Assert signature is blank
            sig_el = page.locator('[data-testid="form-field-signature"]')
            assert sig_el.get_attribute("data-filled") == "false", "Signature must stay blank"

            # Missing field question shown -> answer Nominee Name
            q_text = page.locator('[data-testid="formfill-current-question"]').inner_text()
            assert "Nominee Name" in q_text, f"Expected Nominee Name prompt, got: {q_text}"

            page.locator('[data-testid="formfill-answer-input"]').fill("Priya S")
            page.locator('[data-testid="formfill-answer-submit"]').click()

            # Wait until progress updates to 7 of 8 filled · sign by hand
            page.wait_for_function(
                "() => document.querySelector('[data-testid=\"formfill-progress\"]')?.textContent?.includes('7 of 8 filled')",
                timeout=5000,
            )

            # Open Review and save -> generates PDF
            page.locator('[data-testid="formfill-review-save-btn"]').click()
            page.locator('[data-testid="formfill-share-sheet"]').wait_for(state="visible", timeout=5000)
            page.wait_for_function("() => window.__sarvamLastFormPdf && window.__sarvamLastFormPdf.length > 500", timeout=10000)

            pdf_list = page.evaluate("() => Array.from(window.__sarvamLastFormPdf)")
            pdf_bytes = bytes(pdf_list)
            assert pdf_bytes.startswith(b"%PDF-"), "Generated output must be a valid PDF"

            # Verify page count and text inside generated PDF
            # Add api/.venv site-packages if pypdf isn't in py313
            pypdf_mod = None
            try:
                import pypdf as pypdf_mod
            except ImportError:
                venv_site = list((REPO_ROOT / "api" / ".venv" / "lib").glob("python*/site-packages"))
                if venv_site:
                    sys.path.insert(0, str(venv_site[0]))
                    import pypdf as pypdf_mod

            if pypdf_mod is not None:
                reader = pypdf_mod.PdfReader(io.BytesIO(pdf_bytes))
                assert len(reader.pages) == 1, f"Expected 1 page, got {len(reader.pages)}"
                extracted_text = reader.pages[0].extract_text() or ""
                assert "Asha R" in extracted_text, f"Expected 'Asha R' in PDF text: {extracted_text!r}"
                assert "Priya S" in extracted_text, f"Expected 'Priya S' in PDF text: {extracted_text!r}"
                assert "05-01-1990" in extracted_text, f"Expected formatted DOB in PDF text: {extracted_text!r}"
                print(f"[PASS] PDF verified via pypdf: 1 page, text contains Asha R, Priya S, 05-01-1990")
            else:
                # Fallback raw check
                assert b"/Type /Page" in pdf_bytes
                print(f"[PASS] PDF verified: valid PDF header, {len(pdf_bytes)} bytes")

            # Keep in Sarvam -> appears on Home under Recent as "Draft · sign by hand"
            page.locator('[data-testid="formfill-keep-sarvam"]').click()
            page.locator('[data-testid="home-fill-form-btn"]').wait_for(state="visible", timeout=5000)
            draft_badge = page.get_by_text("Draft · sign by hand").first
            draft_badge.wait_for(state="visible", timeout=5000)
            print("[PASS] Keep in Sarvam draft appears on Home under Recent as 'Draft · sign by hand'")

            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    main()
