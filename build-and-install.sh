#!/bin/bash

# MarkText Build and Install Script
# Automates the complete build process with proper architecture support

set -e  # Exit on any error

echo "🔧 MarkText Build and Install Script"
echo "====================================="

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 Working directory: $PWD"

# Step 1: Clean previous builds
echo "🧹 Cleaning previous build artifacts..."
rm -rf dist/* out/* 2>/dev/null || true
rm -rf /Applications/marktext.app 2>/dev/null || true
echo "✅ Cleanup complete"

# Step 2: Minify localization files
echo "🌐 Minifying localization files..."
npm run minify-locales

# Step 3: Build the application
echo "🔨 Building application with latest changes..."
npm run build

# Step 4: Determine architecture and package accordingly
ARCH=$(uname -m)
echo "🖥️  Detected architecture: $ARCH"

if [[ "$ARCH" == "arm64" ]]; then
    echo "📦 Packaging for Apple Silicon (ARM64)..."
    npx electron-builder --mac --arm64 --publish never
    APP_PATH="dist/mac-arm64/marktext.app"
    DMG_PATH="dist/marktext-mac-arm64-0.18.4.dmg"
else
    echo "📦 Packaging for Intel (x64)..."
    npx electron-builder --mac --x64 --publish never
    APP_PATH="dist/mac/marktext.app"
    DMG_PATH="dist/marktext-mac-x64-0.18.4.dmg"
fi

# Step 5: Install the application
echo "📲 Installing MarkText to Applications..."
if [[ -d "$APP_PATH" ]]; then
    cp -r "$APP_PATH" /Applications/
    echo "✅ MarkText installed successfully!"
    echo "📍 Location: /Applications/marktext.app"
else
    echo "❌ Error: Built app not found at $APP_PATH"
    exit 1
fi

# Step 6: Show build artifacts
echo ""
echo "📦 Build artifacts created:"
ls -la dist/ | grep -E '\.(dmg|zip|app)$' || echo "No distribution files found"

echo ""
echo "🎉 Build and installation complete!"
echo "You can now launch MarkText from:"
echo "  • Applications folder"
echo "  • Spotlight search (Cmd+Space)"
echo "  • Launchpad"
echo ""
echo "📄 DMG installer available at: $DMG_PATH"