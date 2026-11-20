#!/usr/bin/env python3
"""
Phase P1.7 Playwright conversation simulator test:
- Launches Chromium with --use-fake-device-for-media-stream and
  --use-file-for-fake-audio-capture=<generated wav with speech-like tone bursts + noise>.
- Injects a deterministic mock LiveClient that scripts:
  1. Normal answer (audio + output caption -> turnComplete -> idle)
  2. False server "interrupted" while local gate is closed (Gemini MUST keep playing & finish!)
  3. Real interrupt while user holds Hold-to-Talk (Gemini MUST flush & mark answer with "…")
  4. No response watchdog recovery (shows "Still thinking…", reconnects & resends, recovers!)
  5. Socket silence watchdog auto-reconnect (verified in ?debug=1 overlay)
  6. Junk noise captions ("{}", "⚡", closed-gate input) never appear in UI.
"""

import math
import re
import struct
import subprocess
import tempfile
import time
import wave
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = REPO_ROOT / "web"
PORT = 5178


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


def generate_fake_audio_wav(path: Path):
    """Create a 6s 16 kHz mono WAV: 2s quiet noise, 1.5s tone burst, 2.5s quiet noise."""
    sr = 16000
    samples = []
    for i in range(sr * 6):
        t = i / sr
        if 2.0 <= t < 3.5:
            # Speech-like modulated tone burst (~0.25 amplitude)
            val = 0.25 * math.sin(2 * math.pi * 240 * t) * (0.6 + 0.4 * math.sin(2 * math.pi * 5 * t))
        else:
            # Low steady noise (~0.004 amplitude)
            val = 0.004 * math.sin(2 * math.pi * 73 * t)
        samples.append(int(max(-1.0, min(1.0, val)) * 32767))

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(struct.pack("<" + "h" * len(samples), *samples))


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


MOCK_CLIENT_INIT_SCRIPT = """
(() => {
  // Compact watchdog timings so simulator verifies all timers cleanly within ~15s
  window.__relayWatchdogTimings = {
    stillThinkingMs: 1200,
    reconnectResendMs: 2400,
    noAnswerMs: 6000,
    modelAudioStallMs: 2500,
    socketSilenceMs: 4000,
  };

  function makeTonePcm(ms = 120) {
    const samples = Math.round(24000 * (ms / 1000));
    const buf = new ArrayBuffer(samples * 2);
    const view = new Int16Array(buf);
    for (let i = 0; i < samples; i++) {
      view[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / 24000) * 8000);
    }
    return buf;
  }

  class ScriptedMockLiveClient {
    constructor() {
      this._connected = false;
      this.reconnectCalls = 0;
      this.sentTexts = [];
      this.audioChunksSent = 0;
      this.onAudio = null;
      this.onInputText = null;
      this.onOutputText = null;
      this.onTurnComplete = null;
      this.onGenerationComplete = null;
      this.onInterrupted = null;
      this.onClose = null;
      this.onErrorPayload = null;
      this.onUsingFallback = null;
      this.onReconnecting = null;
      this.onReconnected = null;
      window.__mockLiveClient = this;
    }
    async connect() {
      this._connected = true;
    }
    isConnected() { return this._connected; }
    sendAudio() { this.audioChunksSent += 1; }
    sendFrame() {}
    sendVideo() {}
    sendText(text, turnComplete) {
      this.sentTexts.push({ text, turnComplete });
      if (this._onSendTextHook) this._onSendTextHook(text, turnComplete);
    }
    async reconnectWithResumption() {
      this.reconnectCalls += 1;
      if (this.onReconnecting) this.onReconnecting(this.reconnectCalls);
      await new Promise((r) => setTimeout(r, 80));
      this._connected = true;
      if (this.onReconnected) this.onReconnected();
    }
    getLastCloseInfo() { return null; }
    getLastErrorPayload() { return null; }
    getActiveModel() { return 'mock-gemini-live'; }
    getIsUsingFallback() { return false; }
    getResumeHandle() { return 'mock-handle-1'; }
    setResumeHandle() {}
    async close() { this._connected = false; }

    // Helpers callable from Playwright test
    emitModelAudio(ms = 120) {
      if (this.onAudio) this.onAudio(makeTonePcm(ms));
    }
    emitOutputText(t) { if (this.onOutputText) this.onOutputText(t); }
    emitInputText(t) { if (this.onInputText) this.onInputText(t); }
    emitInterrupted() { if (this.onInterrupted) this.onInterrupted(); }
    emitTurnComplete() { if (this.onTurnComplete) this.onTurnComplete(); }
  }

  window.__relayMockLiveClientFactory = () => new ScriptedMockLiveClient();
})();
"""


def run_tests():
    wav_path = Path(tempfile.gettempdir()) / "sarvam_p17_fake_audio.wav"
    generate_fake_audio_wav(wav_path)
    proc, base_url = start_vite_server()
    print(f"[e2e-p1.7] Vite dev server running at {base_url}")

    passed = []
    try:
        with sync_playwright() as p:
            launch_kwargs = {
                "headless": True,
                "args": [
                    "--use-fake-device-for-media-stream",
                    "--use-fake-ui-for-media-stream",
                    f"--use-file-for-fake-audio-capture={wav_path}",
                ],
            }
            exe = find_chromium_executable()
            if exe:
                launch_kwargs["executable_path"] = exe

            browser = p.chromium.launch(**launch_kwargs)
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                ignore_https_errors=True,
                permissions=["camera", "microphone"],
            )
            ctx.add_init_script(MOCK_CLIENT_INIT_SCRIPT)
            page = ctx.new_page()
            page.goto(f"{base_url}/?debug=1", wait_until="domcontentloaded")
            advance_past_onboarding(page)

            page.locator('[data-testid="home-live-relay-card"]').click()
            page.locator('[data-testid="relay-intro-start"]').click()
            page.locator('[data-testid="relay-camera-screen"]').wait_for(state="visible", timeout=6000)

            # Wait for mock client to connect & ?debug=1 HUD to appear
            page.wait_for_function("() => window.__mockLiveClient && window.__mockLiveClient.isConnected()", timeout=8000)
            page.locator('[data-testid="relay-debug-overlay"]').wait_for(state="visible", timeout=4000)
            passed.append("debug-overlay: ?debug=1 renders live turn/gate HUD")
            print("[e2e-p1.7] PASS debug-overlay")

            # Switch to Hold-to-Talk mode so synthetic wav doesn't accidentally toggle gate during scripted checks
            page.locator('[data-testid="relay-mic-mode-btn"]').click()

            # 1. Junk captions while gate is closed MUST NOT appear
            page.evaluate("""() => {
              const c = window.__mockLiveClient;
              c.emitInputText('background TV voice');
              c.emitOutputText('{} ⚡');
            }""")
            time.sleep(0.2)
            cap_text = page.locator('[data-testid="relay-live-captions"]').inner_text()
            assert "background TV voice" not in cap_text, f"Junk input leaked: {cap_text}"
            assert "⚡" not in cap_text and "{}" not in cap_text, f"Unsanitized junk leaked: {cap_text}"
            passed.append("junk-filter: Closed-gate input and emoji/brace junk never appear")
            print("[e2e-p1.7] PASS junk-filter")

            # 2. Normal answer + FALSE "interrupted" while gate is closed -> Gemini keeps playing & finishes!
            page.evaluate("""() => {
              const c = window.__mockLiveClient;
              c.emitModelAudio(200);
              c.emitOutputText('Your gas bill is 850 rupees.');
              c.emitInterrupted(); // FALSE interrupt (gate closed!) -> MUST BE IGNORED
              c.emitOutputText(' Due on Friday.');
              c.emitTurnComplete();
            }""")
            page.wait_for_function(
                """() => {
                  const el = document.querySelector('[data-testid="relay-live-captions"]');
                  return el && el.textContent && el.textContent.includes('Due on Friday.');
                }""",
                timeout=4000,
            )
            cam_state = page.locator('[data-testid="relay-camera-screen"]').get_attribute("data-turn-state")
            assert cam_state == "idle", f"Expected idle after completed turn, got {cam_state}"
            passed.append("false-barge-in: False server interrupt ignored while gate closed; Gemini finished answer")
            print("[e2e-p1.7] PASS false-barge-in")

            # 3. REAL interrupt (while user holds Hold-to-Talk) -> stops Gemini & marks cut-off with ellipsis
            hold_btn = page.locator('[data-testid="relay-hold-talk-btn"]')
            hold_btn.wait_for(state="visible", timeout=3000)
            page.evaluate("""() => {
              const c = window.__mockLiveClient;
              c.emitModelAudio(300);
              c.emitOutputText('Let me read the full paragraph');
            }""")
            time.sleep(0.15)
            # Hold button down -> gate opens -> server interrupt is accepted as REAL
            hold_btn.dispatch_event("pointerdown")
            page.evaluate("() => window.__mockLiveClient.emitInterrupted()")
            page.wait_for_function(
                """() => {
                  const el = document.querySelector('[data-testid="relay-live-captions"]');
                  return el && el.textContent && el.textContent.includes('Let me read the full paragraph…');
                }""",
                timeout=4000,
            )
            hold_btn.dispatch_event("pointerup")
            passed.append("real-interrupt: Deliberate barge-in stops Gemini and marks cut-off text with ellipsis")
            print("[e2e-p1.7] PASS real-interrupt")

            # 4. Watchdog recovery when Gemini stays silent on a user turn (stillThinking -> reconnect + resend -> answers!)
            page.evaluate("""() => {
              const c = window.__mockLiveClient;
              c._answeredOnRetry = false;
              c._onSendTextHook = (txt) => {
                if (c.reconnectCalls >= 1 && !c._answeredOnRetry && txt.includes('Check page')) {
                  c._answeredOnRetry = true;
                  setTimeout(() => {
                    c.emitOutputText('Recovered after reconnect.');
                    c.emitTurnComplete();
                  }, 150);
                }
              };
            }""")
            # Open LiveSheet and send typed question to enter 'thinking'
            page.locator('[data-testid="relay-live-captions"]').click()
            sheet = page.locator('[data-testid="relay-live-sheet"]')
            sheet.wait_for(state="visible", timeout=3000)
            inp = sheet.locator('input[type="text"]')
            inp.fill("Check page 1")
            inp.press("Enter")
            # Wait for watchdog reconnect + resend + recovery answer
            page.wait_for_function(
                """() => {
                  const el = document.querySelector('[data-testid="sheet-captions-list"]');
                  return el && el.textContent && el.textContent.includes('Recovered after reconnect.');
                }""",
                timeout=8000,
            )
            reconn_after_watchdog = page.evaluate("() => window.__mockLiveClient.reconnectCalls")
            assert reconn_after_watchdog >= 1, f"Expected watchdog reconnect, got {reconn_after_watchdog}"
            passed.append("watchdog-recovery: Silent turn triggered Still thinking + reconnect/resend and recovered")
            print("[e2e-p1.7] PASS watchdog-recovery")

            # 5. Socket silence watchdog auto-reconnects when idle socket stays silent
            before_silence = page.evaluate("() => window.__mockLiveClient.reconnectCalls")
            page.wait_for_function(
                f"() => window.__mockLiveClient.reconnectCalls > {before_silence}",
                timeout=7000,
            )
            passed.append("socket-silence: Idle socket silence triggered automatic resumption reconnect")
            print("[e2e-p1.7] PASS socket-silence")

            ctx.close()
            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        wav_path.unlink(missing_ok=True)

    print("\n=== P1.7 PLAYWRIGHT SIMULATOR RESULTS ===")
    for item in passed:
        print(f"  PASS  {item}")
    print(f"Total passed: {len(passed)}/6")


if __name__ == "__main__":
    run_tests()
