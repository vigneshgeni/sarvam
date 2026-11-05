#!/usr/bin/env bash
set -e

# Default device name
DEVICE_NAME="${1:-iPhone 18 Pro}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="$PROJECT_ROOT/ios"
SCREENS_DIR="$PROJECT_ROOT/docs/live-activity/screens"

mkdir -p "$SCREENS_DIR"

echo "=== 1. Booting Simulator: $DEVICE_NAME ==="
DEVICE_ID=$(xcrun simctl list devices available | grep "$DEVICE_NAME" | head -n 1 | grep -E -o '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' || true)

if [ -z "$DEVICE_ID" ]; then
    echo "Device '$DEVICE_NAME' not found among available devices. Listing available:"
    xcrun simctl list devices available
    exit 1
fi

echo "Booting device ID: $DEVICE_ID ($DEVICE_NAME)"
xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE_ID" -b

echo "=== 2. Building App & Live Activity Widget ==="
cd "$PROJECT_ROOT/web"
npm run build
npx cap copy ios

cd "$IOS_DIR/App"
xcodebuild -workspace App.xcworkspace \
    -scheme App \
    -destination "id=$DEVICE_ID" \
    -derivedDataPath "$IOS_DIR/build" \
    build CODE_SIGNING_ALLOWED=NO

APP_PATH="$IOS_DIR/build/Build/Products/Debug-iphonesimulator/App.app"

echo "=== 3. Installing App on Simulator ==="
xcrun simctl install "$DEVICE_ID" "$APP_PATH"

echo "=== 4. Launching Sarvam ==="
xcrun simctl launch "$DEVICE_ID" com.sarvam.app

echo "=== 5. Taking Baseline Screenshot ==="
sleep 2
SCREENSHOT_PATH="$SCREENS_DIR/smoke-test.png"
xcrun simctl io "$DEVICE_ID" screenshot "$SCREENSHOT_PATH"

echo "=== Success! App is running on $DEVICE_NAME ==="
echo "Screenshot saved to: $SCREENSHOT_PATH"
