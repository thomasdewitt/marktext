#!/usr/bin/env node
// Runs the end-to-end specs: `npm run test:e2e [-- <spec name filter>]`.
// Builds the app first when `out/` is missing, and wraps the run in
// `xvfb-run` on a Linux machine with no display.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const run = (command, args) => spawnSync(command, args, { cwd: REPO, stdio: 'inherit' })

if (!fs.existsSync(path.join(REPO, 'out/main/index.js')) || process.env.MT_E2E_BUILD === '1') {
  const build = run('npm', ['run', 'build'])
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const filter = process.argv[2]
const specs = fs
  .readdirSync(path.join(HERE, 'specs'))
  .filter((name) => name.endsWith('.spec.mjs') && (!filter || name.includes(filter)))
  .map((name) => path.join('tests/e2e/specs', name))

if (!specs.length) {
  console.error(`No e2e spec matches "${filter}".`)
  process.exit(1)
}

// One spec file at a time: each one drives its own Electron window.
const nodeArgs = ['--test', '--test-concurrency=1', '--test-timeout=180000', ...specs]
const headless = process.platform === 'linux' && !process.env.DISPLAY
const result = headless
  ? run('xvfb-run', ['-a', '-s', '-screen 0 1440x900x24', process.execPath, ...nodeArgs])
  : run(process.execPath, nodeArgs)
process.exit(result.status ?? 1)
