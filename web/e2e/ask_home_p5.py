#!/usr/bin/env python3
"""
Playwright E2E test for Phase P5 (Ask Sarvam on Home) at 390x844 on port 5174.
Mocks POST /api/ask and verifies:
1. Home shows the Ask Sarvam bar (with ?seed=ask seeding "Electricity bill call").
2. Tapping the bar opens Ask Sarvam in home mode.
3. Tanglish question "Arun bill pathi enna sonnaan?" returns answer + source card ("Electricity bill call"),
   and tapping Open opens the saved session transcript.
4. "remind me two days before" returns a propose_reminder approval card:
   - Before tapping Add, zero reminders exist on Home/IndexedDB.
   - Tapping "Not now" on a second proposal creates nothing.
   - Tapping "Add" creates the reminder, shows toast, and shows it on Home ("Today and tomorrow") AND in Notifications!
"""

import json
import re
import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = REPO_ROOT / "web"
SHOTS_DIR = REPO_ROOT / "docs" / "buildathon" / "shots" / "p5"
PORT = 5174


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
    ask_bar = page.locator('[data-testid="home-ask-sarvam-bar"]')
    for _ in range(40):
        if ask_bar.is_visible():
            return
        if skip_btn.is_visible():
            skip_btn.click()
            ask_bar.wait_for(state="visible", timeout=5000)
            return
        time.sleep(0.1)
    ask_bar.wait_for(state="visible", timeout=5000)


def try_screenshot(page, name: str):
    """Attempt a short-timeout screenshot; skip gracefully if macOS compositor hangs."""
    SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        page.screenshot(path=str(SHOTS_DIR / name), timeout=4000)
        print(f"[shot] saved {name}")
    except Exception as exc:
        print(f"[shot] skipped {name} (macOS compositor timeout: {type(exc).__name__})")


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

            ask_calls = []

            def handle_ask(route):
                body_text = route.request.post_data or ""
                ask_calls.append(body_text)
                q_match = re.search(r'name="question"\r?\n\r?\n([^\r\n]+)', body_text)
                q_text = (q_match.group(1) if q_match else "").lower()
                if "remind" in q_text or "two days" in q_text:
                    answer = (
                        "Sure! Nov 26-ku BESCOM bill reminder set pannalama?\n\n"
                        '```json\n'
                        '[{"type":"propose_reminder","title":"Pay BESCOM bill (Rs 2,340)","when":"2026-11-26 09:00"},'
                        '{"type":"propose_reminder","title":"Call Arun about meter","when":"2026-11-27 10:00"}]\n'
                        "```"
                    )
                    payload = {
                        "answer": answer,
                        "quote": None,
                        "page": None,
                        "evidence": "matched",
                        "answered_from": "document",
                        "not_found": False,
                        "language": "en",
                    }
                else:
                    payload = {
                        "answer": "Arun sonnadhu: BESCOM electricity bill Rs 2,340, due date 28 Nov.",
                        "quote": "The BESCOM electricity bill is Rs 2,340 and it is due on 28 Nov.",
                        "page": 1,
                        "evidence": "matched",
                        "answered_from": "document",
                        "not_found": False,
                        "language": "en",
                    }
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(payload),
                )

            page.route("**/api/ask", handle_ask)

            # Open with ?seed=ask to write "Electricity bill call"
            page.goto(f"{base_url}/?seed=ask", wait_until="domcontentloaded")
            advance_past_onboarding(page)

            # 1. Verify Home shows Ask Sarvam bar
            ask_bar = page.locator('[data-testid="home-ask-sarvam-bar"]')
            assert ask_bar.is_visible(), "Home Ask Sarvam bar must be visible"
            bar_box = ask_bar.bounding_box()
            assert bar_box and bar_box["height"] >= 44, f"Ask bar height < 44px: {bar_box}"
            try_screenshot(page, "01_home_ask_bar.png")

            # Wait briefly for ?seed=ask IndexedDB write to finish
            page.wait_for_function(
                """async () => {
                  const db = await new Promise((res, rej) => {
                    const r = indexedDB.open('sarvam_db');
                    r.onsuccess = () => res(r.result);
                    r.onerror = () => rej(r.error);
                  });
                  if (!db.objectStoreNames.contains('relaySessions')) return false;
                  const rows = await new Promise((res) => {
                    const tx = db.transaction('relaySessions', 'readonly');
                    const q = tx.objectStore('relaySessions').getAll();
                    q.onsuccess = () => res(q.result || []);
                  });
                  db.close();
                  return rows.some((s) => s.id === 'seed-electricity-bill-call');
                }""",
                timeout=5000,
            )

            # 2. Tap Ask Sarvam bar -> opens Ask screen in home mode
            ask_bar.click()
            page.locator('[data-testid="ask-home-screen"]').wait_for(state="visible", timeout=5000)

            # 3. Ask Tanglish question -> verify answer + source card
            composer = page.locator('[data-testid="ask-composer-input"]')
            composer.fill("Arun bill pathi enna sonnaan?")
            page.locator('[data-testid="ask-send-btn"]').click()

            source_card = page.locator('[data-testid="ask-source-card"]').first
            source_card.wait_for(state="visible", timeout=5000)
            assert "Electricity bill call" in source_card.inner_text(), "Source card must show Electricity bill call"
            assert any("2,340" in c for c in ask_calls), "Ask payload must pass recalled excerpt context"
            try_screenshot(page, "02_ask_answer_source.png")

            # Open source card -> opens session viewer
            page.locator('[data-testid="ask-source-open-btn"]').first.click()
            viewer = page.locator('[data-testid="relay-session-viewer"]')
            viewer.wait_for(state="visible", timeout=5000)
            assert "2,340" in viewer.inner_text(), "Session viewer must show Arun's BESCOM bill caption"
            viewer.get_by_role("button", name="Close").click()

            # 4. Ask to set reminder -> verify approval cards
            composer.fill("remind me two days before")
            page.locator('[data-testid="ask-send-btn"]').click()

            cards = page.locator('[data-testid="ask-proposal-card-propose_reminder"]')
            cards.first.wait_for(state="visible", timeout=5000)
            assert cards.count() == 2, f"Expected 2 reminder proposal cards, got {cards.count()}"

            # Verify ZERO reminders exist in IndexedDB BEFORE tapping Add
            count_before = page.evaluate(
                """async () => {
                  const db = await new Promise((res) => {
                    const r = indexedDB.open('sarvam_db');
                    r.onsuccess = () => res(r.result);
                  });
                  const rows = await new Promise((res) => {
                    const tx = db.transaction('reminders', 'readonly');
                    const q = tx.objectStore('reminders').getAll();
                    q.onsuccess = () => res(q.result || []);
                  });
                  db.close();
                  return rows.length;
                }"""
            )
            assert count_before == 0, f"Approval card must not create reminders before tap, found {count_before}"

            # Tap "Not now" on the second card -> creates nothing
            cards.nth(1).locator('[data-testid="ask-proposal-dismiss-propose_reminder"]').click()
            assert "Dismissed" in cards.nth(1).inner_text()

            # Tap "Add" on the first card -> creates reminder
            cards.nth(0).locator('[data-testid="ask-proposal-add-propose_reminder"]').click()
            cards.nth(0).locator('[data-testid="ask-proposal-added-badge"]').wait_for(state="visible", timeout=5000)
            try_screenshot(page, "03_ask_reminder_added.png")

            # Close Ask -> verify reminder shows on Home ("Today and tomorrow") and NOT the dismissed one
            page.locator('[data-testid="ask-home-screen"]').get_by_role("button", name="Close").click()
            today_card = page.locator('[data-testid="home-today-tomorrow"]')
            today_card.wait_for(state="visible", timeout=5000)
            today_text = today_card.inner_text()
            assert "Pay BESCOM bill (Rs 2,340)" in today_text, f"Added reminder missing on Home: {today_text}"
            assert "Call Arun about meter" not in today_text, "Dismissed reminder must NOT appear on Home"
            try_screenshot(page, "04_home_today_tomorrow.png")

            # Open Notifications panel -> verify reminder shows there too
            page.locator('[data-testid="home-notifications-btn"]').click()
            page.get_by_text("Pay BESCOM bill (Rs 2,340)").first.wait_for(state="visible", timeout=5000)
            assert page.get_by_text("Call Arun about meter").count() == 0, "Dismissed reminder must NOT appear in Notifications"
            try_screenshot(page, "05_notifications_panel.png")

            print("[PASS] P5 Ask Sarvam E2E: bar, memory recall, source card, approval card Add/Not now, Home & Notifications verified!")
            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    main()
