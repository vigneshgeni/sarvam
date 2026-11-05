# Sarvam Live Activity & Native Parity: Physical iPhone Test Script

**Document:** `docs/live-activity/IPHONE_TEST_SCRIPT.md`  
**Target:** Physical iPhone running iOS 17.0+ (with Dynamic Island: iPhone 14 Pro/Pro Max, iPhone 15/16/17 series; or notch iPhone for Lock Screen cards)  
**Branch:** `feat/live-activity`  
**Date:** November 2026  

---

## 1. Prerequisites & Xcode Setup

### 1.1 Requirements
- macOS with Xcode 16+
- Physical iPhone running iOS 17.0+
- USB-C / Lightning cable to connect iPhone to Mac
- Free personal Apple ID (paid developer account NOT required)

### 1.2 One-Time Signing & Running
1. Open the Xcode workspace:
   ```bash
   open ios/App/App.xcworkspace
   ```
2. In the Xcode Project Navigator (left sidebar), select the **App** project:
   - Target **App**: Select your Personal Team under **Signing & Capabilities**.
   - Target **SarvamWidgetExtension**: Select the same Personal Team.
3. Plug in your physical iPhone via USB, unlock it, and select your iPhone in the top destination bar.
4. Click **Run (Cmd + R)**.
5. If iOS prompts "Untrusted Developer":
   - On iPhone: **Settings → General → VPN & Device Management → Developer App → Trust [Your Apple ID]**.
   - Launch Sarvam.

---

## 2. Interactive Test Checklist (Physical Device)

### Test Group 0: Native Parity & Permissions (P0 Checks)
- [ ] **App Icon:** On the iOS Home Screen, verify Sarvam has an opaque brand-green `#146B4E` icon with centered white logo. No black borders, no default Capacitor "X" icon.
- [ ] **Splash Screen:** On app launch, verify a smooth `#F4F5F2` brand cream splash screen with centered Sarvam icon appears before the app loads.
- [ ] **Camera Permission & Capture:** Tap **"Take photo"** (or camera button). Verify iOS shows standard camera permission dialog (`NSCameraUsageDescription`). Take a photo; verify the camera closes and the photo loads directly into Sarvam without crashing.
- [ ] **Photo Library Permission:** Tap **"Choose photo"** from gallery. Verify iOS shows standard photo library permission dialog (`NSPhotoLibraryUsageDescription`). Select a photo; verify it loads smoothly.
- [ ] **Left-Edge Swipe-Back:** Navigate to Reading or Result screen, then swipe inward from the left screen edge. Verify iOS smoothly transitions back to the previous screen.

---

### Test Group A: Document Scanning & Dynamic Island (Option A)

#### A1. Compact Dynamic Island During Scan (Scenario S1)
1. In Sarvam, select a document or take a photo, and tap Explain.
2. As soon as processing starts, **swipe up to go to the Home Screen**.
3. **Observe Dynamic Island:**
   - [ ] Island expands into compact presentation.
   - [ ] Left side: Mustard progress ring with centered coral pulsing dot.
   - [ ] Right side: Pulsing mustard analysis indicator (Option A: **NO percentage number** anywhere).
   - [ ] Tap the compact island: Sarvam opens immediately into active reading screen.

#### A2. Lock Screen Scanning Card (Scenario S2)
1. While document analysis is in progress, press the **Side button** to lock the iPhone.
2. Tap the screen to wake the Lock Screen.
3. **Observe Lock Screen Card:**
   - [ ] Deep teal card (`#224F48`) below clock.
   - [ ] Top row: Wordmark **"Sarvam."** on left, **"Processing securely"** mint pill on right.
   - [ ] Middle row: Title displays **"Your document"** (privacy default), subtitle displays **"1 photo"** (or file name if privacy toggle is ON).
   - [ ] Right side: Pulsing animated progress indicator (Option A: **NO percentage number**).
   - [ ] 3-segment progress bar fills in 40% : 40% : 20% ratio.
   - [ ] Bottom row: Stage displays **"Analyzing document…"** and right side displays **"Usually under a minute"**.
   - [ ] Tap **"Cancel"**: Analysis and Live Activity immediately terminate.

#### A3. Background URLSession Survival & Ready Transition (Scenario S4, S5, S6)
1. Start a scan, and **immediately lock the phone or swipe to Home Screen**.
2. Wait ~15 seconds for analysis to complete in the background via `URLSessionConfiguration.background`.
3. **Observe Background Completion:**
   - [ ] Alert chime sounds and screen lights up with alert: **"Ready · Your document is ready"**.
   - [ ] Dynamic Island morphs: Left side displays mustard disc with dark checkmark; right side displays **"Ready"**.
   - [ ] Lock Screen Card turns **Gold/Mustard (`#E9B44C`)** with **"Your document is ready"**.
4. **Test "Open" Button (S5):**
   - [ ] Tap **"Open"** on the Lock Screen card or Dynamic Island: Sarvam launches directly to the Result screen without having to leave and return, and without getting stuck.
5. **Test "Listen" Button (S6):**
   - [ ] Tap **"Listen"** on the Ready card: Live Activity instantly morphs into the Audio Player card.

---

### Test Group B: Listen Audio Player & Interactive Controls (L1–L8)

#### B1. Compact Island Waveform (Scenario L1, L2)
1. From Result screen, tap **"Listen"** (or tap "Listen" on the Ready activity).
2. Swipe to Home Screen or lock device.
3. **Observe Compact Island:**
   - [ ] Left side: 5-bar mustard waveform icon.
   - [ ] Right side: Elapsed audio time (e.g. `0:14`) advancing in real time.

#### B2. Expanded Island Interaction (Scenario L3, L4)
1. **Long-press on the Dynamic Island** while audio is playing.
2. **Observe Expanded Layout:**
   - [ ] Top row: Teal monogram circle **"S"**, document title (or "Your document"), language & voice badge (e.g. `தமிழ் · Female`).
   - [ ] Middle: 31-tick dynamic ruler with tall markers at `0:30` and `1:00`, current tick in light mustard, edge fade on left and right.
   - [ ] Controls: Elapsed time left, **Back 10s** (`gobackward.10`), **Play/Pause** (58 pt round mustard button), **Forward 10s** (`goforward.10`), remaining time right (e.g. `-1:16`).
3. **Interactive Control Checks:**
   - [ ] Tap **Pause**: Audio pauses immediately; center button changes to Play icon.
   - [ ] Tap **Play**: Audio resumes immediately.
   - [ ] Tap **Forward 10s**: Audio advances 10 seconds; ruler and timestamp update.
   - [ ] Tap **Back 10s**: Audio steps back 10 seconds (clamped to `0:00`).

#### B3. Hardware Interruptions (Scenario L8, L9)
- [ ] **Phone Call / Siri / Alarm:** Audio pauses when call arrives; resumes cleanly after call ends.
- [ ] **AirPods / Bluetooth Disconnect:** Audio pauses immediately when headphones disconnect (does not blast phone speaker).

---

### Test Group C: Native Parity & System Sheets (P3 Checks)

#### C1. Native QuickLook Document Viewer
1. In Result screen, tap **"View document"** (eye icon).
2. **Observe Native Preview:**
   - [ ] Native iOS QuickLook controller opens modally over the app.
   - [ ] Pinch-to-zoom, pan, markup, and native iOS share button work smoothly.
   - [ ] Tap **"Done"**: Returns cleanly to Sarvam Result screen.

#### C2. Native Calendar & Reminders Export
1. In Result screen, tap an action item's date or **"Add to Calendar"**.
2. **Observe Native Share Sheet:**
   - [ ] Native iOS share sheet opens containing the formatted `.ics` event file.
   - [ ] Selecting "Add to Calendar" or "Reminders" imports the action item with correct title, date, and alarm.

#### C3. Face ID Privacy Default (Scenario X1)
1. In Sarvam, open **Settings (wheel icon)**.
2. Verify **"Show document name on Lock Screen"** is **OFF** by default.
3. Lock device: Lock Screen card displays generic title **"Your document"**.
4. Turn toggle **ON**: Lock Screen card displays actual document name when unlocked via Face ID.

---

## 3. Owner Feedback Log Template

Please fill in your results below after testing on your iPhone:

```markdown
### Physical iPhone Test Results
- **Device Model:** iPhone [e.g. 15 Pro / 16 Pro]
- **iOS Version:** iOS [e.g. 18.1 / 18.2]
- **App Icon & Splash (P0):** [PASS / FAIL - notes]
- **Camera & Photo Permissions (P0):** [PASS / FAIL - notes]
- **Left-Edge Swipe-Back (P0):** [PASS / FAIL - notes]
- **Scan Compact Island & Lock Screen Card (Option A) (S1, S2):** [PASS / FAIL - notes]
- **Background Scan Survival & Ready Alert (S4, S5, S6):** [PASS / FAIL - notes]
- **"Open" Tap Navigation (S5):** [PASS / FAIL - notes]
- **Listen Audio Player & Controls (L1, L2, L3, L4):** [PASS / FAIL - notes]
- **Hardware Interruptions (L8, L9):** [PASS / FAIL - notes]
- **Native QuickLook Previewer (P3):** [PASS / FAIL - notes]
- **Native Calendar / Share Sheet (P3):** [PASS / FAIL - notes]
- **Privacy Default Check (X1):** [PASS / FAIL - notes]
- **General Notes / Visual Glitches Observed:**
```
