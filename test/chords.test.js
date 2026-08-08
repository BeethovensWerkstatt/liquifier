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
  const stemPathAnimation = animationCalls.find(call => call.element.localName === 'path' && call.states.normalization?.type === 'd')
  const noteheadAnimations = animationCalls.filter(call => call.element.getAttribute('class') === 'notehead')
  assert.ok(flagAnimation)
  assert.ok(stemPathAnimation)
  assert.deepEqual(noteheadAnimations.map(call => call.referenceId), ['dt-chord', 'dt-chord'])
  assert.equal(stemPathAnimation.states.normalization.val, 'M10 20 L10 30')
  assert.equal(flagAnimation.states.finding.val, '5 17')
  assert.equal(flagAnimation.states.normalization.val, '5 7')
})

test('liquifyChords moves choice-contained noteheads to their separately rendered reg positions', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="chord" data-id="at-chord">
      <g class="note" data-id="orig-note"><g class="notehead"><use transform="translate(10, 20)"/></g></g>
    </g></svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="chord" data-id="dt-chord">
      <g class="note" data-id="dt-note"><g class="notehead"><use x="15" y="25"/></g></g>
    </g></svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString(`
    <mei><chord xml:id="at-chord"><choice><orig><note xml:id="orig-note"/></orig><reg><note xml:id="reg-note"/></reg></choice></chord></mei>
  `, 'text/xml')
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="note" data-id="reg-note"><g class="notehead"><use transform="translate(40, 50)"/></g></g></svg>
  `, 'image/svg+xml').documentElement
  const calls = []

  liquifyChords(ftSvg, dtSvg, atMeiDom, {
    scaleFactor: 1,
    getNewPos: (atPoint, dtPoint) => dtPoint,
    correspMappings: new Map([['at-chord', ['dt-chord']]]),
    atRegSvgDom,
    setAnimation: descriptor => calls.push(descriptor),
    logger: { debug () {}, info () {}, warn () {}, error () {} }
  })

  const noteheadAnimation = calls.find(call => call.element.getAttribute('class') === 'notehead')
  assert.equal(noteheadAnimation.states.regulation.val, '0 0')
  assert.equal(noteheadAnimation.states.interventions.val, '30 30')
})
