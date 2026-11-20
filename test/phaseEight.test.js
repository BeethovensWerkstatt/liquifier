import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  getFadeStates,
  getFirstPoint,
  getTranslationShift,
  markInterventions,
  setPhaseEightOpacity,
  setPhaseEightPoints
} from '../src/utils/ft/phaseEight.js'

const parseSvg = source => new JSDOM(source, { contentType: 'image/svg+xml' }).window.document.documentElement
const animation = (attributeName, last, before = last) => `<animate attributeName="${attributeName}" values="${['a', 'a', 'a', 'a', 'a', 'a', before, last].join(';')}"/>`
const className = element => (element.getAttribute('class') || '').split(/\s+/)

test('getFirstPoint reads the first coordinate pair of translate, path and points values', () => {
  assert.deepEqual(getFirstPoint('5 -6.5'), { x: 5, y: -6.5 })
  assert.deepEqual(getFirstPoint('M10 20 L30 40'), { x: 10, y: 20 })
  assert.deepEqual(getFirstPoint('1,2 3,4'), { x: 1, y: 2 })
  assert.equal(getFirstPoint('7'), null)
})

test('getTranslationShift sums the phase-8 change of translate animations on an element and its ancestors', () => {
  const svg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">
    <g id="outer"><animateTransform type="translate" values="0 0;0 0;0 0;0 0;0 0;0 0;0 0;-30 -5"/>
      <g id="inner"><animateTransform type="translate" values="0 0;0 0;0 0;0 0;0 0;0 0;10 10;15 20"/><path id="leaf"/></g>
    </g>
  </svg>`)

  assert.deepEqual(getTranslationShift(svg.querySelector('#leaf'), svg), { x: -25, y: 5 })
  assert.deepEqual(getTranslationShift(svg.querySelector('#outer'), svg), { x: -30, y: -5 })
})

test('getFadeStates fades in or out at the interventions phase only', () => {
  assert.deepEqual(Object.values(getFadeStates(true)).map(state => state.val), ['0', '0', '0', '0', '0', '1'])
  assert.deepEqual(Object.values(getFadeStates(false)).map(state => state.val), ['1', '1', '1', '1', '1', '0'])
})

test('setPhaseEightOpacity adjusts an existing opacity animation and keeps its earlier values', () => {
  const svg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><g id="part">${animation('opacity', '1')}</g></svg>`)

  setPhaseEightOpacity(svg.querySelector('#part'), false, { setAnimation: () => assert.fail('no animation expected') })

  assert.equal(svg.querySelector('animate').getAttribute('values'), 'a;a;a;a;a;a;1;0')
})

test('setPhaseEightOpacity adds an animation for an element that has none', () => {
  const svg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g id="part"/></svg>')
  const calls = []

  setPhaseEightOpacity(svg.querySelector('#part'), false, { setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(svg.querySelector('#part').getAttribute('opacity'), '1')
  assert.equal(calls[0].states.supplements.val, '1')
  assert.equal(calls[0].states.interventions.val, '0')
})

test('setPhaseEightPoints adjusts an existing animation, or adds one only if the points change', () => {
  const svg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">
    <polygon id="animated" points="0,0 10,0 10,5 0,5">${animation('points', '0,0 10,0 10,5 0,5')}</polygon>
    <polygon id="plain" points="0,0 10,0 10,5 0,5"/>
    <polygon id="unchanged" points="0,0 10,0 10,5 0,5"/>
  </svg>`)
  const calls = []
  const tools = { setAnimation: descriptor => calls.push(descriptor) }

  setPhaseEightPoints(svg.querySelector('#animated'), '0,0 8,0 8,5 0,5', tools)
  setPhaseEightPoints(svg.querySelector('#plain'), '0,0 8,0 8,5 0,5', tools)
  setPhaseEightPoints(svg.querySelector('#unchanged'), '0,0 10,0 10,5 0,5', tools)

  assert.equal(svg.querySelector('#animated animate').getAttribute('values').split(';')[7], '0,0 8,0 8,5 0,5')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].element, svg.querySelector('#plain'))
  assert.equal(calls[0].states.interventions.val, '0,0 8,0 8,5 0,5')
})

test('markInterventions marks what arrives as intervention suppl and what leaves as intervention remove', () => {
  const svg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">
    <g id="arrives">${animation('opacity', '1', '0')}</g>
    <g id="leaves" class="note">${animation('opacity', '0', '1')}</g>
    <g id="stays">${animation('opacity', '1', '1')}</g>
    <g id="hidden">${animation('opacity', '0', '0')}</g>
    <g id="moves">${animation('transform', '5 5', '0 0')}</g>
  </svg>`)

  markInterventions(svg)

  assert.deepEqual(className(svg.querySelector('#arrives')), ['intervention', 'suppl'])
  assert.deepEqual(className(svg.querySelector('#leaves')), ['note', 'intervention', 'remove'])
  ;['stays', 'hidden', 'moves'].forEach(id => assert.equal(svg.querySelector(`#${id}`).getAttribute('class'), null))
})
