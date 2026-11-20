import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyRests } from '../src/preparation/liquify/rests.js'
import { finishChoices } from '../src/utils/ft/choices.js'
import { runDeferredRegulation } from '../src/utils/ft/regulation.js'

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

test('liquifyRests registers its interventions phase, which moves rests and replaces edited ones once all modules have run', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="layer" data-id="layer-1">
        <g class="choice" data-class="choice"><g class="orig" data-class="orig"><g class="rest" data-id="o-rest"><use transform="translate(100, 200)"/></g></g><g class="reg" data-class="reg"/></g>
        <g class="rest" data-id="moved-rest"><use transform="translate(300, 200)"/></g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="layer" data-id="layer-1">
        <g class="rest" data-id="a-rest"><use transform="translate(70, 190)"/></g>
        <g class="rest" data-id="moved-rest"><use transform="translate(250, 200)"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')
  const atMeiDom = parser.parseFromString(`
    <mei><music>
      <choice><orig><rest xml:id="o-rest" dur="4"/></orig><reg><rest xml:id="a-rest" dur="8"/></reg></choice>
      <rest xml:id="moved-rest" dur="4"/>
    </music></mei>
  `, 'text/xml')
  const calls = []
  const tools = {
    atRegSvgDom,
    getNewPos: (atPosition, dtPosition) => dtPosition,
    correspMappings: new Map(),
    setAnimation: descriptor => calls.push(descriptor),
    logger
  }

  liquifyRests(ftSvg, null, atMeiDom, tools)
  assert.equal(ftSvg.querySelector('.choice > .reg').children.length, 0)

  runDeferredRegulation(ftSvg, atMeiDom, tools)
  finishChoices(ftSvg, tools)

  // the edited rest is replaced as a whole, the other one is shifted to its reg position
  assert.equal(ftSvg.querySelector('.choice > .reg > .rest').getAttribute('data-id'), 'a-rest')
  const shift = calls.find(call => call.element.parentNode.getAttribute('data-id') === 'moved-rest' && call.states.interventions.type === 'translate')
  assert.equal(shift.states.interventions.val, '-50 0')
})
