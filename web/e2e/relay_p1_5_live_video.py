#!/usr/bin/env python3
"""
Phase P1.5 Playwright E2E test suite:
- 390x844 mobile: Live video mode (video, Gemini orb, status pill), mode switch
  preserving camera stream, Pause video stopping 1 fps frame count, End & save to
  Recent on Home, and headless Gemini failure friendly error card.
- 1280x800 desktop: 430 px centred column with dark teal surround for Intro & Camera.
Screenshots saved to docs/buildathon/shots/p1_5/.
"""

import re
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = REPO_ROOT / "web"
SHOTS_DIR = REPO_ROOT / "docs" / "buildathon" / "shots" / "p1_5"
PORT = 5176


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


def wait_for_live_video_frames(page):
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


def get_video_track_info(page):
    return page.evaluate(
        """
        () => {
          const v = document.querySelector('[data-testid="relay-camera-video"]');
          const track = v?.srcObject?.getVideoTracks?.()?.[0];
          return track ? { id: track.id, readyState: track.readyState } : null;
        }
        """
    )


def get_frames_sent(page) -> int:
    return page.evaluate("() => Number(window.__relayFramesSent || 0)")


def run_tests():
    SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    proc, base_url = start_vite_server()
    print(f"[e2e-p1.5] Vite dev server running at {base_url}")

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

            # ── 1. Mobile 390x844: Live video, mode switch, Pause video, End & Save ──
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                ignore_https_errors=True,
                permissions=["camera", "microphone"],
            )
            page = ctx.new_page()
            page.goto(base_url, wait_until="domcontentloaded")
            advance_past_onboarding(page)

            # Home -> Intro -> Start scanning -> CameraScreen (defaults to Live video)
            page.locator('[data-testid="home-live-relay-card"]').click()
            page.locator('[data-testid="relay-intro-start"]').wait_for(state="visible", timeout=5000)
            page.locator('[data-testid="relay-intro-start"]').click()
            wait_for_live_video_frames(page)

            # Assert Live video mode UI elements: video, orb, status pill, captions, mode switch
            cam = page.locator('[data-testid="relay-camera-screen"]')
            assert cam.get_attribute("data-relay-mode") == "live", "Expected default mode to be live"
            assert page.locator('[data-testid="relay-gemini-orb"]').is_visible(), "Gemini orb not visible"
            assert page.locator('[data-testid="relay-status-pill"]').is_visible(), "Status pill not visible"
            assert page.locator('[data-testid="relay-live-captions"]').is_visible(), "Captions bar not visible"
            assert page.locator('[data-testid="relay-mode-switch"]').is_visible(), "Mode switch pill not visible"
            page.screenshot(path=str(SHOTS_DIR / "mobile-live-video.png"))
            passed.append("mobile-live-ui: Live video mode shows live video, orb, status pill, captions")
            print("[e2e-p1.5] PASS mobile-live-ui")

            # Mode switch: Live video -> Scan pages -> Live video MUST preserve same camera track
            track_before = get_video_track_info(page)
            assert track_before and track_before["readyState"] == "live", f"Bad initial track: {track_before}"

            page.locator('[data-testid="relay-mode-scan"]').click()
            page.locator('[data-testid="relay-shutter"]').wait_for(state="visible", timeout=4000)
            track_in_scan = get_video_track_info(page)
            assert track_in_scan == track_before, f"Stream changed on switch to Scan: {track_before} -> {track_in_scan}"
            page.screenshot(path=str(SHOTS_DIR / "mobile-scan-pages.png"))

            page.locator('[data-testid="relay-mode-live"]').click()
            page.locator('[data-testid="relay-live-controls"]').wait_for(state="visible", timeout=4000)
            track_back_live = get_video_track_info(page)
            assert track_back_live == track_before, f"Stream changed on switch back to Live: {track_before} -> {track_back_live}"
            passed.append("mode-switch: Switching Live video <-> Scan pages preserves live camera stream")
            print("[e2e-p1.5] PASS mode-switch")

            # Pause video stops 1 fps frame counter
            # Wait for Live status pill to say "Live" (real Gemini Live socket connects in ~1-2s)
            page.wait_for_function(
                """
                () => {
                  const pill = document.querySelector('[data-testid="relay-status-pill"]');
                  return pill && pill.textContent && pill.textContent.trim() === 'Live';
                }
                """,
                timeout=12000,
            )
            # Wait until at least 2 frames have been sent
            page.wait_for_function("() => Number(window.__relayFramesSent || 0) >= 2", timeout=6000)
            frames_before_pause = get_frames_sent(page)
            assert frames_before_pause >= 2, f"Expected >=2 frames before pause, got {frames_before_pause}"

            # Tap Pause video
            page.locator('[data-testid="relay-pause-video-btn"]').click()
            page.locator('[data-testid="relay-paused-badge"]').wait_for(state="visible", timeout=3000)
            time.sleep(0.25)  # allow any in-flight toBlob microtask to settle
            frames_at_pause = get_frames_sent(page)
            page.screenshot(path=str(SHOTS_DIR / "mobile-video-paused.png"))
            time.sleep(2.4)
            frames_after_pause = get_frames_sent(page)
            assert frames_after_pause == frames_at_pause, (
                f"Expected 0 frames while paused, got {frames_at_pause} -> {frames_after_pause}"
            )

            # Resume video and verify frames resume
            page.locator('[data-testid="relay-pause-video-btn"]').click()
            page.wait_for_function(
                f"() => Number(window.__relayFramesSent || 0) > {frames_after_pause}",
                timeout=5000,
            )
            passed.append(f"pause-video: Frames sent ({frames_before_pause}), 0 during pause, resumed cleanly")
            print("[e2e-p1.5] PASS pause-video")

            # Tap End -> returns to Home and session appears in Recent
            page.locator('[data-testid="relay-end-btn"]').click()
            page.locator('[data-testid="home-live-relay-card"]').wait_for(state="visible", timeout=5000)
            # Wait for Recent list to show saved Live Relay session
            page.get_by_text("Live Relay session").first.wait_for(state="visible", timeout=5000)
            passed.append("end-and-save: End returns to Home and saved Live Relay session appears in Recent")
            print("[e2e-p1.5] PASS end-and-save")
            ctx.close()
            browser.close()

            # ── 2. Headless Gemini failure shows friendly error card ──
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
            time.sleep(0.8)  # allow preloaded CameraScreen module to finish loading
            # Cut network before entering Live video so Gemini auto-connect fails
            ctx_err.set_offline(True)
            page_err.locator('[data-testid="relay-intro-start"]').click()
            wait_for_live_video_frames(page_err)

            err_card = page_err.locator('[data-testid="relay-error-card"]')
            err_card.wait_for(state="visible", timeout=15000)
            assert page_err.locator('[data-testid="relay-error-retry"]').is_visible()
            assert page_err.locator('[data-testid="relay-error-home"]').is_visible()
            ctx_err.set_offline(False)
            page_err.screenshot(path=str(SHOTS_DIR / "mobile-gemini-error.png"), animations="disabled")
            page_err.locator('[data-testid="relay-error-home"]').click()
            page_err.locator('[data-testid="home-live-relay-card"]').wait_for(state="visible", timeout=5000)
            passed.append("gemini-error: Headless Gemini failure shows friendly error card with Try again & Back to Home")
            print("[e2e-p1.5] PASS gemini-error")
            ctx_err.close()

            # ── 3. Desktop 1280x800: 430 px centred column with dark teal surround ──
            browser.close()
            browser = p.chromium.launch(**launch_kwargs)
            ctx_desk = browser.new_context(
                viewport={"width": 1280, "height": 800},
                ignore_https_errors=True,
                permissions=["camera", "microphone"],
            )
            page_desk = ctx_desk.new_page()
            page_desk.goto(base_url, wait_until="domcontentloaded")
            advance_past_onboarding(page_desk)
            page_desk.locator('[data-testid="home-live-relay-card"]').click()
            page_desk.locator('[data-testid="relay-intro-screen"]').wait_for(state="visible", timeout=5000)

            intro_col = page_desk.locator(".lr-root").bounding_box()
            assert intro_col is not None
            assert intro_col["width"] <= 430.5, f"Desktop intro column too wide: {intro_col}"
            intro_center = intro_col["x"] + intro_col["width"] / 2
            assert abs(intro_center - 640) <= 2.5, f"Desktop intro column not centred: {intro_col}"
            page_desk.screenshot(path=str(SHOTS_DIR / "desktop-intro-1280x800.png"))

            page_desk.locator('[data-testid="relay-intro-start"]').click()
            wait_for_live_video_frames(page_desk)

            cam_col = page_desk.locator('[data-testid="relay-camera-screen"]').bounding_box()
            assert cam_col is not None
            assert cam_col["width"] <= 430.5, f"Desktop camera column too wide: {cam_col}"
            cam_center = cam_col["x"] + cam_col["width"] / 2
            assert abs(cam_center - 640) <= 2.5, f"Desktop camera column not centred: {cam_col}"
            outer_bg = page_desk.evaluate(
                "() => getComputedStyle(document.querySelector('[data-testid=\"relay-camera-outer\"]')).backgroundColor"
            )
            assert outer_bg == "rgb(33, 77, 71)", f"Expected dark teal rgb(33, 77, 71) surround, got {outer_bg}"
            vid_fit = page_desk.evaluate(
                "() => getComputedStyle(document.querySelector('[data-testid=\"relay-camera-video\"]')).objectFit"
            )
            assert vid_fit == "cover", f"Expected object-fit: cover, got {vid_fit}"
            page_desk.screenshot(path=str(SHOTS_DIR / "desktop-live-video-1280x800.png"))
            passed.append("desktop-1280x800: Intro & Camera centred in 430px column over dark teal with object-fit cover")
            print("[e2e-p1.5] PASS desktop-1280x800")
            ctx_desk.close()

            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    print("\n=== P1.5 PLAYWRIGHT E2E RESULTS ===")
    for item in passed:
        print(f"  PASS  {item}")
    print(f"Total passed: {len(passed)}/6")


if __name__ == "__main__":
    run_tests()
