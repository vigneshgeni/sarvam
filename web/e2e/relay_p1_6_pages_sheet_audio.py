#!/usr/bin/env python3
"""
Phase P1.6 Playwright E2E test suite:
- Intro as a rounded teal card on cream at 390x844 and 375x667 (zero overlap, Start scanning visible without scroll).
- Capture 2 pages in Scan mode, open PageViewer from thumbnail, swipe/navigate to page 2, close.
- Proceed to open 3-detent LiveSheet; drag sheet down to collapsed and up to half/full via pointer events;
  verify shutter stays reachable when collapsed.
- Add page from the sheet appends page 3 without restarting session.
- "Tap to turn on sound" banner appears when AudioContext is forced to suspended.
- Headless Gemini failure still shows the friendly error card.
Screenshots saved to docs/buildathon/shots/p1_6/.
"""

import re
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = REPO_ROOT / "web"
SHOTS_DIR = REPO_ROOT / "docs" / "buildathon" / "shots" / "p1_6"
PORT = 5177


def find_chromium_executable() -> str | None:
    cache_dir = Path.home() / "Library" / "Caches" / "ms-playwright"
    if not cache_dir.exists():
        return None
    for pattern in [
        "chromium_headless_shell-*/chrome-mac/headless_shell",
        "chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chromium-*/chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ]:
        matches = sorted(cache_dir.glob(pattern), reverse=True)
        for m in matches:
            if m.is_file():
                return str(m)
    return None


def start_vite_server():
    proc = subprocess.Popen(
        ["npm", "run", "dev", "--", "--mode", "relay", "--port", str(PORT), "--strictPort"],
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
    relay_card = page.locator('[data-testid="home-live-relay-card"]')
    for _ in range(40):
        if relay_card.is_visible():
            return
        if skip_btn.is_visible():
            skip_btn.click()
            relay_card.wait_for(state="visible", timeout=5000)
            return
        time.sleep(0.1)
    relay_card.wait_for(state="visible", timeout=5000)


def wait_for_camera_ready(page):
    page.locator('[data-testid="relay-camera-screen"]').wait_for(state="visible", timeout=6000)
    page.wait_for_function(
        """
        () => {
          const v = document.querySelector('[data-testid="relay-camera-video"]');
          return v && v.srcObject && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0;
        }
        """,
        timeout=8000,
    )


def boxes_intersect(a: dict, b: dict) -> bool:
    return not (
        a["x"] + a["width"] <= b["x"] + 0.5
        or b["x"] + b["width"] <= a["x"] + 0.5
        or a["y"] + a["height"] <= b["y"] + 0.5
        or b["y"] + b["height"] <= a["y"] + 0.5
    )


def assert_intro_card_layout(page, width: int, height: int, label: str):
    screen_bg = page.evaluate(
        '() => getComputedStyle(document.querySelector(\'[data-testid="relay-intro-screen"]\')).backgroundColor'
    )
    assert screen_bg == "rgb(244, 245, 242)", f"[{label}] Expected cream screen bg, got {screen_bg}"

    card_bg = page.evaluate(
        '() => getComputedStyle(document.querySelector(\'[data-testid="relay-intro-card"]\')).backgroundColor'
    )
    assert card_bg == "rgb(33, 77, 71)", f"[{label}] Expected teal card bg, got {card_bg}"

    selectors = {
        "stage": '[data-testid="relay-intro-stage"]',
        "copy": '[data-testid="relay-intro-copy"]',
        "dots": '[data-testid="relay-intro-dots"]',
        "start": '[data-testid="relay-intro-start"]',
        "skip": '[data-testid="relay-intro-skip"]',
    }
    boxes = {}
    for name, sel in selectors.items():
        el = page.locator(sel)
        assert el.is_visible(), f"[{label}] {name} not visible"
        box = el.bounding_box()
        assert box is not None, f"[{label}] {name} missing box"
        assert box["x"] >= -0.5 and box["x"] + box["width"] <= width + 0.5, f"[{label}] {name} horizontal overflow: {box}"
        assert box["y"] >= -0.5 and box["y"] + box["height"] <= height + 0.5, f"[{label}] {name} clipped below {height}px: {box}"
        boxes[name] = box

    names = list(boxes.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            assert not boxes_intersect(boxes[names[i]], boxes[names[j]]), (
                f"[{label}] Overlap between {names[i]} and {names[j]}: {boxes[names[i]]} vs {boxes[names[j]]}"
            )


def run_tests():
    SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    proc, base_url = start_vite_server()
    print(f"[e2e-p1.6] Vite dev server running at {base_url}")

    passed = []
    try:
        with sync_playwright() as p:
            launch_kwargs = {
                "headless": True,
                "args": [
                    "--use-fake-device-for-media-stream",
                    "--use-fake-ui-for-media-stream",
                ],
            }
            exe = find_chromium_executable()
            if exe:
                launch_kwargs["executable_path"] = exe

            # ── 1. Intro card layout at 390x844 and 375x667 ──
            for w, h, tag in [(390, 844, "intro-390x844"), (375, 667, "intro-375x667")]:
                browser = p.chromium.launch(**launch_kwargs)
                ctx = browser.new_context(viewport={"width": w, "height": h}, ignore_https_errors=True)
                page = ctx.new_page()
                page.goto(base_url, wait_until="domcontentloaded")
                advance_past_onboarding(page)
                page.locator('[data-testid="home-live-relay-card"]').click()
                page.locator('[data-testid="relay-intro-card"]').wait_for(state="visible", timeout=5000)
                assert_intro_card_layout(page, w, h, tag)
                page.screenshot(path=str(SHOTS_DIR / f"{tag}.png"))
                passed.append(f"{tag}: Teal card on cream with zero overlap and Start scanning visible")
                print(f"[e2e-p1.6] PASS {tag}")
                ctx.close()
                browser.close()

            # ── 2. Pages viewer, 3-detent sheet drag, Add page from sheet ──
            browser = p.chromium.launch(**launch_kwargs)
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                ignore_https_errors=True,
                permissions=["camera", "microphone"],
            )
            page = ctx.new_page()
            page.goto(base_url, wait_until="domcontentloaded")
            advance_past_onboarding(page)
            page.locator('[data-testid="home-live-relay-card"]').click()
            page.locator('[data-testid="relay-intro-start"]').click()
            wait_for_camera_ready(page)

            # Switch to Scan pages mode
            page.locator('[data-testid="relay-mode-scan"]').click()
            shutter = page.locator('[data-testid="relay-shutter"]')
            shutter.wait_for(state="visible", timeout=4000)

            # Capture 2 pages
            shutter.click()
            page.locator('[data-testid="relay-page-thumb"]').wait_for(state="visible", timeout=4000)
            time.sleep(0.2)
            shutter.click()
            page.wait_for_function(
                '() => document.querySelector(\'[data-testid="relay-page-count-badge"]\')?.textContent?.trim() === "2"',
                timeout=4000,
            )

            # Open viewer from thumbnail -> starts at Page 2 of 2 -> swipe right to Page 1 -> swipe left back to Page 2 -> close
            page.locator('[data-testid="relay-page-thumb"]').click()
            viewer = page.locator('[data-testid="relay-page-viewer"]')
            viewer.wait_for(state="visible", timeout=4000)
            assert "Page 2 of 2" in page.locator('[data-testid="page-viewer-counter"]').inner_text()
            page.screenshot(path=str(SHOTS_DIR / "page-viewer.png"))

            # Swipe right on stage to go to Page 1 of 2
            stage = page.locator('[data-testid="page-viewer-stage"]')
            sbox = stage.bounding_box()
            assert sbox is not None
            page.mouse.move(sbox["x"] + 80, sbox["y"] + sbox["height"] / 2)
            page.mouse.down()
            page.mouse.move(sbox["x"] + 280, sbox["y"] + sbox["height"] / 2, steps=8)
            page.mouse.up()
            page.wait_for_function(
                '() => document.querySelector(\'[data-testid="page-viewer-counter"]\')?.textContent?.includes("Page 1 of 2")',
                timeout=4000,
            )

            # Swipe left to go to Page 2 of 2
            page.mouse.move(sbox["x"] + 280, sbox["y"] + sbox["height"] / 2)
            page.mouse.down()
            page.mouse.move(sbox["x"] + 80, sbox["y"] + sbox["height"] / 2, steps=8)
            page.mouse.up()
            page.wait_for_function(
                '() => document.querySelector(\'[data-testid="page-viewer-counter"]\')?.textContent?.includes("Page 2 of 2")',
                timeout=4000,
            )

            # Close viewer
            page.locator('[data-testid="page-viewer-close"]').click()
            viewer.wait_for(state="hidden", timeout=4000)
            passed.append("page-viewer: Capture 2 pages, open viewer, swipe between pages, close")
            print("[e2e-p1.6] PASS page-viewer")

            # Tap Proceed -> opens LiveSheet at half detent
            page.locator('[data-testid="relay-proceed"]').click()
            sheet = page.locator('[data-testid="relay-live-sheet"]')
            sheet.wait_for(state="visible", timeout=6000)
            assert sheet.get_attribute("data-detent") == "half"
            page.screenshot(path=str(SHOTS_DIR / "sheet-half.png"))

            # Drag handle DOWN to collapse
            handle = page.locator('[data-testid="relay-sheet-handle"]')
            hbox = handle.bounding_box()
            assert hbox is not None
            page.mouse.move(hbox["x"] + hbox["width"] / 2, hbox["y"] + hbox["height"] / 2)
            page.mouse.down()
            page.mouse.move(hbox["x"] + hbox["width"] / 2, 810, steps=12)
            page.mouse.up()
            page.wait_for_function(
                '() => document.querySelector(\'[data-testid="relay-live-sheet"]\')?.getAttribute("data-detent") === "collapsed"',
                timeout=4000,
            )
            time.sleep(0.35)  # wait for 250 ms collapse & margin ease transition
            page.screenshot(path=str(SHOTS_DIR / "sheet-collapsed.png"))

            # Verify shutter stays reachable above collapsed bar
            shutter_box = shutter.bounding_box()
            sheet_box = sheet.bounding_box()
            assert shutter_box is not None and sheet_box is not None
            assert shutter_box["y"] + shutter_box["height"] <= sheet_box["y"] + 2, (
                f"Shutter overlapped by collapsed sheet: shutter={shutter_box} sheet={sheet_box}"
            )

            # Drag handle UP to half/full
            hbox2 = handle.bounding_box()
            assert hbox2 is not None
            page.mouse.move(hbox2["x"] + hbox2["width"] / 2, hbox2["y"] + hbox2["height"] / 2)
            page.mouse.down()
            page.mouse.move(hbox2["x"] + hbox2["width"] / 2, 240, steps=12)
            page.mouse.up()
            page.wait_for_function(
                '() => document.querySelector(\'[data-testid="relay-live-sheet"]\')?.getAttribute("data-detent") !== "collapsed"',
                timeout=4000,
            )
            passed.append("sheet-drag: Drag sheet down to collapsed (shutter reachable) and up to expanded")
            print("[e2e-p1.6] PASS sheet-drag")

            # Add page from sheet appends page 3
            page.locator('[data-testid="sheet-add-page-btn"]').click()
            page.locator('[data-testid="sheet-page-thumb-3"]').wait_for(state="visible", timeout=5000)
            page.screenshot(path=str(SHOTS_DIR / "sheet-page-3.png"))
            passed.append("sheet-add-page: Add page from sheet appends page 3 to same pages strip")
            print("[e2e-p1.6] PASS sheet-add-page")

            ctx.close()
            browser.close()

            # ── 3. "Tap to turn on sound" banner when AudioContext is forced suspended ──
            browser = p.chromium.launch(**launch_kwargs)
            ctx_sus = browser.new_context(
                viewport={"width": 390, "height": 844},
                ignore_https_errors=True,
                permissions=["camera", "microphone"],
            )
            ctx_sus.add_init_script(
                """
                (() => {
                  const OrigAC = window.AudioContext || window.webkitAudioContext;
                  if (!OrigAC) return;
                  class ForcedSuspendedAudioContext extends OrigAC {
                    constructor(...args) {
                      super(...args);
                      this._forcedSuspended = true;
                    }
                    get state() {
                      return this._forcedSuspended ? 'suspended' : super.state;
                    }
                    resume() {
                      if (window.__allowResumeAudio) {
                        this._forcedSuspended = false;
                        return super.resume();
                      }
                      return Promise.resolve();
                    }
                  }
                  window.AudioContext = ForcedSuspendedAudioContext;
                })();
                """
            )
            page_sus = ctx_sus.new_page()
            page_sus.goto(base_url, wait_until="domcontentloaded")
            advance_past_onboarding(page_sus)
            page_sus.locator('[data-testid="home-live-relay-card"]').click()
            page_sus.locator('[data-testid="relay-intro-start"]').click()
            wait_for_camera_ready(page_sus)
            # Wait for Live connect + 2s check -> sound banner visible
            banner = page_sus.locator('[data-testid="relay-sound-banner"]')
            banner.wait_for(state="visible", timeout=15000)
            page_sus.screenshot(path=str(SHOTS_DIR / "sound-banner.png"))
            # Tapping banner resumes and hides it
            page_sus.evaluate("() => { window.__allowResumeAudio = true; }")
            banner.click()
            banner.wait_for(state="hidden", timeout=4000)
            passed.append("sound-banner: Suspended AudioContext shows 'Tap to turn on sound' banner and tap resumes it")
            print("[e2e-p1.6] PASS sound-banner")
            ctx_sus.close()
            browser.close()

            # ── 4. Headless Gemini failure still shows friendly error card ──
            browser = p.chromium.launch(**launch_kwargs)
            ctx_err = browser.new_context(
                viewport={"width": 390, "height": 844},
                ignore_https_errors=True,
                permissions=["camera", "microphone"],
            )
            page_err = ctx_err.new_page()
            page_err.goto(base_url, wait_until="domcontentloaded")
            advance_past_onboarding(page_err)
            page_err.locator('[data-testid="home-live-relay-card"]').click()
            page_err.locator('[data-testid="relay-intro-start"]').wait_for(state="visible", timeout=5000)
            time.sleep(0.8)
            ctx_err.set_offline(True)
            page_err.locator('[data-testid="relay-intro-start"]').click()
            wait_for_camera_ready(page_err)
            err_card = page_err.locator('[data-testid="relay-error-card"]')
            err_card.wait_for(state="visible", timeout=15000)
            assert "ring/silent" in err_card.inner_text().lower() or "volume" in err_card.inner_text().lower()
            ctx_err.set_offline(False)
            passed.append("gemini-error: Headless Gemini failure shows friendly error card with sound help")
            print("[e2e-p1.6] PASS gemini-error")
            ctx_err.close()
            browser.close()

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    print("\n=== P1.6 PLAYWRIGHT E2E RESULTS ===")
    for item in passed:
        print(f"  PASS  {item}")
    print(f"Total passed: {len(passed)}/7")


if __name__ == "__main__":
    run_tests()
