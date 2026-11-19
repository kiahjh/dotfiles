#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIGURATION="${1:-release}"

cd "$ROOT_DIR"

# SwiftPM's default (Swift Build) backend stamps the binary's SDK version as the deployment target
# (14.0), which makes macOS run the app with the legacy, pre-Liquid Glass UI. Stamp the real SDK.
# Keep the minimum version in sync with `platforms` in Package.swift.
SDK_VERSION="$(xcrun --show-sdk-version)"
BUILD_FLAGS=(-c "$CONFIGURATION" -Xlinker -platform_version -Xlinker macos -Xlinker 14.0 -Xlinker "$SDK_VERSION")

swift build "${BUILD_FLAGS[@]}"
BIN_DIR="$(swift build "${BUILD_FLAGS[@]}" --show-bin-path)"
APP_DIR="$ROOT_DIR/build/Steward.app"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

cp "$BIN_DIR/Steward" "$APP_DIR/Contents/MacOS/Steward"
cp "$ROOT_DIR/Resources/Info.plist" "$APP_DIR/Contents/Info.plist"

chmod +x "$APP_DIR/Contents/MacOS/Steward"

echo "$APP_DIR"
