# Sarvam Live Activity: Physical iPhone Test Script (Phase 3)

**Document:** `docs/live-activity/IPHONE_TEST_SCRIPT.md`  
**Target:** Physical iPhone with Dynamic Island (iPhone 14 Pro/Pro Max, iPhone 15/Plus/Pro/Max, iPhone 16/17/18 series)  
**Branch:** `feat/live-activity`  
**Date:** 5 November 2026  

---

## 1. Prerequisites & Xcode Setup

### 1.1 Requirements
- macOS with Xcode 16+ (or current installed Xcode).
- iPhone running iOS 17.0+ (iOS 17.0 is required for interactive `LiveActivityIntent` buttons).
- USB-C / Lightning cable to connect iPhone to Mac.
- Free Apple ID (a paid Apple Developer Program account is **not** required for 7-day personal testing).

### 1.2 One-Time Signing Configuration
1. Open the Xcode workspace:
   ```bash
   open ios/App/App.xcworkspace
   ```
2. In the Xcode Project Navigator (left sidebar), click the top-level **App** project.
3. Select the **App** target:
   - Navigate to **Signing & Capabilities**.
   - Check **Automatically manage signing**.
   - Under **Team**, select your personal Apple ID (e.g. `Your Name (Personal Team)`).
   - If prompted that the Bundle Identifier `com.sarvam.app` is already taken, append a personal suffix (e.g. `com.sarvam.app.test`), and update the Widget Extension target bundle ID to match (e.g. `com.sarvam.app.test.widget`).
4. Select the **SarvamWidgetExtension** target:
   - Navigate to **Signing & Capabilities**.
   - Select the same Personal Team.
   - Verify bundle identifier matches `com.sarvam.app.widget` (or your chosen prefix).
5. Plug in your physical iPhone via USB, unlock it, and tap **Trust This Computer**.
6. In Xcode's destination dropdown (top bar), select your physical iPhone.
7. Click **Run (Cmd + R)** to build and install.
8. **First-launch permission on iPhone:**
   - If iOS blocks launch with "Untrusted Developer", on your iPhone go to:
     **Settings → General → VPN & Device Management → Developer App → Trust [Your Apple ID]**.
   - Re-open Sarvam.

---

## 2. Interactive Test Checklist (Physical Device)

### Test Group A: Document Scanning & Dynamic Island (S1–S6)

#### A1. Compact Dynamic Island During Scan (Scenario S1)
1. Open Sarvam on your iPhone.
2. Tap **"Take photo"** or pick a document from **"Try a sample"**.
3. As soon as the reading animation starts, **swipe up to go to the Home Screen**.
4. **Observe the Dynamic Island:**
   - [ ] Island expands into compact presentation.
   - [ ] Left side: Mustard progress ring with centered coral pulsing dot.
   - [ ] Right side: Mustard percentage text (e.g., `42%`, `68%`) with tabular digits.
   - [ ] Progress matches the in-app progress.

#### A2. Lock Screen Scanning Card (Scenario S2)
1. While processing, press the **Side button** to lock the iPhone.
2. Wake the screen (tap screen or raise to wake).
3. **Observe the Lock Screen:**
   - [ ] Teal rounded card (`#224F48`) appears below the clock.
   - [ ] Top row: Wordmark **"Sarvam."** on left, **"Processing securely"** mint pill on right.
   - [ ] Middle row: Title shows **"Your document"** (privacy default), subtitle shows **"1 photo"**, right side shows large percentage in Fraunces bold.
   - [ ] 3-segment progress bar fills in 40% : 40% : 20% ratio.
   - [ ] Bottom row shows localized stage text and **"Usually under a minute"**.

#### A3. Dynamic Island Tap & Navigation (Scenario S3)
1. With Sarvam processing in the background, **tap directly on the compact Dynamic Island**.
2. **Observe:**
   - [ ] Sarvam opens immediately to the active Reading screen.
   - [ ] No system alert or confirmation dialog is shown.

#### A4. Background Completion to Ready (Scenario S4, S5, S6)
1. Start an explain run, swipe out to Home Screen, and let it finish in the background (~15s).
2. **Observe completion alert:**
   - [ ] Screen wakes with a single subtle alert chime.
   - [ ] Compact Island morphs: Left side shows mustard disc with dark checkmark; right side shows **"Ready"**.
3. **Lock Screen Card Check:**
   - [ ] Wake the phone: Card has turned **Gold/Mustard (`#E9B44C`)**.
   - [ ] Header shows **"Your document is ready"** and **"1 photo"**.
   - [ ] Two 44 pt pill buttons are visible: **"Open"** (ink fill) and **"Listen"** (outlined).
4. **Test "Open" Button (S5):**
   - [ ] Tap **"Open"**: Sarvam launches directly into the document Result screen.
5. **Test "Listen" Button (S6):**
   - [ ] Start a new scan, wait for Ready on Lock Screen, and tap **"Listen"**:
   - [ ] Live Activity instantly morphs into the Audio Player card without launching the full app.

---

### Test Group B: Listen Audio Player & Interactive Controls (L1–L8)

#### B1. Compact Island Waveform (Scenario L1, L2)
1. Inside Sarvam, open a result, tap **"Listen"**, and swipe to Home Screen.
2. **Observe Compact Island:**
   - [ ] Left side: 5-bar mustard waveform icon.
   - [ ] Right side: Elapsed audio time (e.g. `0:14`) advancing in real time.

#### B2. Expanded Island Interaction (Scenario L3, L4)
1. **Long-press on the Dynamic Island** while audio is playing.
2. **Observe Expanded Layout:**
   - [ ] Top row: Teal monogram circle **"S"**, document title (or "Your document"), language & voice badge (e.g. `தமிழ் · Female`).
   - [ ] Middle: 31-tick dynamic ruler with tall markers at `0:30` and `1:00`, current tick in light mustard, and subtle edge fading on left and right.
   - [ ] Controls: Elapsed time left, **Back 10s** (`gobackward.10`), **Play/Pause** (58 pt round mustard button), **Forward 10s** (`goforward.10`), remaining time right (e.g. `-1:16`).
3. **Interactive Button Checks:**
   - [ ] Tap **Pause**: Audio pauses immediately; center button changes to Play icon; waveform dims.
   - [ ] Tap **Play**: Audio resumes immediately.
   - [ ] Tap **Forward 10s**: Audio skips forward 10 seconds; ruler and timestamp update smoothly.
   - [ ] Tap **Back 10s**: Audio skips backward 10 seconds (clamped to `0:00` if near start).

#### B3. Hardware Interruptions (Scenario L8, L9)
1. **Phone Call Interruption (L8):**
   - While listening in background, have someone call your phone or trigger an alarm.
   - [ ] Audio pauses cleanly when the call arrives.
   - [ ] Audio resumes (or remains paused) properly after call ends.
2. **AirPods / Bluetooth Disconnect (L9):**
   - Listen with AirPods connected.
   - Remove AirPods and place in case.
   - [ ] Audio pauses immediately (does not blast through phone speakers).

---

### Test Group C: Privacy & Cross-Cutting (X1–X3)

#### C1. Face ID Lock Screen Redaction (Scenario X1)
1. In Sarvam, open **Accessibility Settings** (wheel/a11y icon).
2. Ensure **"Show document name on Lock Screen"** is **OFF** (default).
3. Start a scan or play audio, lock the phone.
4. Point phone away from your face (locked with Face ID).
   - [ ] Card displays **"Your document"** and **"1 photo"**.
   - [ ] No personal names, amounts, or file titles are visible.
5. Unlock phone with Face ID while remaining on Lock Screen:
   - [ ] If setting is OFF, title remains generic "Your document".
6. Turn setting **ON** in Sarvam settings:
   - [ ] When phone is unlocked by Face ID, actual document title appears.

---

## 3. Owner Feedback Log Template

Please fill in your results below after testing on your iPhone:

```markdown
### Physical iPhone Test Results
- **Device Model:** iPhone [e.g. 15 Pro / 16 Pro]
- **iOS Version:** iOS [e.g. 18.1 / 18.2]
- **Scan Compact Island (S1):** [PASS / FAIL - notes]
- **Lock Screen Scanning Card (S2):** [PASS / FAIL - notes]
- **Island Tap Navigation (S3):** [PASS / FAIL - notes]
- **Ready Alert & Morph (S4, S5, S6):** [PASS / FAIL - notes]
- **Listen Waveform & Expanded Island (L1, L2):** [PASS / FAIL - notes]
- **Play/Pause, Back 10, Forward 10 Buttons (L3, L4):** [PASS / FAIL - notes]
- **AirPods / Call Interruption (L8, L9):** [PASS / FAIL - notes]
- **Privacy Default Check (X1):** [PASS / FAIL - notes]
- **General Notes / Visual Glitches Observed:**
```
