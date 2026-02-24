import EnvPaths from 'common/envPaths'

// Get ripgrep path, handling both context isolation and non-isolation modes
const getRgPath = () => {
  // In context-isolated mode, rgPath is exposed at window level
  if (typeof window !== 'undefined' && window.rgPath) {
    return window.rgPath
  }
  // In non-isolated mode or if not available, try global rgPath
  if (typeof rgPath !== 'undefined') {
    return rgPath
  }
  // Fallback to empty string
  return ''
}

// // "vscode-ripgrep" is unpacked out of asar because of the binary.
const rgPathValue = getRgPath()
const rgDiskPath = rgPathValue ? rgPathValue.replace(/\bapp\.asar\b/, 'app.asar.unpacked') : ''

class RendererPaths extends EnvPaths {
  /**
   * Configure and sets all application paths.
   *
   * @param {string} userDataPath The user data path.
   */
  constructor(userDataPath) {
    if (!userDataPath) {
      throw new Error('No user data path is given.')
    }

    // Initialize environment paths
    super(userDataPath)

    // Allow to use a local ripgrep binary (e.g. an optimized version).
    if (process.env.MARKTEXT_RIPGREP_PATH) {
      // NOTE: Binary must be a compatible version, otherwise the searcher may fail.
      this._ripgrepBinaryPath = process.env.MARKTEXT_RIPGREP_PATH
    } else {
      this._ripgrepBinaryPath = rgDiskPath
    }
  }

  // Returns the path to ripgrep on disk.
  get ripgrepBinaryPath() {
    return this._ripgrepBinaryPath
  }
}

export default RendererPaths
