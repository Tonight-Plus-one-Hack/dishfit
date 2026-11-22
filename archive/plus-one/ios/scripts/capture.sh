#!/bin/zsh
# Runs the end-to-end UI test on a simulator while recording the screen, and saves a PNG of every screen.
#
#   apps/ios/scripts/capture.sh <simulator-udid> <output-dir>
#
# Output: <output-dir>/screens/*.png, <output-dir>/flow.mp4 (whole run) and <output-dir>/onboarding.mp4
# (welcome to the join confirmation). The status bar is pinned to 18:00, the time the app is frozen at.
set -euo pipefail

udid=${1:?simulator udid}
out=${2:?output dir}
here=${0:A:h}
project="$here/../PlusOne.xcodeproj"
derived=${DERIVED_DATA:-/tmp/plusone-ios/DerivedData}

mkdir -p "$out/screens"
find "$out/screens" -name "*.png" -delete; rm -f "$out/flow.mp4" "$out/onboarding.mp4"

xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
xcrun simctl status_bar "$udid" override --time "2026-11-21T17:00:00.000Z" --dataNetwork wifi --wifiMode active \
  --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState discharging --batteryLevel 100
xcrun simctl uninstall "$udid" com.tonightplusone.plusone 2>/dev/null || true

xcodebuild -project "$project" -scheme PlusOne -destination "id=$udid" -derivedDataPath "$derived" build-for-testing -quiet

xcrun simctl io "$udid" recordVideo --codec h264 --force "$out/flow.mp4" &
recorder=$!
sleep 2
started=$(date +%s)

TEST_RUNNER_PLUSONE_SHOTS_DIR="$out/screens" xcodebuild -project "$project" -scheme PlusOne -destination "id=$udid" \
  -derivedDataPath "$derived" -only-testing:PlusOneUITests test-without-building -quiet || status=$?

sleep 1
kill -INT $recorder
wait $recorder 2>/dev/null || true

# Onboarding clip: from the start of the recording to two seconds after the join confirmation was captured.
if [[ -f "$out/screens/app-01-joined.png" ]]; then
  joined=$(stat -f %m "$out/screens/app-01-joined.png")
  length=$(( joined - started + 4 ))
  ffmpeg -loglevel error -y -i "$out/flow.mp4" -t "$length" -vf "scale=590:-2" -c:v libx264 -crf 24 -preset slow \
    -pix_fmt yuv420p -movflags +faststart -an "$out/onboarding.mp4"
fi

exit ${status:-0}
