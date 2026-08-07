import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyNotes } from '../src/preparation/liquify/notes.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyNotes keeps cross-staff phase-4 stems at the diplomatic length', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="note" data-id="a1">
      <g class="notehead"><use transform="translate(0, 100)"/></g>
      <g class="stem"><path d="M0 100 L0 300"/></g>
    </g></svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="note" data-id="d1">
      <g class="notehead"><use x="0" y="100"/></g>
      <g class="stem"><path d="M0 0 L0 50"/></g>
    </g></svg>
  `, 'image/svg+xml').documentElement
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="note" data-id="a1"><g class="notehead"><use transform="translate(0, 100)"/></g></g></svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString(`
    <mei><staff n="2"><layer><note xml:id="a1" staff="1" stem.dir="down"/></layer></staff></mei>
  `, 'text/xml')
  const calls = []

  liquifyNotes(ftSvg, dtSvg, atMeiDom, {
    scaleFactor: 2,
    getNewPos: point => point,
    correspMappings: new Map([['a1', ['d1']]]),
    atRegSvgDom,
    setAnimation: descriptor => calls.push(descriptor)
  })

  const stemAnimation = calls.find(call => call.element.localName === 'path')
  assert.equal(stemAnimation.states.finding.val, 'M0 100 L0 200')
  assert.equal(stemAnimation.states.normalization.val, 'M0 100 L0 200')
})
