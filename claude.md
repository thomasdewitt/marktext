# Claude Development Instructions

## Project Context

This is Thomas's pure vibecoding project for MarkText - a personal playground for experimenting with features and customizations!

## Platform

This project is primarily developed for **Mac OS**.

## Testing & Development Workflow

When making any new change or fixing a bug:

1. **Write or update tests** - Either create a new test or modify existing tests to cover your changes
2. **Run tests** - Execute the test suite to confirm your fix works and you haven't broken anything
3. **Test as much as possible** - While understanding that GUI functionality on Mac cannot be directly tested in this environment, test all logic, state management, and non-GUI code paths
4. **Update README** - Whenever you make significant changes or fix issues, update the README.md to reflect the current state

## Important Notes

- The ripgrep search issues mentioned in older documentation have been resolved - this is a good example of why keeping the README updated is important
- When fixing bugs, always investigate the root cause rather than just patching symptoms
- Test coverage is important for preventing regressions in this experimental project

## Running Tests

```bash
# Install dependencies if needed
npm install

# Run the test suite
npm test

# Run tests in watch mode during development
npm run test:watch
```

## Project Structure

Key areas to be aware of:

- **Sidebar & Navigation**: File tree, TOC, and navigation features
- **Editor & UI**: Main editor functionality, word count, status bar
- **Search**: Project-wide search with ripgrep integration
- **File Operations**: Creating, renaming, deleting files

## Development Best Practices

1. Keep changes focused and well-documented
2. Test your changes thoroughly before committing
3. Update documentation when you change behavior
4. Consider edge cases (multiple tabs, unsaved files, etc.)
5. Preserve existing functionality while adding new features

## Building & Running

### Initial Setup After Fresh Pull

After pulling updates from GitHub, you may need to rebuild native modules:

```bash
# Pull latest changes
git pull

# Build the project
npm run build

# If you get native-keymap errors when running dev, rebuild native modules
npm run rebuild-native
```

### Native Module Build Fix (macOS)

**Issue**: The `native-keymap` module fails to compile with Electron 38.2.2 because it requires C++20 standard but the binding.gyp doesn't specify it.

**Solution**: The fix has already been applied to `node_modules/native-keymap/binding.gyp` by adding:

```javascript
'cflags_cc': [ '-std=c++20' ],
'xcode_settings': {
  'CLANG_CXX_LANGUAGE_STANDARD': 'c++20',
  'CLANG_CXX_LIBRARY': 'libc++',
  'OTHER_CPLUSPLUSFLAGS': [ '-std=c++20' ]
},
```

**Note**: This fix is applied to the installed node_modules, so after running `npm install` or `npm ci`, you may need to re-apply this fix or run the rebuild command.

### Running the Development Server

```bash
# Start the dev server (rebuilds on changes)
npm run dev
```

The app will start at `http://localhost:5173/` with Electron opening automatically.

### Common Issues

1. **Port 5173 permission error**: Disable sandbox mode if you see `EPERM: operation not permitted` on port 5173
2. **Native module errors**: Run `npm run rebuild-native` to rebuild native modules for your Electron version
3. **C++ compilation errors**: The native-keymap module requires C++20; the fix above should resolve this
