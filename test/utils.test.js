import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { getOuterBoundingRect, getPageDimensions } from '../src/utils/utils.js'

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
      <genDesc xml:id="wz1" corresp="#surf1" />
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
  assert.deepEqual(dims, { width: 210, height: 297 })
})
