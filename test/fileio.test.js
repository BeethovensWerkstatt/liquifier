import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'

import { fetchData, writeData } from '../src/filehandlers/filehandler.js'

const parser = new (new JSDOM().window.DOMParser)()

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
  assert.equal(data.reconstructionDom, null)

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('fetchData keeps a preloaded reconstructionDom reference', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))

  const sourcePath = path.join(tmpRoot, 'sources', 'S.xml')
  const dtPath = path.join(tmpRoot, 'sources', 'diplomaticTranscripts', 'A_p001_wz01_dt.xml')
  const atPath = path.join(tmpRoot, 'sources', 'annotatedTranscripts', 'A_p001_wz01_at.xml')

  write(sourcePath, '<mei><sourceDoc/></mei>')
  write(dtPath, '<mei><music/></mei>')
  write(atPath, '<mei><music/></mei>')

  const reconstructionDom = parser.parseFromString('<mei><reconstruction/></mei>', 'text/xml')

  const triple = {
    sourceFullPath: sourcePath,
    dtFullPath: dtPath,
    atFullPath: atPath
  }

  const data = await fetchData(triple, false, './', { reconstructionDom })

  assert.ok(data)
  assert.equal(data.reconstructionDom, reconstructionDom)

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('fetchData loads reconstructionDom from contextDocument', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))

  const sourcePath = path.join(tmpRoot, 'sources', 'S.xml')
  const dtPath = path.join(tmpRoot, 'sources', 'diplomaticTranscripts', 'A_p001_wz01_dt.xml')
  const atPath = path.join(tmpRoot, 'sources', 'annotatedTranscripts', 'A_p001_wz01_at.xml')
  const contextPath = path.join(tmpRoot, 'Notirungsbuch_K', 'Notirungsbuch_K.xml')

  write(sourcePath, '<mei><sourceDoc/></mei>')
  write(dtPath, '<mei><music/></mei>')
  write(atPath, '<mei><music/></mei>')
  write(contextPath, '<mei><context/></mei>')

  const triple = {
    sourceFullPath: sourcePath,
    dtFullPath: dtPath,
    atFullPath: atPath
  }

  const data = await fetchData(triple, false, tmpRoot, {
    contextDocument: 'Notirungsbuch_K'
  })

  assert.ok(data)
  assert.ok(data.reconstructionDom)
  assert.equal(data.reconstructionDom.documentElement.nodeName, 'mei')
  assert.equal(data.reconstructionDom.querySelector('context')?.nodeName, 'context')

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
