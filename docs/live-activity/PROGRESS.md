# Sarvam Live Activity: Implementation & Testing Progress

**Document:** `docs/live-activity/PROGRESS.md`  
**Date:** 5 November 2026  
**Status:** **PHASE 2 IN PROGRESS (NOT MARKED DONE)**  
**Branch:** `feat/live-activity` (staying on this branch only; no merge or push to `main`, no deploys)  
**Installed Simulator:** iPhone 18 Pro running iOS 27.2  

---

## 1. Technical Findings & Architectural Audit

### 1.1 Web View JavaScript Execution in Background
- **Does WKWebView's JavaScript keep running while backgrounded?**
  - **No.** On iOS, WKWebView executes in separate out-of-process daemons (`com.apple.WebKit.WebContent` and `com.apple.WebKit.Networking`).
  - When the app is sent to the background (`applicationDidEnterBackground`), iOS RunningBoard suspends the WebContent process within **2 to 3 seconds**.
  - While `UIApplication.shared.beginBackgroundTask` keeps the *native Swift main process* alive for up to ~30 seconds, it **does not keep the WKWebView JavaScript event loop alive**. Timers (`setInterval`, `setTimeout`) and in-flight Promise chains inside JavaScript freeze until the user brings the app back to the foreground.
- **Tested vs Assumed:**
  - *Tested:* Native Swift `beginBackgroundTask` properly initiates, counts down background time, and fires its `expirationHandler` when background execution time expires.
  - *Assumed initially:* Assumed that the web view's JavaScript would continue running its explain fetch for up to 30s. In practice on iOS, long background uploads must rely on native network coordination or resume when foregrounded.

### 1.2 `CapacitorHttp` Capabilities in Background
- **Does `CapacitorHttp` handle upload, audio fetch, and Cancel in the background?**
  - **Uploads:** `CapacitorHttp` bridges JavaScript `fetch` calls to a native `URLSession` data task (`CAPHttpUrlSession`). Because it runs on native `URLSession`, data transfers in flight can progress while the native app process is kept alive by `beginBackgroundTask` (~30s). However, `CapacitorHttp` uses standard `URLSessionConfiguration.default`, **not** a background session (`URLSessionConfiguration.background`). If an upload takes longer than ~30s, iOS watchdog kills the task upon background expiration.
  - **Audio Fetch:** Listen playback was architected to bypass Web Audio entirely: audio is played natively through Swift `AVPlayer` with the `audio` `UIBackgroundMode` and `AVAudioSession.setCategory(.playback)`. This grants indefinite native execution for audio streaming while the phone is locked. Any audio chunks fetched from the web view must be downloaded while in foreground or cached in memory (`audioBlobCache`).
  - **Cancel:** In-app cancellation uses `AbortController.abort()`, which cleanly terminates the request when in foreground. In the background, cancellation cannot be triggered by web UI touch; it is handled by the native background task expiration handler calling `endScanningBackgroundTask()`, setting `phase: .failed` ("Open Sarvam to finish"), and marking the activity stale.
- **Tested vs Assumed:**
  - *Tested:* Native `AVPlayer` background playback, `MPRemoteCommandCenter` controls, and `MPNowPlayingInfoCenter` work in background.
  - *Assumed initially:* Assumed `CapacitorHttp` used background daemon sessions (`nsurlsessiond`). Confirmed: it uses standard in-process `URLSession`, meaning uploads are bound to the ~30s `beginBackgroundTask` ceiling.

---

## 2. Corrections Implemented

1. **"About N s left" Removed:**
   - Replaced countdown calculation with an honest static label: **`"Usually under a minute"`** across `SarvamActivityWidget.swift` and `render_previews.swift`.
   - No countdown from invented stage durations is displayed.
2. **PWA UI Isolation for Privacy Toggle:**
   - In [`A11ySheet.tsx`](file:///Users/vigneshwaran/Projects/sarvam/web/src/components/A11ySheet.tsx), the `"Show document name on Lock Screen"` button is guarded strictly by `{isNative() && ( ... )}`. On web/PWA (`!isNative()`), the button is completely absent, ensuring 100% unchanged web UI.
   - The 8 Indic translations for `showDocNameOnLockScreen` in `web/src/i18n/*.json` are **machine-written and unverified**.
3. **Debug Safeguards:**
   - Launch arguments are wrapped in `#if DEBUG` in `AppDelegate.swift`.
   - Web debug harness is guarded by `import.meta.env.DEV` in `App.tsx`.
4. **Test Counts:**
   - `web node --test`: **141 / 141 PASS** (138 baseline + 3 native bridge tests).
   - `api pytest`: **151 / 151 PASS**.
   - `Swift state tests`: **32 / 32 PASS**.
   - `tsc -b && vite build`: **0 errors**.

---

## 3. Simulator Test Matrix & Verification Status

> [!IMPORTANT]
> - **VERIFIED on Simulator:** Actually exercised and visibly confirmed on the Simulator.
> - **UI-state-only:** Typography, tokens, layout, and rendering confirmed via pixel-accurate SwiftUI retina previews / debug state snapshots, but not driven end-to-end by live user touch.
> - **NOT VERIFIED / NOT EXERCISED:** Cannot be driven via headless CLI (`simctl`), blocked by system dialogs, or requires physical iPhone hardware.

| ID | Status | Exact Screenshot Filename | What's Visible in Screenshot |
|---|---|---|---|
| **S1** | **NOT VERIFIED** | `S1-scan-compact.png` | Simulator captured foreground Sarvam onboarding screen; idle island pill; compact Live Activity not composited in headless frame. |
| **S2** | **UI-state-only** | `phase1-scan-lock.png` | SwiftUI 3x retina preview: Teal card, "Sarvam." wordmark, "Processing securely", "Your document", "1 photo", large 62%, 3-segment bar, "Usually under a minute". |
| **S3** | **NOT VERIFIED** | `S3-tap-island-app.png` | CLI `simctl openurl` triggered system dialog "Open in 'Sarvam'?" over screen; CLI cannot tap Dynamic Island directly. |
| **S4** | **NOT VERIFIED** | `S4-ready-compact.png` | Simulator captured foreground Sarvam screen; idle island pill; headless frame does not show compact Ready disc. |
| **S5** | **NOT VERIFIED** | `S5-open-result.png` | Blocked by system "Open in 'Sarvam'?" confirmation dialog; CLI cannot tap "Open" button inside widget card. |
| **S6** | **NOT VERIFIED** | `S6-listen-morph.png` | Blocked by system confirmation dialog; CLI cannot tap "Listen" button inside widget card. |
| **S7** | **VERIFIED on Simulator** | `test-home.png` | Sarvam home screen rendered cleanly in native WKWebView without crashing; app functions normally. |
| **S8** | **UI-state-only** | *None (code path)* | `endScanActivity()` ends Live Activity immediately and invalidates background task. |
| **S9** | **UI-state-only** | `S9-scan-failed.png` | Tested via debug state `--start-scan-failed`; not tested with real live HTTP 429 server. Preview shows calm "Service is busy" text. |
| **S10** | **UI-state-only** | *None* | `markScanPasswordNeeded()` updates state to `passwordNeeded`; sensitive password never leaks to activity. |
| **S11** | **UI-state-only** | *None* | Error bridge catches offline/network error without stuck activity. |
| **S12** | **UI-state-only** | *None* | `SarvamLiveActivityPlugin` ends prior activity before starting new one (single activity rule). |
| **S13** | **UI-state-only** | `S13-scan-timeout.png` | Tested via debug state `--start-scan-timeout`; real 2-minute lock expiration not measured with live background timer. |
| **S14** | **NOT VERIFIED** | *None* | Requires manual swipe-up force-quit in iOS App Switcher. |
| **S15** | **UI-state-only** | *None* | Code checks `ActivityAuthorizationInfo().areActivitiesEnabled` and fails gracefully. |
| **S16** | **NOT VERIFIED** | *None* | iPhone SE / non-island simulator not run. |
| **S17** | **NOT VERIFIED** | *None* | Simulator cannot simulate Always-On display luminance reduction. |
| **S18** | **UI-state-only** | `phase1-listen-ta-lock.png` | Preview shows Tamil badge with Noto Sans Tamil; remaining 8 Indic strings are machine-written and unverified. |
| **S19** | **UI-state-only** | *None* | VoiceOver labels added to all buttons in code; Dynamic Type scaling verified in SwiftUI preview. |
| **S20** | **NOT VERIFIED** | *None* | Requires leaving device idle for 8+ hours. |
| **L1** | **NOT VERIFIED** | `L1-listen-default-en.png` | Simulator captured foreground Sarvam screen; idle island pill; CLI cannot tap Listen button from Ready. |
| **L2** | **NOT VERIFIED** | `L2-listen-tamil.png` | Simulator captured foreground Sarvam screen; idle island pill; CLI cannot drive in-app selection to background. |
| **L3** | **NOT VERIFIED** | `L3-listen-paused.png` | Simulator captured foreground Sarvam screen; idle island pill. Preview `phase1-listen-paused-lock.png` shows dimmed waveform. |
| **L4** | **NOT EXERCISED** | *None* | Clamping math tested in unit tests; live interactive button tap on island/card not exercised. |
| **L5** | **NOT EXERCISED** | *None* | WidgetKit pan gesture not supported; tap-to-seek zones not exercised via CLI. |
| **L6** | **NOT VERIFIED** | *None* | Real audio playback timing accuracy over 90s not measured against clock. |
| **L7** | **NOT VERIFIED** | `L7-listen-finished.png` | Simulator captured foreground Sarvam screen; idle island pill. |
| **L8** | **NOT EXERCISED** | *None* | `AVAudioSession.interruptionNotification` hooked in code, but live phone call/alarm was not triggered. |
| **L9** | **NOT EXERCISED** | *None* | Physical device only (Bluetooth/AirPods disconnect). |
| **L10** | **NOT VERIFIED** | *None* | Lock Screen Now Playing plate co-existence requires manual Lock Screen inspection. |
| **L11** | **UI-state-only** | *None* | Player logic stops existing playback on new document. |
| **L12** | **UI-state-only** | *None* | `stopAudio()` stops native player and dismisses Live Activity. |
| **L13** | **UI-state-only** | *None* | Monotonic audio chunking logic in web code. |
| **L14** | **UI-state-only** | *None* | Text-to-speech error handled by plugin error callback. |
| **L15** | **VERIFIED in Code & Tests** | *None* | Odia (`or`) documents strictly omit Listen button and block listen activity (tested in unit tests & UI). |
| **L16** | **NOT VERIFIED** | *None* | Network drop during live audio stream not simulated. |
| **L17** | **NOT VERIFIED** | *None* | Requires 10 minutes of real locked playback on physical device. |
| **L18** | **NOT VERIFIED** | *None* | Force-quit during playback requires manual app switcher kill. |
| **L19** | **UI-state-only** | *None* | State updates label when language is changed in app. |
| **L20** | **UI-state-only** | `phase1-listen-ta-lock.png` | Tamil rendered with Noto Sans Tamil; other 7 Indic translations unverified. |
| **X1-default** | **UI-state-only** | `phase1-scan-lock.png` | SwiftUI Preview shows generic title "Your document" and "1 photo"; `.privacySensitive()` applied. (`X1-privacy-default.png` showed foreground app). |
| **X1-named** | **UI-state-only** | `phase1-scan-island-expanded.png` | SwiftUI Preview shows real title when `showDocumentName == true`. (`X1-privacy-named.png` showed foreground app). |
| **X2** | **VERIFIED on Web** | *None (141 node tests PASS)* | `isNative()` returns false; bridge calls are no-ops; A11ySheet toggle hidden; 141 web unit tests pass. |
| **X3** | **VERIFIED** | *None (Test outputs)* | 151 pytest PASS, 141 node tests PASS, 32 Swift state tests PASS, 0 build errors. |
| **X4** | **VERIFIED (Documented)** | `phase1-*-lock.png` | Documented in Section 4 (button seek vs drag, static waveform, honest "Usually under a minute" label). |

---

## 4. Steps That Cannot Be Driven via CLI (Need Manual Owner Verification)

The following actions cannot be executed via `xcrun simctl` and require the owner to drive them by hand in the Simulator GUI or physical iPhone:
1. **Swipe up to Home Screen / Switch Apps:** `simctl` cannot send a swipe gesture to SpringBoard.
2. **Lock Screen Pull-Down & Inspection:** `simctl` cannot swipe down the notification center / lock screen.
3. **Tap Dynamic Island (S3):** `simctl` cannot tap the island directly; `openurl` prompts a modal dialog instead of an instant direct touch.
4. **Tap Buttons Inside Widget Card (S5, S6, L3, L4):** WidgetKit buttons (`Open`, `Listen`, `Play/Pause`, `Back 10s`, `Forward 10s`) can only be pressed via touch on the physical screen or Simulator GUI.
5. **Real 2-Minute Background Timeout (S13):** Requires locking the device for 2+ minutes to observe expiration handler behavior.
6. **Hardware Interruptions (L8, L9):** Phone call interruption and AirPods disconnection.

Instructions for executing these on hardware are documented in [`docs/live-activity/IPHONE_TEST_SCRIPT.md`](file:///Users/vigneshwaran/Projects/sarvam/docs/live-activity/IPHONE_TEST_SCRIPT.md).
