import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { serializeXmlCanonical } from '../src/utils/xml.js'

const parser = new (new JSDOM().window.DOMParser)()

test('serializeXmlCanonical creates predictable indentation', () => {
  const xml = '<mei><meiHead><fileDesc><titleStmt><title>A</title></titleStmt></fileDesc></meiHead><music><body/></music></mei>'
  const dom = parser.parseFromString(xml, 'text/xml')

  const out = serializeXmlCanonical(dom)

  assert.match(out, /^<mei>/)
  assert.match(out, /\n  <meiHead>/)
  assert.match(out, /\n    <fileDesc>/)
  assert.match(out, /\n      <titleStmt>/)
  assert.match(out, /\n        <title>A<\/title>/)
  assert.match(out, /\n  <music>/)
})

test('serializeXmlCanonical sorts attributes for deterministic output', () => {
  const xml = '<mei><elem z="2" a="1" m="3"/></mei>'
  const dom = parser.parseFromString(xml, 'text/xml')

  const out = serializeXmlCanonical(dom)

  assert.match(out, /<elem a="1" m="3" z="2"\/>/)
})
