import { spawn } from 'child_process'
import RipgrepDirectorySearcher from './ripgrepSearcher'

// Uses grep to list matching file paths on disk.
class FileSearcher extends RipgrepDirectorySearcher {
  searchInDirectory(directoryPath, pattern, options, numPathsFound) {
    const args = [options.followSymlinks ? '-R' : '-r', '-L', '-I', '-e', 'a^']

    if (!options.includeHidden) {
      args.push('--exclude=.*', '--exclude-dir=.*')
    }

    if (!options.noIgnore) {
      args.push('--exclude-dir=.git')
    }

    for (const inclusion of this.prepareGlobs(options.inclusions, directoryPath)) {
      args.push(`--include=${inclusion}`)
    }

    args.push(directoryPath)

    const executable = this.ensureGrepPath()
    if (!executable) {
      return Promise.reject(new Error('Grep binary not found.'))
    }

    let child = null
    try {
      child = spawn(executable, args, {
        cwd: directoryPath,
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (err) {
      return Promise.reject(err)
    }

    const didMatch = options.didMatch || (() => {})
    const didSearchPaths = options.didSearchPaths || (() => {})
    let cancelled = false

    const returnedPromise = new Promise((resolve, reject) => {
      let buffer = ''
      let bufferError = ''

      child.on('close', (code) => {
        if (cancelled) {
          resolve()
          return
        }

        // grep exit code: 0 = at least one selected file, 1 = none selected, >1 = error.
        if (code !== null && code > 1) {
          reject(new Error(bufferError || `grep exited with code ${code}`))
        } else {
          resolve()
        }
      })

      child.on('error', (err) => {
        reject(err)
      })

      child.stderr.on('data', (chunk) => {
        bufferError += chunk
      })

      child.stdout.on('data', (chunk) => {
        if (cancelled) {
          return
        }

        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line) {
            continue
          }
          didSearchPaths(++numPathsFound.num)
          didMatch(line)
        }
      })
    })

    returnedPromise.cancel = () => {
      cancelled = true
      if (child) {
        child.kill()
      }
    }

    return returnedPromise
  }
}

export default FileSearcher
