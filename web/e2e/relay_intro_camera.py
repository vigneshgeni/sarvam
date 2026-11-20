#!/usr/bin/env python3
"""
Playwright E2E test suite for Live Relay intro, tap-path fix, camera frames,
error states, reduced motion, and browser history back navigation.

Runs at 390x844 with Chromium fake media flags against a live Vite dev server.
"""

import os
import re
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = REPO_ROOT / "web"
SHOTS_DIR = REPO_ROOT / "docs" / "buildathon" / "shots" / "intro"
PORT = 5175


def boxes_intersect(a: dict, b: dict) -> bool:
    return not (
        a["x"] + a["width"] <= b["x"] + 0.5
        or b["x"] + b["width"] <= a["x"] + 0.5
        or a["y"] + a["height"] <= b["y"] + 0.5
        or b["y"] + b["height"] <= a["y"] + 0.5
    )


def assert_intro_layout(page, label: str):
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
        assert el.is_visible(), f"[{label}] Expected {name} ({sel}) to be visible"
        box = el.bounding_box()
        assert box is not None, f"[{label}] Bounding box missing for {name}"
        assert box["x"] >= -0.5 and box["x"] + box["width"] <= 390.5, (
            f"[{label}] {name} overflows horizontally: {box}"
        )
        assert box["y"] >= -0.5 and box["y"] + box["height"] <= 844.5, (
            f"[{label}] {name} overflows vertically (clipped off 844px): {box}"
        )
        boxes[name] = box

    assert boxes["start"]["height"] >= 44, f"[{label}] Start button < 44px: {boxes['start']}"
    assert boxes["skip"]["height"] >= 44, f"[{label}] Skip button < 44px: {boxes['skip']}"

    names = list(boxes.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            n1, n2 = names[i], names[j]
            assert not boxes_intersect(boxes[n1], boxes[n2]), (
                f"[{label}] Overlap detected between {n1} {boxes[n1]} and {n2} {boxes[n2]}"
            )


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


def advance_past_onboarding_if_present(page):
    skip_btn = page.get_by_role("button", name="Skip")
    relay_card = page.locator('[data-testid="home-live-relay-card"]')
    # Wait briefly for either Onboarding Skip or Home Live Relay card
    for _ in range(30):
        if relay_card.is_visible():
            return
        if skip_btn.is_visible():
            skip_btn.click()
            relay_card.wait_for(state="visible", timeout=5000)
            return
        time.sleep(0.1)
    relay_card.wait_for(state="visible", timeout=5000)


def install_gum_spy(context):
    context.add_init_script(
        """
        window.__relayGumCalls = 0;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = function(...args) {
            window.__relayGumCalls += 1;
            return orig(...args);
          };
        }
        """
    )


def assert_camera_live(page, label: str):
    cam = page.locator('[data-testid="relay-camera-screen"]')
    cam.wait_for(state="visible", timeout=5000)
    video = page.locator('[data-testid="relay-camera-video"]')
    video.wait_for(state="visible", timeout=5000)

    # Wait for live video frames
    page.wait_for_function(
        """
        () => {
          const v = document.querySelector('[data-testid="relay-camera-video"]');
          return v && v.srcObject && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0;
        }
        """,
        timeout=8000,
    )
    props = page.evaluate(
        """
        () => {
          const v = document.querySelector('[data-testid="relay-camera-video"]');
          return {
            playsInline: v.playsInline,
            muted: v.muted,
            autoplay: v.autoplay,
            paused: v.paused,
            videoWidth: v.videoWidth,
            videoHeight: v.videoHeight,
            readyState: v.readyState,
          };
        }
        """
    )
    assert props["playsInline"] is True, f"[{label}] video missing playsInline: {props}"
    assert props["muted"] is True, f"[{label}] video missing muted: {props}"
    assert props["autoplay"] is True, f"[{label}] video missing autoplay: {props}"
    assert props["videoWidth"] > 0 and props["videoHeight"] > 0, f"[{label}] video has 0 dimensions: {props}"
    assert props["paused"] is False, f"[{label}] video is paused: {props}"


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


def run_tests():
    SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    proc, base_url = start_vite_server()
    print(f"[e2e] Vite dev server running at {base_url}")

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
            browser = p.chromium.launch(**launch_kwargs)

            # ── Context 1: Full flow (2a, 2b, 2c, 2d, 2e, 2h) ──────────
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                ignore_https_errors=True,
                permissions=["camera", "microphone"],
            )
            install_gum_spy(ctx)
            page = ctx.new_page()
            relay_logs = []
            page.on("console", lambda msg: relay_logs.append(msg.text) if "[relay]" in msg.text else None)

            page.goto(base_url, wait_until="domcontentloaded")
            advance_past_onboarding_if_present(page)

            # 2a: Home shows Live Relay card; tapping opens intro; no camera permission requested yet
            relay_card = page.locator('[data-testid="home-live-relay-card"]')
            assert relay_card.is_visible(), "Home Live Relay card not visible"
            relay_card.click()

            intro = page.locator('[data-testid="relay-intro-screen"]')
            intro.wait_for(state="visible", timeout=5000)
            gum_count = page.evaluate("() => window.__relayGumCalls")
            assert gum_count == 0, f"Expected 0 getUserMedia calls on intro, got {gum_count}"

            # Check focus order: Start scanning -> Skip
            page.locator('[data-testid="relay-intro-start"]').focus()
            page.keyboard.press("Tab")
            focused_id = page.evaluate("() => document.activeElement?.getAttribute('data-testid')")
            assert focused_id == "relay-intro-skip", f"Focus order wrong: expected relay-intro-skip, got {focused_id}"
            page.evaluate("() => document.activeElement?.blur()")
            passed.append("2a: Home -> Intro without camera prompt + Start->Skip focus order")
            print("[e2e] PASS 2a")

            # 2b & 2c: Screenshots & bounding-box checks at 2s, 9s, 16s
            t0 = time.time()
            for target_sec, fname in [(2.0, "intro-02s.png"), (9.0, "intro-09s.png"), (16.0, "intro-16s.png")]:
                remaining = target_sec - (time.time() - t0)
                if remaining > 0:
                    time.sleep(remaining)
                assert_intro_layout(page, f"t={int(target_sec)}s")
                page.screenshot(path=str(SHOTS_DIR / fname))
            passed.append("2b+2c: Intro screenshots & non-overlapping bounding boxes at 2s, 9s, 16s")
            print("[e2e] PASS 2b+2c")

            # 2d: Start scanning -> permissions requested -> live video frames -> Escape returns to intro
            page.locator('[data-testid="relay-intro-start"]').click()
            assert_camera_live(page, "Start scanning")
            gum_count_after = page.evaluate("() => window.__relayGumCalls")
            assert gum_count_after >= 1, f"Expected getUserMedia called on Start scanning, got {gum_count_after}"

            # Verify visibilitychange simulation does NOT bounce off CameraScreen (iOS regression check)
            page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
            time.sleep(0.3)
            assert page.locator('[data-testid="relay-camera-screen"]').is_visible(), (
                "CameraScreen vanished after visibilitychange!"
            )

            # Verify console.info('[relay] ...') logs
            joined_logs = "\n".join(relay_logs)
            for token in ["[relay] tap", "[relay] permission granted", "[relay] stream started", "[relay] first frame"]:
                assert token in joined_logs, f"Missing expected log '{token}' in:\n{joined_logs}"

            # Press Escape -> returns to Intro
            page.keyboard.press("Escape")
            intro.wait_for(state="visible", timeout=5000)
            passed.append("2d: Start scanning -> live video frames + Safari logs + Escape back to Intro")
            print("[e2e] PASS 2d")

            # 2e: Skip -> same destination as Start scanning (CameraScreen with live video)
            page.locator('[data-testid="relay-intro-skip"]').click()
            assert_camera_live(page, "Skip")
            passed.append("2e: Skip opens CameraScreen with live video frames")
            print("[e2e] PASS 2e")

            # 2h: Browser back gesture/history from CameraScreen -> Intro -> Home
            pre_back = page.evaluate("() => ({len: history.length, state: history.state})")
            page.go_back()
            try:
                intro.wait_for(state="visible", timeout=5000)
            except Exception:
                post_back = page.evaluate("() => ({len: history.length, state: history.state, html: document.body.innerText.slice(0, 200)})")
                print(f"[e2e] DEBUG go_back1 pre={pre_back} post={post_back}")
                raise
            page.go_back()
            relay_card.wait_for(state="visible", timeout=5000)
            passed.append("2h: Browser back history CameraScreen -> Intro -> Home")
            print("[e2e] PASS 2h")

            ctx.close()

            # ── Context 2: Headless Gemini cannot connect (2f) ─────────
            ctx_err = browser.new_context(
                viewport={"width": 390, "height": 844},
                ignore_https_errors=True,
                permissions=["camera", "microphone"],
            )
            page_err = ctx_err.new_page()
            page_err.goto(base_url, wait_until="domcontentloaded")
            advance_past_onboarding_if_present(page_err)
            page_err.locator('[data-testid="home-live-relay-card"]').click()
            page_err.locator('[data-testid="relay-intro-start"]').wait_for(state="visible", timeout=5000)
            page_err.locator('[data-testid="relay-intro-start"]').click()
            assert_camera_live(page_err, "Gemini error flow")

            # Capture 1 page, then cut network so Gemini Live cannot connect
            page_err.locator('[data-testid="relay-shutter"]').click()
            proceed_btn = page_err.locator('[data-testid="relay-proceed"]')
            proceed_btn.wait_for(state="visible", timeout=5000)
            ctx_err.set_offline(True)
            proceed_btn.click()

            err_card = page_err.locator('[data-testid="relay-error-card"]')
            err_card.wait_for(state="visible", timeout=15000)
            retry_btn = page_err.locator('[data-testid="relay-error-retry"]')
            home_btn = page_err.locator('[data-testid="relay-error-home"]')
            assert retry_btn.is_visible() and "Try again" in retry_btn.inner_text()
            assert home_btn.is_visible() and "Back to Home" in home_btn.inner_text()

            # Back to Home button works cleanly
            ctx_err.set_offline(False)
            home_btn.click()
            page_err.locator('[data-testid="home-live-relay-card"]').wait_for(state="visible", timeout=5000)
            passed.append("2f: Headless Gemini failure shows friendly error with Try again & Back to Home")
            print("[e2e] PASS 2f")
            ctx_err.close()

            # ── Context 3: Reduced motion (2g) ─────────────────────────
            ctx_rm = browser.new_context(
                viewport={"width": 390, "height": 844},
                ignore_https_errors=True,
                reduced_motion="reduce",
            )
            page_rm = ctx_rm.new_page()
            page_rm.goto(base_url, wait_until="domcontentloaded")
            advance_past_onboarding_if_present(page_rm)
            page_rm.locator('[data-testid="home-live-relay-card"]').click()
            page_rm.locator('[data-testid="relay-intro-screen"]').wait_for(state="visible", timeout=5000)

            static_list = page_rm.locator('[data-testid="relay-intro-static-list"]')
            assert static_list.is_visible(), "Static 3-step list not visible under prefers-reduced-motion"
            anim_shell = page_rm.locator('[data-testid="relay-intro-animated-shell"]')
            assert not anim_shell.is_visible(), "Animated shell should be hidden under prefers-reduced-motion"

            anim_name = page_rm.evaluate(
                "() => getComputedStyle(document.querySelector('.lr-sc1')).animationName"
            )
            assert anim_name == "none", f"Expected animationName 'none' in reduced motion, got '{anim_name}'"

            # Verify buttons do not overlap static list
            b_list = static_list.bounding_box()
            b_start = page_rm.locator('[data-testid="relay-intro-start"]').bounding_box()
            b_skip = page_rm.locator('[data-testid="relay-intro-skip"]').bounding_box()
            assert b_list and b_start and b_skip
            assert not boxes_intersect(b_list, b_start), f"Reduced-motion overlap list/start: {b_list} vs {b_start}"
            assert not boxes_intersect(b_start, b_skip), f"Reduced-motion overlap start/skip: {b_start} vs {b_skip}"
            passed.append("2g: prefers-reduced-motion shows static 3-step list with zero animations")
            print("[e2e] PASS 2g")
            ctx_rm.close()

            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    print("\n=== PLAYWRIGHT E2E RESULTS ===")
    for item in passed:
        print(f"  PASS  {item}")
    print(f"Total passed: {len(passed)}/7")


if __name__ == "__main__":
    run_tests()
