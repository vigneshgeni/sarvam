#!/usr/bin/env bash
set -e

SIM_ID="1DE15BB8-E311-4D9E-8D5B-12EF100A5AC0"
OUT_DIR="/Users/vigneshwaran/Projects/sarvam/docs/live-activity/screens"
BUNDLE_ID="com.sarvam.app"

mkdir -p "$OUT_DIR"

echo "=== Running Prioritized Live Activity Scenarios ==="

# Helper function
run_scenario() {
  local id="$1"
  local name="$2"
  local launch_arg="$3"
  local screen_file="$4"

  echo "--> Running $id: $name ($launch_arg)"
  xcrun simctl terminate "$SIM_ID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  sleep 0.8
  xcrun simctl launch "$SIM_ID" "$BUNDLE_ID" $launch_arg >/dev/null
  sleep 2.0
  xcrun simctl io "$SIM_ID" screenshot --mask=black "$OUT_DIR/$screen_file" >/dev/null
  echo "    Captured: $screen_file"
}

# S1: Scan 62% in Compact Island
run_scenario "S1" "Scan in progress (compact island)" "--start-scan-62" "S1-scan-compact.png"

# S3: Tap island opens Sarvam
echo "--> Running S3: Deep link tap opens app"
xcrun simctl openurl "$SIM_ID" "sarvam://doc/debug-scan" >/dev/null
sleep 1.5
xcrun simctl io "$SIM_ID" screenshot --mask=black "$OUT_DIR/S3-tap-island-app.png" >/dev/null
echo "    Captured: S3-tap-island-app.png"

# S4: Scanning finishes, Ready state
run_scenario "S4" "Scan Ready state" "--start-ready" "S4-ready-compact.png"

# S5: Tap Open on Ready
echo "--> Running S5: Tap Open opens result"
xcrun simctl openurl "$SIM_ID" "sarvam://doc/debug-ready" >/dev/null
sleep 1.5
xcrun simctl io "$SIM_ID" screenshot --mask=black "$OUT_DIR/S5-open-result.png" >/dev/null
echo "    Captured: S5-open-result.png"

# S6: Tap Listen on Ready
echo "--> Running S6: Tap Listen morphs to audio"
xcrun simctl openurl "$SIM_ID" "sarvam://listen/debug-ready" >/dev/null
sleep 1.5
xcrun simctl io "$SIM_ID" screenshot --mask=black "$OUT_DIR/S6-listen-morph.png" >/dev/null
echo "    Captured: S6-listen-morph.png"

# S9: Failed 429/503/504
run_scenario "S9" "Failed state (calm message)" "--start-scan-failed" "S9-scan-failed.png"

# S13: Background timeout honest state
run_scenario "S13" "Background timeout (Open Sarvam to finish)" "--start-scan-timeout" "S13-scan-timeout.png"

# L1: Listen English Default
run_scenario "L1" "Listen default English" "--start-listen-en" "L1-listen-default-en.png"

# L2: Listen Tamil chosen
run_scenario "L2" "Listen Tamil chosen" "--start-listen-ta" "L2-listen-tamil.png"

# L3: Listen Paused
run_scenario "L3" "Listen Paused" "--start-listen-paused" "L3-listen-paused.png"

# L7: Listen Finished
run_scenario "L7" "Listen Finished" "--start-listen-finished" "L7-listen-finished.png"

# X1: Privacy Default vs Opt-in
run_scenario "X1-A" "Privacy Default (Your document)" "--start-scan-62" "X1-privacy-default.png"
run_scenario "X1-B" "Privacy Opt-in (Show document name)" "--start-scan-62 --show-doc-name" "X1-privacy-named.png"

echo "=== All prioritized scenario runs completed successfully! ==="
