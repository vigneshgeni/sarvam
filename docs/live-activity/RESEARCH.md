# Phase 0 Research & Architecture Note: Sarvam Live Activity

**Document:** `docs/live-activity/RESEARCH.md`  
**Date:** 4 November 2026  
**Target:** iOS Native Shell with Dynamic Island & Lock Screen Live Activity  
**Branch:** `feat/live-activity` (branched from `origin/main` + merged `bug-fixes`)

---

## 1. Capacitor Architecture, Web Packaging & CORS Verification

### 1.1 Version & iOS Requirements
- **Capacitor Major Version:** Capacitor 8 (`@capacitor/core` 8.6.0, `@capacitor/ios` 8.6.0, `@capacitor/cli` 8.6.0).
- **iOS Deployment Requirements:** Capacitor 8 requires Xcode 16+ (current system: Xcode 27.2, Swift 6.4.2) and targets iOS 15.0+ or iOS 16.0+ minimum.
- **Web Asset Bundling:** Sarvam's Vite build outputs client static files to `web/dist` (`webDir: "dist"` in `capacitor.config.ts`). Capacitor bundles these assets into the native app bundle and serves them via an internal custom scheme (`capacitor://localhost`) using `WKURLSchemeHandler`.

### 1.2 CORS Analysis & Native HTTP (`CapacitorHttp`)
- **The CORS Issue:** As verified in `api/main.py` lines 157–173, the live API backend allows origins `["https://sarvam-510715.web.app", "https://sarvam-510715.firebaseapp.com"]` and preview regex `^https://sarvam-510715--[a-z0-9-]+\.web\.app$`. The custom WKWebView origin `capacitor://localhost` is **not** in the backend's allowed origins list.
- **The Constraint:** Hard Rule 1 & 3 strictly prohibit deploying or modifying Google Cloud backend resources or touching the live API.
- **The Solution:** Capacitor provides `@capacitor/core` native HTTP bridging (`CapacitorHttp`). When enabled in `capacitor.config.ts`:
  ```ts
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
  ```
  `CapacitorHttp` patches `window.fetch` and `XMLHttpRequest` inside WKWebView and proxies calls through iOS native `URLSession`. Because native `URLSession` does not enforce browser Origin CORS checks, requests to `/api/*` succeed without modifying the frozen backend.
- **Service Worker Handling:** On web/PWA, `vite-plugin-pwa` registers `sw.js`. In WKWebView under custom schemes (`capacitor://`), service workers are neither required nor recommended because assets are loaded locally from the app bundle. The service worker registration is guarded by `!isNative()` so it runs only on the web.

*Documentation Reference:* [Capacitor iOS Guide](https://capacitorjs.com/docs/ios) | [Capacitor Http Plugin](https://capacitorjs.com/docs/apis/http)

---

## 2. ActivityKit & Interactive Live Activity Architecture

### 2.1 APIs & Minimum iOS Version Recommendation
- **ActivityKit Introduction:** iOS 16.1 introduced ActivityKit, but Live Activities on iOS 16.1–16.5 were strictly **display-only**. Tapping any element launched the app via `Link` or default URL scheme.
- **Interactive Live Activities (App Intents):** iOS 17.0 introduced interactive Live Activity widgets using SwiftUI `Button(intent:)` and `Toggle(isOn:intent:)` conforming to `LiveActivityIntent`.
- **Recommendation:** **Minimum iOS deployment target = iOS 17.0** (or iOS 18.0).
  - *What a lower version (iOS 16.1) loses:* Interactive Play/Pause, 10s skip buttons, and direct in-activity actions cannot execute without forcing the app to open.
  - *Installed Environment:* As per user instructions, iOS 27.2 is installed. Tests on minimum iOS are marked `BLOCKED` until an older runtime is downloaded.
- **Configuration & Info.plist:**
  - `NSSupportsLiveActivities = YES` in `Info.plist` for both the main iOS app and widget extension target.
- **Payload & Limits:**
  - Maximum `ActivityContent` payload size: **4 KB** serialized. Dynamic state must only contain lightweight identifiers, timestamps, phase enums, and progress values.
  - Maximum active duration: **8 hours** in active state, plus up to **4 hours** in ended/dismissed state on the Lock Screen (12 hours maximum before system purge).
  - `staleDate`: ActivityKit accepts a `staleDate` parameter. If no updates arrive before this date, iOS marks the activity stale (dimmed).
  - `alertConfiguration`: Used on transition to `ready`: `AlertConfiguration(title: "Ready", body: "Your document is ready", sound: .default)` wakes the screen and delivers a single alert.

*Documentation Reference:* [Apple ActivityKit Documentation](https://developer.apple.com/documentation/activitykit) | [LiveActivityIntent](https://developer.apple.com/documentation/appintents/liveactivityintent)

---

## 3. Background Scanning Strategy & Timeout Protection

### 3.1 Background Execution Analysis
When a user uploads a document and leaves the app (swipes Home or locks phone), iOS will suspend the app within seconds unless background execution is explicitly requested:
1. `UIApplication.shared.beginBackgroundTask(withName:expirationHandler:)`:
   - Gives approximately **30 seconds** of background execution time on modern iOS devices.
   - Ideal for typical photo/document explain requests that take 8–25 seconds.
2. Background `URLSession` (`URLSessionConfiguration.background(withIdentifier:)`):
   - Offloads transfers to the `nsurlsessiond` system daemon. While excellent for large downloads/uploads from files on disk, it has overhead for multipart streams that expect immediate JSON responses.
3. Continued Processing Tasks (BGProcessingTask / BGAppRefreshTask):
   - Intended for opportunistic background tasks (e.g. overnight maintenance), not real-time user-initiated foreground tasks.

### 3.2 Strategy for Scenario S13 (Request Exceeding Allowed Background Time)
- The app requests a background task via `beginBackgroundTask(withName: "SarvamDocumentScanning", expirationHandler:)`.
- If the Explain API completes within the background execution window (~30s), the activity immediately transitions to `ready` with `alertConfiguration`.
- If the background task approaches expiration before the API completes:
  1. The expiration handler updates the Live Activity to an honest state: `phase: .failed` with message `"Open Sarvam to finish"` and sets `staleDate: Date()`.
  2. The background task is cleanly ended to prevent watchdog crash (`0x8badf00d`).
  3. When the user taps the island or re-opens Sarvam, the app detects the pending document and seamlessly resumes or displays the completed result.

---

## 4. Background Audio Architecture for Listen

### 4.1 Native Audio Engine (`AVPlayer` + Background Audio)
Live Activity interactive buttons cannot easily control an HTML5 `<audio>` element inside a suspended WKWebView. Therefore, Listen audio in the native shell is executed through a dedicated native Swift audio player:
- **Audio Session:**
  ```swift
  try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
  try AVAudioSession.sharedInstance().setActive(true)
  ```
- **Background Modes:** `UIBackgroundModes` in `Info.plist` includes `<string>audio</string>`. This keeps the app process alive and actively running audio while the phone is locked or in the background.
- **Now Playing Integration:** `MPNowPlayingInfoCenter.default()` provides track title, "Sarvam" artist, audio duration, current playback position, and playback rate (1.0 or 0.0).
- **Remote Commands:** `MPRemoteCommandCenter.shared()` hooks:
  - `playCommand`, `pauseCommand`, `togglePlayPauseCommand`
  - `skipBackwardCommand` (interval = 10s)
  - `skipForwardCommand` (interval = 10s)
  - `changePlaybackPositionCommand`
- **Interactive App Intents:**
  Swift `LiveActivityIntent` implementations (`PlayPauseIntent`, `SkipBackwardIntent`, `SkipForwardIntent`) communicate with the native player singleton to toggle playback or adjust `currentTime` by ±10 seconds and synchronize the Live Activity `ContentState`.

*Documentation Reference:* [AVAudioSession](https://developer.apple.com/documentation/avfoundation/avaudiosession) | [MPNowPlayingInfoCenter](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter)

---

## 5. Sarvam Listen Implementation in Existing Web App

1. **Audio Synthesis & Chunking:**
   - In `web/src/utils/speech.ts` and `web/src/components/ListenSheet.tsx`:
   - `buildQuickSummaryScript(result, lang)` produces the concise summary; `buildSpokenText(result)` produces full details.
   - Long texts are partitioned into sentences via `splitIntoSentences()` with protection for abbreviations (Dr., Rs., etc.), initials, and Indic punctuation (danda `।`).
   - `audioBlobCache` caches synthesized audio blobs by key `${docId}-${mode}-${lang}-${voice}` to eliminate repeated TTS calls.
2. **Duration & Timing:**
   - Web uses `<audio>` metadata for duration. On the native shell, `AVPlayerItem.duration` gives exact duration.
   - Live Activity displays elapsed time, total duration, and a 31-tick ruler with markers at `0:30` and `1:00`.
3. **Language & Voice Resolution:**
   - Languages: English, Tamil, Hindi, Telugu, Malayalam, Kannada, Marathi, Bengali, Odia.
   - `resolveLang(lang)` maps 'auto' to the device language or defaults to English.
   - Voice gender: 'female' (default) or 'male'.
4. **The Odia (`or`) Special Case:**
   - As coded in `ResultScreen.tsx:1334` (`disabled={isTranslating || contentLang === 'or'}`), Odia has no TTS voice on the backend.
   - **Enforcement:** When document language is Odia (`or`), the Live Activity `ready` card **omits the Listen button**, and the listening activity is never initiated (satisfying Requirement 5.1 and Scenario L15).

---

## 6. Simulator Automation, Scripting & UI Control

### 6.1 Tooling & Command Line Capabilities
`xcrun simctl` provides complete control over simulator lifecycle, status bar, appearance, and captures:
- **Device Boot & App Launch:**
  ```bash
  xcrun simctl boot "iPhone 18 Pro"
  xcrun simctl install booted <App.app>
  xcrun simctl launch booted com.sarvam.app
  ```
- **Appearance & Dynamic Type:**
  - Dark mode: `xcrun simctl ui booted appearance dark`
  - Light mode: `xcrun simctl ui booted appearance light`
  - Dynamic Type: `xcrun simctl ui booted content_size accessibility-extra-extra-large`
- **Screenshots & Video Recording:**
  - Screenshot: `xcrun simctl io booted screenshot docs/live-activity/screens/<ID>.png`
  - Video: `xcrun simctl io booted recordVideo docs/live-activity/screens/<ID>.mp4`
- **Deep Links & System Events:**
  - Deep linking: `xcrun simctl openurl booted "sarvam://doc/<id>"` or `"sarvam://listen/<id>"`
  - Simulating Lock Screen / Home: AppleScript keystrokes (`Cmd+L` to lock, `Cmd+Shift+H` for Home) targeting the Simulator process.

### 6.2 Automation vs Physical Device Boundaries
- **Automated:** Launch, appearance switching, Dynamic Type scaling, debug harness trigger, screenshot capture, deep link verification, audio playback in background, state transitions.
- **Physical Device Only (Owner Checklist in Phase 3):**
  - Physical Dynamic Island morph animations and touch physics.
  - Real Face ID lock screen content redaction (`.privacySensitive()`).
  - True Always-On Display luminance reduction (`isLuminanceReduced`).
  - Bluetooth / AirPods disconnection triggers and live phone call interruptions.

---

## 7. Recommendation & Risk Analysis

### 7.1 Architecture Summary
1. Create isolated branch `feat/live-activity` from `origin/main` (with `bug-fixes` merged).
2. Scaffold `ios/` with Capacitor 8 and configure `CapacitorHttp: { enabled: true }` to eliminate CORS hurdles against the live API.
3. Implement `web/src/native/liveActivity.ts` TypeScript bridge that operates as a transparent no-op on web (`isNative() === false`).
4. Implement `SarvamLiveActivityPlugin.swift` bridging to ActivityKit and native `AVPlayer`.
5. Implement SwiftUI Live Activity Widget Extension for Dynamic Island (compact, minimal, expanded) and Lock Screen cards (scanning and listen).
6. Build an in-app zero-quota **Debug Harness** (invoked via debug launch argument or hidden gesture) to trigger every stage, progress percentage, error state, and audio playback offline.

### 7.2 Risk Matrix & Mitigations
| Risk | Probability | Severity | Mitigation Strategy |
|---|---|---|---|
| **CORS failure on live API** | High | Fatal | Enable `CapacitorHttp` in `capacitor.config.ts` so requests proxy through native `URLSession`. |
| **Background scanning timeout** | Medium | High | Use `beginBackgroundTask` with expiration handler that updates the activity to an honest state ("Open Sarvam to finish") and sets `staleDate`. |
| **Live API quota exhaustion** | Medium | Fatal | Use the hidden Debug Harness for 95% of test scenarios; limit live e2e calls to <= 30/day with bundled sample documents. |
| **PWA regressions** | Low | Fatal | All native code quarantined in `web/src/native/` and `ios/`; run `node --test`, `pytest`, and `npm run build` after every milestone. |
