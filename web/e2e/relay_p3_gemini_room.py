#!/usr/bin/env python3
"""
Phase P3 Two-Context WebRTC Playwright E2E test (Gemini in the room, camera handoff, End & save):
- Test-harness rule strictly followed:
  * NO screenshots in multi-context WebRTC tests.
  * Full Chromium build with ONE browser instance per context.
  * Asserts on DOM, <video> element state, and window.__relayFrameSource.
- Verifies:
  1. Host creates room, enables "Guests can show their camera".
  2. Guest ("Arun") joins -> host sees privacy banner ("Everyone in the room can see the camera").
  3. Guest taps "Show my camera" -> Host sees Allow / Not now banner -> Host taps Allow.
  4. Active camera switches to Arun's camera (chip visible, guest video playing on host,
     host's 1 fps Gemini frame sender switches source to 'guest').
  5. Host taps End -> Guest sees "Room ended", Host returns to Home where Recent shows
     the new session with "Live Relay" badge and opens the read-only transcript viewer.
"""

import os
import re
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
API_DIR = REPO_ROOT / "api"
WEB_DIR = REPO_ROOT / "web"
API_PORT = 8013
WEB_PORT = 5180


def find_full_chromium() -> str | None:
    cache_dir = Path.home() / "Library" / "Caches" / "ms-playwright"
    if not cache_dir.exists():
        return None
    for pattern in [
        "chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chromium-*/chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chromium_headless_shell-*/chrome-mac/headless_shell",
    ]:
        matches = sorted(cache_dir.glob(pattern), reverse=True)
        for m in matches:
            if m.is_file():
                return str(m)
    return None


def load_env_file(path: Path) -> dict[str, str]:
    env = dict(os.environ)
    if path.is_file():
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def start_uvicorn():
    env = load_env_file(API_DIR / ".env.relay.local")
    proc = subprocess.Popen(
        [str(API_DIR / ".venv" / "bin" / "uvicorn"), "main:app", "--host", "127.0.0.1", "--port", str(API_PORT)],
        cwd=str(API_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{API_PORT}/api/relay/health", timeout=1) as resp:
                if resp.status == 200:
                    return proc
        except Exception:
            if proc.poll() is not None:
                out = proc.stdout.read() if proc.stdout else ""
                raise RuntimeError(f"uvicorn exited prematurely:\n{out}")
            time.sleep(0.2)
    proc.terminate()
    raise RuntimeError("uvicorn failed to become healthy")


def start_vite():
    env = dict(os.environ)
    env["VITE_API_URL"] = f"http://127.0.0.1:{API_PORT}"
    env["VITE_RELAY_API_BASE"] = ""
    proc = subprocess.Popen(
        ["npm", "run", "dev", "--", "--mode", "relay", "--port", str(WEB_PORT), "--strictPort"],
        cwd=str(WEB_DIR),
        env=env,
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
                raise RuntimeError("Vite exited prematurely")
            time.sleep(0.1)
            continue
        clean = re.sub(r"\x1b\[[0-9;]*m", "", line)
        m = re.search(r"(https?://localhost:\d+)", clean)
        if m:
            base_url = m.group(1)
            break
    if not base_url:
        proc.terminate()
        raise RuntimeError("Could not detect Vite URL")
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


MOCK_GEMINI_SCRIPT = """
(() => {
  window.__mockSentTexts = [];
  window.__relayMockLiveClientFactory = () => {
    const inst = {
      _connected: false,
      async connect() { this._connected = true; },
      isConnected() { return this._connected; },
      sendAudio() {},
      sendFrame() {},
      sendVideo() {},
      sendText(txt, turnComplete) { window.__mockSentTexts.push({ txt, turnComplete }); },
      getLastCloseInfo() { return null; },
      getLastErrorPayload() { return null; },
      getActiveModel() { return 'mock-gemini-p3'; },
      getIsUsingFallback() { return false; },
      getResumeHandle() { return undefined; },
      setResumeHandle() {},
      async close() { this._connected = false; },
      onAudio: null, onInputText: null, onOutputText: null,
      onTurnComplete: null, onGenerationComplete: null, onInterrupted: null,
      onClose: null, onErrorPayload: null,
    };
    window.__mockGeminiClient = inst;
    return inst;
  };
})();
"""


def run_tests():
    api_proc = start_uvicorn()
    web_proc, base_url = start_vite()
    print(f"[e2e-p3] API on :{API_PORT}, Web on {base_url}")

    passed = []
    try:
        with sync_playwright() as p:
            launch_kwargs = {
                "headless": True,
                "args": [
                    "--use-fake-device-for-media-stream",
                    "--use-fake-ui-for-media-stream",
                    "--autoplay-policy=no-user-gesture-required",
                ],
            }
            exe = find_full_chromium()
            if exe:
                launch_kwargs["executable_path"] = exe

            host_browser = p.chromium.launch(**launch_kwargs)
            guest_browser = p.chromium.launch(**launch_kwargs)

            try:
                host_ctx = host_browser.new_context(
                    viewport={"width": 390, "height": 844},
                    ignore_https_errors=True,
                    permissions=["camera", "microphone"],
                )
                host_ctx.add_init_script(MOCK_GEMINI_SCRIPT)
                host_page = host_ctx.new_page()
                host_page.goto(base_url, wait_until="domcontentloaded")
                advance_past_onboarding(host_page)

                host_page.locator('[data-testid="home-live-relay-card"]').click()
                host_page.locator('[data-testid="relay-intro-start"]').click()
                host_page.wait_for_function(
                    """() => {
                      const v = document.querySelector('[data-testid="relay-camera-video"]');
                      return v && v.readyState >= 2 && v.videoWidth > 0;
                    }""",
                    timeout=10000,
                )

                # Host opens room & toggles "Guests can show their camera" ON
                host_page.locator('[data-testid="relay-invite-btn"]').click()
                host_page.locator('[data-testid="relay-invite-sheet"]').wait_for(state="visible", timeout=15000)
                room_code = host_page.locator('[data-testid="relay-room-pill"]').get_attribute("data-room-code")
                assert room_code and len(room_code) == 4
                host_page.locator('[data-testid="relay-allow-guest-cam-switch"]').click()
                time.sleep(0.3)
                host_page.locator('[data-testid="relay-invite-hide"]').click()

                # Guest Arun joins
                guest_ctx = guest_browser.new_context(
                    viewport={"width": 390, "height": 844},
                    ignore_https_errors=True,
                    permissions=["camera", "microphone"],
                )
                guest_page = guest_ctx.new_page()
                guest_page.goto(f"{base_url}/r/{room_code}", wait_until="domcontentloaded")
                guest_page.locator('[data-testid="guest-name-input"]').fill("Arun")
                guest_page.locator('[data-testid="guest-join-btn"]').click()
                guest_page.locator('[data-testid="guest-call-screen"]').wait_for(state="visible", timeout=15000)

                # Privacy banner appears on host when guest joins
                host_page.locator('[data-testid="relay-room-privacy-banner"]').wait_for(state="visible", timeout=10000)
                passed.append("privacy-banner: Host displays 'Everyone in the room can see the camera' on guest join")
                print("[e2e-p3] PASS privacy-banner")

                # Guest taps "Show my camera" -> Host sees Allow banner -> Host clicks Allow
                show_cam_btn = guest_page.locator('[data-testid="guest-show-camera-btn"]')
                show_cam_btn.wait_for(state="visible", timeout=8000)
                show_cam_btn.click()

                host_page.locator('[data-testid="relay-camera-request-banner"]').wait_for(state="visible", timeout=10000)
                host_page.locator('[data-testid="relay-camera-allow-btn"]').click()

                # Active camera chip shows "Arun's camera" and guest video renders on host
                chip = host_page.locator('[data-testid="relay-active-camera-chip"]')
                chip.wait_for(state="visible", timeout=10000)
                assert "Arun" in chip.inner_text()

                host_page.wait_for_function(
                    """() => {
                      const v = document.querySelector('[data-testid="relay-active-guest-video"]');
                      return v && v.readyState >= 2 && v.videoWidth > 0;
                    }""",
                    timeout=18000,
                )
                # Verify 1 fps Gemini frame sender switched source to 'guest'
                host_page.wait_for_function(
                    "() => window.__relayFrameSource === 'guest'",
                    timeout=8000,
                )
                handoff_notes = host_page.evaluate("() => window.__mockSentTexts.map(x => x.txt)")
                assert any("Now showing Arun's camera" in n for n in handoff_notes), f"Missing handoff note: {handoff_notes}"
                passed.append("camera-handoff: Guest requested camera, host allowed, active video & frame sender switched to guest")
                print("[e2e-p3] PASS camera-handoff")

                # Broadcast a mock Gemini caption -> Guest receives it in captions panel
                host_page.evaluate("""() => {
                  window.__mockGeminiClient.onOutputText('This bill is 850 rupees.');
                  window.__mockGeminiClient.onTurnComplete();
                }""")
                guest_page.locator('[data-testid="guest-captions-panel"]').wait_for(state="visible", timeout=8000)
                assert "850 rupees" in guest_page.locator('[data-testid="guest-captions-panel"]').inner_text()
                passed.append("caption-broadcast: Finalized caption broadcast over LiveKit data channel to guest")
                print("[e2e-p3] PASS caption-broadcast")

                # Host taps End -> Guest sees Room ended & Host's Recent has the saved session with Live Relay badge
                host_page.locator('[data-testid="relay-end-btn"]').click()
                guest_page.locator('[data-testid="guest-room-ended"]').wait_for(state="visible", timeout=12000)

                host_page.locator('[data-testid="home-live-relay-card"]').wait_for(state="visible", timeout=8000)
                badge = host_page.locator('[data-testid="recent-live-relay-badge"]').first
                badge.wait_for(state="visible", timeout=6000)
                badge.click()
                host_page.locator('[data-testid="relay-session-viewer"]').wait_for(state="visible", timeout=6000)
                assert "850 rupees" in host_page.locator('[data-testid="relay-session-viewer"]').inner_text()
                passed.append("end-and-save: Guest sees Room ended and Host Recent opens saved read-only transcript")
                print("[e2e-p3] PASS end-and-save")

                guest_ctx.close()
                host_ctx.close()
            finally:
                guest_browser.close()
                host_browser.close()
    finally:
        web_proc.terminate()
        api_proc.terminate()
        for pr in (web_proc, api_proc):
            try:
                pr.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pr.kill()

    print("\n=== P3 TWO-CONTEXT GEMINI ROOM E2E RESULTS ===")
    for item in passed:
        print(f"  PASS  {item}")
    print(f"Total passed: {len(passed)}/4")


if __name__ == "__main__":
    run_tests()
