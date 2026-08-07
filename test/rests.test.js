import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyRests } from '../src/preparation/liquify/rests.js'

const parser = new (new JSDOM().window.DOMParser)()
const logger = { debug () {}, info () {}, warn () {}, error () {} }

test('liquifyRests animates a Verovio mRest group to its Thulemeier rest correspondence', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="mRest" data-id="at-mrest"><use transform="translate(100, 200) scale(0.72, 0.72)"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="rest" data-id="dt-rest"><use x="40" y="80"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const calls = []

  liquifyRests(ftSvg, dtSvg, null, {
    getNewPos: (atPosition, dtPosition) => ({ x: dtPosition.x * 2, y: dtPosition.y * 2 }),
    correspMappings: new Map([['at-mrest', ['dt-rest']]]),
    setAnimation: descriptor => calls.push(descriptor),
    logger
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].referenceId, 'dt-rest')
  assert.equal(calls[0].states.finding.val, '-20 -40')
  assert.equal(calls[0].states.normalization.val, '-20 -40')
  assert.equal(calls[0].states.regulation.val, '0 0')
})
