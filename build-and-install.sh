#!/bin/bash
# Build MarkText for this machine and install it.
#   Linux: /opt/MarkText (launcher: /usr/local/bin/marktext), needs sudo
#   macOS: /Applications/MarkText.app
# Quit MarkText before running this.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if pgrep -x marktext >/dev/null 2>&1 || pgrep -x MarkText >/dev/null 2>&1; then
  echo "MarkText is running. Quit it first." >&2
  exit 1
fi

rm -rf dist out
npm run minify-locales
npm run build

case "$(uname -s)" in
  Linux)
    npx electron-builder --linux dir --publish never
    # root-owned, so nothing running as you can replace the program you launch;
    # chrome-sandbox must be setuid root for Chromium's sandbox.
    sudo mkdir -p /opt/MarkText
    sudo rsync -a --delete --chown=root:root dist/linux-unpacked/ /opt/MarkText/
    sudo chmod 4755 /opt/MarkText/chrome-sandbox
    sudo ln -sf /opt/MarkText/marktext /usr/local/bin/marktext
    echo "Installed to /opt/MarkText"
    ;;
  Darwin)
    if [[ "$(uname -m)" == "arm64" ]]; then arch_flag=--arm64; else arch_flag=--x64; fi
    npx electron-builder --mac dir "$arch_flag" --publish never
    app="$(ls -d dist/mac*/*.app | head -n 1)"
    # Without a valid Developer ID the build is unsigned, and Apple Silicon
    # refuses to open an unsigned app; an ad-hoc signature is enough locally.
    if ! codesign --verify --deep "$app" 2>/dev/null; then
      codesign --force --deep --sign - "$app"
    fi
    target="/Applications/MarkText.app"
    if [[ -d "$target" ]]; then
      rm -rf "$target.bak"
      mv "$target" "$target.bak"
      echo "Previous version kept at $target.bak"
    fi
    cp -R "$app" "$target"
    echo "Installed to $target"
    ;;
  *)
    echo "Unsupported platform: $(uname -s)" >&2
    exit 1
    ;;
esac
