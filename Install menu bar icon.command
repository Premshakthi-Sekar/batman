#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
SUPPORT="$HOME/Library/Application Support/DesktopBatman"
APP="$SUPPORT/BatmanMenu.app"
MACOS="$APP/Contents/MacOS"
RES="$APP/Contents"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "Apple's command line tools are needed once."
  echo "If a window appears, click Install, wait, then run this file again."
  xcode-select --install || true
  read -r -p "Press Enter to close."
  exit 1
fi

mkdir -p "$MACOS" "$SUPPORT"
printf '%s\n' "$ROOT" > "$SUPPORT/repo-path"
chmod +x "$ROOT/scripts/launch-batman.sh"

cat > "$RES/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Batman Menu</string>
  <key>CFBundleIdentifier</key>
  <string>com.desktopbatman.menubar</string>
  <key>CFBundleExecutable</key>
  <string>BatmanMenu</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSUIElement</key>
  <true/>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
</dict>
</plist>
PLIST

echo "Building the menu bar icon..."
swiftc -O -sdk "$(xcrun --show-sdk-path)" -framework AppKit -o "$MACOS/BatmanMenu" "$ROOT/macos/BatmanMenu.swift"
chmod +x "$MACOS/BatmanMenu"

pkill -f "BatmanMenu.app/Contents/MacOS/BatmanMenu" 2>/dev/null || true
open "$APP"

osascript >/dev/null 2>&1 <<EOF || true
tell application "System Events"
  if not (exists login item "Batman Menu") then
    make login item at end with properties {path:"$APP", hidden:true}
  end if
end tell
EOF

echo
echo "Done. Look at the top-right menu bar for a bat 🦇"
echo "Click it to start Batman. Right-click for Quit Batman or remove the icon."
echo "The bat stays there after you quit Batman, and after you restart your Mac."
read -r -p "Press Enter to close."
