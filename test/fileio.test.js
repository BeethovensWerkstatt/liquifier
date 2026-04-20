import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { fetchData, writeData } from '../src/filehandlers/filehandler.js'

/**
 * Writes the output data.
 *
 * @param {string} filePath - File or resource path.
 * @param {string} content - String input used by this function.
 * @returns {void} No return value.
 */
const write = (filePath, content = '<mei/>') => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

test('fetchData parses source, dt, and at XML files', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))

  const sourcePath = path.join(tmpRoot, 'sources', 'S.xml')
  const dtPath = path.join(tmpRoot, 'sources', 'diplomaticTranscripts', 'A_p001_wz01_dt.xml')
  const atPath = path.join(tmpRoot, 'sources', 'annotatedTranscripts', 'A_p001_wz01_at.xml')

  write(sourcePath, '<mei><sourceDoc/></mei>')
  write(dtPath, '<mei><music/></mei>')
  write(atPath, '<mei><music/></mei>')

  const triple = {
    sourceFullPath: sourcePath,
    dtFullPath: dtPath,
    atFullPath: atPath
  }

  const data = await fetchData(triple, false, './')

  assert.ok(data)
  assert.equal(data.sourceDom.documentElement.nodeName, 'mei')
  assert.equal(data.dtDom.documentElement.nodeName, 'mei')
  assert.equal(data.atDom.documentElement.nodeName, 'mei')

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('writeData creates parent folders and writes content', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))
  const target = path.join(tmpRoot, 'nested', 'folder', 'out.txt')

  await writeData('hello world', target)

  const content = fs.readFileSync(target, 'utf8')
  assert.equal(content, 'hello world')

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})
