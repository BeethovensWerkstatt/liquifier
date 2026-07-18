import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { animateFtReadingOrderSystems } from '../src/utils/ft/staffLines.js'

const parser = new (new JSDOM().window.DOMParser)()

test('animateFtReadingOrderSystems uses sb corresp and moves the matched system and rastrum together', () => {
  const atLayer = parser.parseFromString(`
    <g xmlns="http://www.w3.org/2000/svg">
      <g class="systemBegin" data-system-id="sb-top"/>
      <g class="systemBegin" data-system-id="sb-bottom"/>
      <g class="bw-system-rastrum" data-system-id="sb-top"><path class="rastrum" d="M100 100 L300 100"/></g>
      <g class="bw-system-rastrum" data-system-id="sb-bottom"><path class="rastrum" d="M100 300 L300 300"/></g>
    </g>
  `, 'image/svg+xml').documentElement
  const dtLayer = parser.parseFromString(`
    <g xmlns="http://www.w3.org/2000/svg">
      <g class="system" data-id="dt-bottom"><g class="rastrum"><path d="M0 20 L100 20"/></g></g>
      <g class="system" data-id="dt-top"><g class="rastrum"><path d="M0 40 L150 40"/></g></g>
    </g>
  `, 'image/svg+xml').documentElement
  const atMei = parser.parseFromString(`
    <mei><sb xml:id="sb-top" corresp="#dt-top"/><sb xml:id="sb-bottom" corresp="#dt-bottom"/></mei>
  `, 'text/xml')
  const recorded = []

  animateFtReadingOrderSystems(atLayer, dtLayer, atMei, {
    getNewPos: (at, dt) => dt,
    setAnimation: descriptor => recorded.push(descriptor),
    logger: { warn: () => {} }
  })

  assert.equal(recorded.length, 4)
  const topSystem = recorded.find(({ element }) => element.getAttribute('class') === 'systemBegin' && element.getAttribute('data-system-id') === 'sb-top')
  const topRastrum = recorded.find(({ element }) => element.getAttribute('class') === 'bw-system-rastrum' && element.getAttribute('data-system-id') === 'sb-top')
  assert.ok(topSystem)
  assert.ok(topRastrum)
  const bottomSystem = recorded.find(({ element }) => element.getAttribute('class') === 'systemBegin' && element.getAttribute('data-system-id') === 'sb-bottom')
  const bottomRastrum = recorded.find(({ element }) => element.getAttribute('class') === 'bw-system-rastrum' && element.getAttribute('data-system-id') === 'sb-bottom')
  assert.ok(bottomSystem)
  assert.ok(bottomRastrum)
  assert.equal(topSystem.states.readingOrder.val, '100 60')
  assert.equal(topRastrum.states.readingOrder.val, '100 60')
  assert.equal(bottomSystem.states.readingOrder.val, '250 280')
  assert.equal(bottomRastrum.states.readingOrder.val, '250 280')
  assert.equal(topSystem.states.regulation.val, '0 0')
  assert.equal(topRastrum.states.regulation.val, '0 0')
})
