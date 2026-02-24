# MarkText Development Agents

This document provides instructions for creating and using specialized agents to help with MarkText development tasks.

## Building MarkText

### Quick Development Testing
For rapid testing during development, use development mode to avoid native module compilation issues:

```bash
npm run dev
```

This starts the app in development mode with hot reloading. The app may show warnings about native keyboard mapping modules, but core functionality will work.

### Full Production Build

#### Prerequisites
- Node.js and npm installed
- Xcode Command Line Tools (for macOS builds)
- Python 3 (for native module compilation)

#### Build Process
1. **Minify locales and build core**:
   ```bash
   npm run minify-locales
   npm run build
   ```

2. **Create distribution packages**:
   ```bash
   # For macOS (creates both x64 and ARM64)
   npx electron-builder --mac --publish never

   # For specific architecture
   npx electron-builder --mac --x64 --publish never
   npx electron-builder --mac --arm64 --publish never
   ```

#### Common Issues

**Native Module Compilation Failures**
- The `native-keymap` module often fails to compile due to C++ compatibility issues
- This is non-fatal - the app falls back to default keyboard mapping
- For development, use `npm run dev` to bypass this issue

**Architecture Mismatches**
- Apple Silicon Macs require ARM64 builds
- Intel Macs require x64 builds
- The build process creates both by default

**Build Outputs**
Successful builds create:
- `dist/mac/marktext.app` - x64 application
- `dist/mac-arm64/marktext.app` - ARM64 application (if completed)
- `dist/marktext-mac-x64-0.18.4.dmg` - Installer package
- `dist/marktext-mac-x64-0.18.4.zip` - Portable package

## Testing Changes

### Development Mode
```bash
npm run dev
```
- Enables hot reloading
- Faster startup
- Bypasses native module issues
- Ideal for testing UI/functionality changes

### Production Testing
```bash
# Open built app directly
open "dist/mac/marktext.app"  # for x64
open "dist/mac-arm64/marktext.app"  # for ARM64
```

## Troubleshooting

### Native Module Issues
If you encounter native module compilation errors:
1. Try development mode first: `npm run dev`
2. For production builds, the app will work despite native module warnings
3. Keyboard shortcuts may fall back to default US layout

### Build Timeouts
Electron-builder can be slow. If builds timeout:
1. Check `dist/` directory for partial builds
2. DMG and ZIP files may still be created successfully
3. Use `--dir` flag for faster unpacked builds: `npm run build:unpack`

### Code Signing Warnings
Code signing warnings are expected for personal builds and don't affect functionality.

## Agent Specializations

### Build Agent
- Handles full build processes
- Manages native module compilation
- Creates distribution packages
- Troubleshoots build issues

### Development Agent
- Sets up development environment
- Manages hot reloading
- Handles rapid testing cycles
- Debugs runtime issues

### Testing Agent
- Validates functionality across builds
- Tests on different architectures
- Verifies UI/UX changes
- Manages test environments