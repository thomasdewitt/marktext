import EnvPaths from 'common/envPaths'

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

    super(userDataPath)

    this._grepBinaryPath = process.env.MARKTEXT_GREP_PATH || 'grep'
  }

  get grepBinaryPath() {
    return this._grepBinaryPath
  }
}

export default RendererPaths
