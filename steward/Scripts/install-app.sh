#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIGURATION="${CONFIGURATION:-release}"
APPLICATIONS_DIR="${APPLICATIONS_DIR:-/Applications}"
APP_NAME="Steward.app"
BUILT_APP="$ROOT_DIR/build/$APP_NAME"
DEST_APP="$APPLICATIONS_DIR/$APP_NAME"

cd "$ROOT_DIR"

"$ROOT_DIR/Scripts/build-app.sh" "$CONFIGURATION"

mkdir -p "$APPLICATIONS_DIR"
rm -rf "$DEST_APP"
ditto "$BUILT_APP" "$DEST_APP"

chmod -R u+rwX "$DEST_APP"

echo "Installed $APP_NAME to $DEST_APP"
