#!/usr/bin/env python3
"""
Phase P2 Two-Context WebRTC Playwright E2E test against local Vite + local uvicorn + real LiveKit Cloud:
- Test-harness rule strictly followed:
  * NO screenshots in multi-context WebRTC tests (prevents macOS compositor hang).
  * Uses full Chromium build with ONE browser instance per context.
  * Asserts on DOM and <video> element state (videoWidth > 0, readyState >= 2).
- Verifies:
  1. Host creates a room via Invite family -> gets 4-char code & connects to LiveKit Cloud.
  2. Wrong code on guest /r/ZZZZ shows friendly error.
  3. Guest opens /r/<CODE>, joins with mic on -> subscribes to host's video track
     (<video> videoWidth > 0, readyState >= 2) and host sees guest in the room member list.
  4. End on host shows "Room ended" screen on guest.
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
API_PORT = 8012
WEB_PORT = 5179


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


# Mock Gemini Live client on host so LiveKit WebRTC test doesn't depend on external Gemini network latency
MOCK_GEMINI_SCRIPT = """
(() => {
  window.__relayMockLiveClientFactory = () => ({
    _connected: false,
    async connect() { this._connected = true; },
    isConnected() { return this._connected; },
    sendAudio() {},
    sendFrame() {},
    sendVideo() {},
    sendText() {},
    getLastCloseInfo() { return null; },
    getLastErrorPayload() { return null; },
    getActiveModel() { return 'mock-gemini'; },
    getIsUsingFallback() { return false; },
    getResumeHandle() { return undefined; },
    setResumeHandle() {},
    async close() { this._connected = false; },
    onAudio: null, onInputText: null, onOutputText: null,
    onTurnComplete: null, onGenerationComplete: null, onInterrupted: null,
    onClose: null, onErrorPayload: null,
  });
})();
"""


def run_tests():
    api_proc = start_uvicorn()
    web_proc, base_url = start_vite()
    print(f"[e2e-p2] API on :{API_PORT}, Web on {base_url}")

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

            # One browser instance per context (macOS WebRTC harness rule; NO screenshots)
            host_browser = p.chromium.launch(**launch_kwargs)
            guest_browser = p.chromium.launch(**launch_kwargs)

            try:
                # ── 1. Host opens Live Relay and creates room ──
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

                host_page.locator('[data-testid="relay-invite-btn"]').click()
                host_page.locator('[data-testid="relay-invite-sheet"]').wait_for(state="visible", timeout=15000)
                room_code = host_page.locator('[data-testid="relay-room-pill"]').get_attribute("data-room-code")
                assert room_code and len(room_code) == 4, f"Invalid room code: {room_code}"
                passed.append(f"host-create: Host created LiveKit room {room_code}")
                print(f"[e2e-p2] PASS host-create ({room_code})")

                # ── 2. Guest with bad code sees friendly error ──
                guest_ctx = guest_browser.new_context(
                    viewport={"width": 390, "height": 844},
                    ignore_https_errors=True,
                    permissions=["camera", "microphone"],
                )
                guest_page = guest_ctx.new_page()
                guest_page.goto(f"{base_url}/r/ZZZZ", wait_until="domcontentloaded")
                guest_page.locator('[data-testid="guest-join-card"]').wait_for(state="visible", timeout=6000)
                guest_page.locator('[data-testid="guest-name-input"]').fill("Amma")
                guest_page.locator('[data-testid="guest-join-btn"]').click()
                guest_page.locator('[data-testid="guest-join-error"]').wait_for(state="visible", timeout=6000)
                passed.append("guest-bad-code: Wrong room code ZZZZ shows friendly error")
                print("[e2e-p2] PASS guest-bad-code")

                # ── 3. Guest joins real room and receives host's LiveKit video track ──
                guest_page.goto(f"{base_url}/r/{room_code}", wait_until="domcontentloaded")
                guest_page.locator('[data-testid="guest-join-card"]').wait_for(state="visible", timeout=6000)
                guest_page.locator('[data-testid="guest-name-input"]').fill("Amma")
                guest_page.locator('[data-testid="guest-join-btn"]').click()
                guest_page.locator('[data-testid="guest-call-screen"]').wait_for(state="visible", timeout=15000)

                # Assert remote video element subscribed and decoding frames (videoWidth > 0, readyState >= 2)
                guest_page.wait_for_function(
                    """() => {
                      const v = document.querySelector('[data-testid="guest-remote-video"]');
                      return v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0;
                    }""",
                    timeout=20000,
                )
                passed.append("guest-video: Guest subscribed to host video track (videoWidth > 0, readyState >= 2)")
                print("[e2e-p2] PASS guest-video")

                # Assert host sees "Amma" in the room member list
                host_page.wait_for_function(
                    """() => {
                      const list = document.querySelector('[data-testid="relay-room-members"]');
                      return list && list.textContent && list.textContent.includes('Amma');
                    }""",
                    timeout=10000,
                )
                passed.append("host-sees-guest: Host member list shows Amma")
                print("[e2e-p2] PASS host-sees-guest")

                # ── 4. Host taps End -> Guest sees "Room ended" ──
                host_page.locator('[data-testid="relay-invite-hide"]').click()
                host_page.locator('[data-testid="relay-end-btn"]').click()
                guest_page.locator('[data-testid="guest-room-ended"]').wait_for(state="visible", timeout=12000)
                passed.append("host-end-guest-ended: End on host shows Room ended screen on guest")
                print("[e2e-p2] PASS host-end-guest-ended")

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

    print("\n=== P2 TWO-CONTEXT WEBRTC E2E RESULTS ===")
    for item in passed:
        print(f"  PASS  {item}")
    print(f"Total passed: {len(passed)}/5")


if __name__ == "__main__":
    run_tests()
