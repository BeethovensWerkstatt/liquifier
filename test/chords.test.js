import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyChords } from '../src/preparation/liquify/chords.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyChords keeps a down-stem flag at the translated stem endpoint', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="chord" data-id="at-chord">
        <g class="stem"><path d="M10 20 L10 30"/><g class="flag"/></g>
        <g class="note" data-id="at-note-1"><g class="notehead"><use transform="translate(10, 20)"/></g></g>
        <g class="note" data-id="at-note-2"><g class="notehead"><use transform="translate(10, 30)"/></g></g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="chord" data-id="dt-chord">
        <g class="stem"><path d="M10 20 L10 40"/></g>
        <g class="note" data-id="dt-note-1"><g class="notehead"><use x="15" y="25"/></g></g>
        <g class="note" data-id="dt-note-2"><g class="notehead"><use x="15" y="37"/></g></g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <chord xml:id="at-chord" stem.dir="down"/>
    </mei>
  `, 'text/xml')
  const animationCalls = []

  liquifyChords(ftSvg, dtSvg, atMeiDom, {
    scaleFactor: 1,
    getNewPos: (atPoint, dtPoint) => dtPoint,
    correspMappings: new Map([['at-chord', ['dt-chord']]]),
    setAnimation: descriptor => animationCalls.push(descriptor),
    logger: { debug () {}, info () {}, warn () {}, error () {} }
  })

  const flagAnimation = animationCalls.find(call => call.element.getAttribute('class') === 'flag')
  assert.ok(flagAnimation)
  assert.equal(flagAnimation.states.finding.val, '5 17')
  assert.equal(flagAnimation.states.normalization.val, '5 7')
})
