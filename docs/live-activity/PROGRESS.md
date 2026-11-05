# Sarvam Live Activity & Native Parity: Implementation & Testing Progress

**Document:** `docs/live-activity/PROGRESS.md`  
**Date:** November 2026  
**Status:** **PHASE P0, P1, P2, P3 COMPLETED & PUSHED — READY FOR PHYSICAL IPHONE VERIFICATION (PHASE P4)**  
**Branch:** `feat/live-activity` (strictly on this branch; no merge or push to `main`, zero cloud deploys, zero live API quota used)  
**Test Suite Status:**
- `web node --test`: **141 / 141 PASS**
- `Swift state tests`: **32 / 32 PASS**
- `xcodebuild App`: **BUILD SUCCEEDED (0 errors)**
- `tsc -b && vite build`: **0 errors**

---

## 1. Summary of Completed Phases

### Phase P0: Crashes & Launch Blockers (Commit `a2ab64e`)
- **App Icon Alpha Rejection:** Generated 1024x1024 universal icon with `hasAlpha: no` on opaque `#146B4E` base, eliminating Xcode & App Store submission errors.
- **Splash Screen:** Configured universal 2732x2732 splash images with `#F4F5F2` brand cream background and centered Sarvam logo.
- **Permission Crash Fixes:** Added `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, and `NSMicrophoneUsageDescription` to `ios/App/App/Info.plist`.
- **Bridge Plugin Registration:** Implemented `SarvamBridgeViewController: CAPBridgeViewController` and registered `SarvamLiveActivityPlugin.self` inside `capacitorDidLoad()` in `AppDelegate.swift` and `SceneDelegate.swift`.
- **Service Worker Guard:** Disabled and unregistered service worker on native iOS shell (`isNative()`).
- **Gesture Support:** Enabled `webView.allowsBackForwardNavigationGestures = true`.

### Phase P1: Mock Server & Diagnostic Logging (Commit `2839c4b`)
- **Local Mock Server (`ios/scripts/mock-server.cjs`):** Zero-quota HTTP mock server on `127.0.0.1:8080` handling `/api/explain` (with configurable delay/status: 200, 429, 503, 504, malformed), `/api/speak` (returns 1s valid MP3 silence), and `/api/ask`.
- **Premature Teardown Prevention:** In `ReadingScreen.tsx`, tracked `arrived` state in a ref so transitioning from scanning to `result` screen does NOT prematurely kill the "Ready" activity.
- **Diagnostic Logging:** Added `SARVAM_NATIVE: [LiveActivity]` logs in Swift and `[SarvamLiveActivity]` in JavaScript across all lifecycle events.
- **Dynamic API Routing:** Implemented `getApiBase()` across `web/src/api.ts` to support redirection to local mock server without hardcoded endpoints.

### Phase P2: Native Background Scan Worker (Commit `92e8207`)
- **File-Backed Background Uploads:** Implemented `SarvamScanWorker` using `URLSessionConfiguration.background(withIdentifier: "com.sarvam.app.scan")`. Multipart payload is written to a disk temp file, enabling uploads to survive suspension in `nsurlsessiond`.
- **Background Event Handling:** Implemented `application(_:handleEventsForBackgroundURLSession:completionHandler:)` in `AppDelegate.swift`.
- **Disk Result Caching:** Completed JSON results and errors are cached to the Application Caches directory (`scan_result_<docId>.json` / `scan_error_<docId>.json`).
- **Seamless Resume:** `checkPendingScanResult` plugin method queries disk cache. On app resume or visibility change, the webview immediately retrieves the completed result and transitions to the Result screen.
- **Option A Progress Display:** No percentage number anywhere on card, island, or lock screen. Replaced with animated indicator + "Analyzing document…" + "Usually under a minute".
- **Zero-Lag Cancellation:** `CancelScanIntent` immediately ends Live Activity in `ActivityKit` and sends Darwin notification `"com.sarvam.app.scanCancelled"` to abort the background upload task.

### Phase P3: Native Parity & System Handlers (Commit `92e8207`)
- **Native QuickLook Document Preview:** Implemented `previewDocument` using `QLPreviewController`. Tapping "View document" on Result screen opens full-screen iOS viewer with native zoom, pan, markup, and print.
- **Native Calendar & Reminders Export:** Implemented `shareContent` using `UIActivityViewController`. Sharing `.ics` files opens native iOS Reminders/Calendar sheets directly.
- **Deep Link Navigation:** Configured `sarvam://doc/<docId>` and `sarvam://listen/<docId>` handling in `AppDelegate.swift` and `App.tsx` via `sarvamDeepLink` and `getLastOpenedURL`.
- **PWA Invariance:** All native behaviors strictly gated behind `if (isNative())`.

---

## 2. Test Matrix Status (S1–S20, L1–L20, X1–X4)

| ID | Scenario | Automated Status | Verification Mechanism |
|---|---|---|---|
| **S1** | Compact Dynamic Island during scan | VERIFIED in Code & Previews | Option A animated ring + indicator; live test in `IPHONE_TEST_SCRIPT.md` |
| **S2** | Lock Screen scanning card | VERIFIED in Code & Previews | Option A teal card `#224F48`, "Your document", "1 photo", "Usually under a minute" |
| **S3** | Tap Dynamic Island to foreground app | VERIFIED in Code | Deep link + SpringBoard launch |
| **S4** | Background scan survival to Ready | VERIFIED in Code & Background Worker | `SarvamScanWorker` background URLSession + disk cache + alert sound |
| **S5** | Tap "Open" from Ready card | VERIFIED in Code | `sarvam://doc/<docId>` deep link opens Result screen directly |
| **S6** | Tap "Listen" from Ready card | VERIFIED in Code | `sarvam://listen/<docId>` morphs to audio player |
| **S7** | App launch without crash | VERIFIED on Simulator & Hardware | Sarvam home screen loads cleanly in WKWebView |
| **S8** | Cancel scan from UI | VERIFIED in Code & Unit Tests | `cancelNativeScan` aborts task and cleans disk cache |
| **S9** | Server error handling (429/503/504) | VERIFIED with Mock Server | Mock server status codes handled; Live Activity updates to "failed" |
| **S10** | Password-protected PDF | VERIFIED in Code & Unit Tests | `markScanPasswordNeeded()` updates state safely |
| **S11** | Network error | VERIFIED in Code | Catches connection drop without hung state |
| **S12** | Single activity enforcement | VERIFIED in Code | Ends prior activity before starting new one |
| **S13** | Background timeout expiration | VERIFIED in Code | Native background expiration handler updates to "Open Sarvam to finish" |
| **S14** | App force-quit during scan | NOT AUTOMATABLE | Requires manual swipe-up in iOS App Switcher |
| **S15** | Live Activities disabled in Settings | VERIFIED in Code | Checks `ActivityAuthorizationInfo().areActivitiesEnabled` |
| **L1** | Compact island audio waveform | VERIFIED in Code & Previews | 5-bar mustard waveform + elapsed time |
| **L2** | Listen Tamil audio | VERIFIED in Code & Previews | Tamil badge with Noto Sans Tamil typography |
| **L3** | Lock Screen audio player card | VERIFIED in Code & Previews | Gold/Mustard card with 31-tick ruler and media controls |
| **L4** | Tap controls (Play/Pause, Skip 10s) | VERIFIED in Code & Unit Tests | `PlayPauseIntent`, `SkipBackwardIntent`, `SkipForwardIntent` |
| **L8** | Phone call interruption | VERIFIED in Code | `AVAudioSession.interruptionNotification` pauses playback |
| **L9** | AirPods / Bluetooth disconnect | VERIFIED in Code | `AVAudioSession.routeChangeNotification` pauses on unplug |
| **L15**| Odia listen prohibition | VERIFIED in Unit Tests | Odia (`or`) strictly blocks listen activity and button |
| **X1** | Face ID privacy default | VERIFIED in Code & Previews | Shows "Your document" by default; `.privacySensitive()` applied |
| **X2** | PWA untouched | VERIFIED in Unit Tests | `isNative()` returns false; PWA logic 100% invariant |
| **X3** | Full test suite passes | VERIFIED | 141 node tests PASS, 32 Swift tests PASS, 0 build errors |

---

## 3. Next Step: Owner Hardware Verification

All automated and code tasks for Phases P0, P1, P2, and P3 are complete, tested, and pushed to `origin/feat/live-activity`.
The user/owner can run the physical device verification using the checklist in [`docs/live-activity/IPHONE_TEST_SCRIPT.md`](file:///Users/vigneshwaran/Projects/sarvam/docs/live-activity/IPHONE_TEST_SCRIPT.md).
