import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { atomicWriteFile } from '../../src/main/filesystem'

describe('atomicWriteFile', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-atomic-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes the file with the supplied content', async () => {
    const target = path.join(dir, 'note.md')
    await atomicWriteFile(target, '# Hello', '.md')

    expect(fs.readFileSync(target, 'utf8')).toBe('# Hello')
  })

  it('appends the extension when missing', async () => {
    const target = path.join(dir, 'no-ext')
    await atomicWriteFile(target, 'x', '.md')

    expect(fs.existsSync(`${target}.md`)).toBe(true)
    expect(fs.readFileSync(`${target}.md`, 'utf8')).toBe('x')
  })

  it('rejects when called without a pathname', async () => {
    await expect(atomicWriteFile('', 'x', '.md')).rejects.toThrow()
  })

  it('cleans up the temp file on success (no stray files left behind)', async () => {
    const target = path.join(dir, 'note.md')
    await atomicWriteFile(target, 'final', '.md')

    const left = fs.readdirSync(dir)
    expect(left).toEqual(['note.md'])
  })

  it('replaces an existing file in place', async () => {
    const target = path.join(dir, 'note.md')
    fs.writeFileSync(target, 'old content')
    await atomicWriteFile(target, 'new content', '.md')

    expect(fs.readFileSync(target, 'utf8')).toBe('new content')
    const left = fs.readdirSync(dir).sort()
    expect(left).toEqual(['note.md'])
  })

  it('creates the parent directory if needed', async () => {
    const target = path.join(dir, 'nested', 'deep', 'note.md')
    await atomicWriteFile(target, 'deep', '.md')

    expect(fs.readFileSync(target, 'utf8')).toBe('deep')
  })
})
