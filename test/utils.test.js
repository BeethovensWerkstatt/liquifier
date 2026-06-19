import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { JSDOM } from 'jsdom'

import { getOuterBoundingRect, getPageDimensions, resolvePathFromDocumentReference, readTextFromDocumentReference } from '../src/utils/utils.js'

test('getOuterBoundingRect returns unchanged rectangle for 0 degree rotation', () => {
  const rect = getOuterBoundingRect(10, 20, 30, 40, 0)
  assert.deepEqual(rect, { x: 10, y: 20, w: 30, h: 40 })
})

test('getOuterBoundingRect expands bounding box for non-zero rotation', () => {
  const rect = getOuterBoundingRect(0, 0, 100, 50, 45)
  assert.equal(rect.w > 100, true)
  assert.equal(rect.h > 50, true)
})

test('getPageDimensions resolves folia size from source/transcription MEI', () => {
  const sourceXml = `
    <mei>
      <foliaDesc>
        <folium recto="#surf1" width="210" height="297" />
      </foliaDesc>
      <surface xml:id="surf1">
        <zone corresp="#surf1">
          <genDesc xml:id="wz1" />
        </zone>
      </surface>
    </mei>
  `

  const transcriptionXml = `
    <mei>
      <source target="#wz1" />
    </mei>
  `

  const sourceDom = new JSDOM(sourceXml, { contentType: 'text/xml' }).window.document
  const transcriptionDom = new JSDOM(transcriptionXml, { contentType: 'text/xml' }).window.document

  const dims = getPageDimensions(sourceDom, transcriptionDom)
  assert.deepEqual(dims, { width: 210, height: 297, surfaceId: 'surf1', position: 'recto' })
})

test('resolvePathFromDocumentReference resolves relative reference against source document path', () => {
  const sourcePath = '/tmp/input/sources/notebook.xml'
  const reference = './svg/page-005.svg'

  const resolved = resolvePathFromDocumentReference(reference, sourcePath)
  assert.equal(resolved, path.resolve('/tmp/input/sources/svg/page-005.svg'))
})

test('resolvePathFromDocumentReference returns absolute path unchanged', () => {
  const sourcePath = '/tmp/input/sources/notebook.xml'
  const absoluteReference = '/tmp/data/overlay.svg'

  const resolved = resolvePathFromDocumentReference(absoluteReference, sourcePath)
  assert.equal(resolved, absoluteReference)
})

test('readTextFromDocumentReference reads file content relative to source document path', () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'liquifier-utils-'))
  const sourcePath = path.join(baseDir, 'source.xml')
  const svgDir = path.join(baseDir, 'svg')
  const svgPath = path.join(svgDir, 'page.svg')

  writeFileSync(sourcePath, '<mei/>', 'utf8')
  mkdirSync(svgDir, { recursive: true })
  writeFileSync(svgPath, '<svg id="ok"/>', 'utf8')

  const content = readTextFromDocumentReference('./svg/page.svg', sourcePath)
  assert.equal(content, '<svg id="ok"/>')
})
