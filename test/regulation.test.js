import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  deferRegulation,
  getContentContainer,
  markRegulationHandled,
  regulateLayout,
  runDeferredRegulation
} from '../src/utils/ft/regulation.js'

const parseSvg = source => new JSDOM(source, { contentType: 'image/svg+xml' }).window.document.documentElement
const parseMei = source => new JSDOM(source, { contentType: 'text/xml' }).window.document
const regulateAll = (ftSvg, atMeiDom, tools) => regulateLayout(ftSvg, ftSvg.querySelectorAll('g'), atMeiDom, tools)

const ANIMATION_TIMES = ['0 0', '0 0', '0 0', '0 0', '0 0', '0 0', '0 0']
const translateAnimation = last => `<animateTransform attributeName="transform" type="translate" values="${[...ANIMATION_TIMES, last].join(';')}"/>`

test('regulateLayout applies the orig-to-reg position delta on a nested wrapper', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="rest" data-id="rest-1"><use transform="translate(100, 200)"/></g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="rest" data-id="rest-1"><use transform="translate(160, 220)"/></g>
    </svg>`).ownerDocument
  const calls = []

  const moved = regulateAll(ftSvg, null, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  const rest = ftSvg.querySelector('.rest')
  const wrapper = rest.querySelector(':scope > g')
  assert.ok(wrapper)
  assert.deepEqual(moved, [rest])
  assert.equal(getContentContainer(rest), wrapper)
  assert.equal(wrapper.querySelector('use')?.getAttribute('transform'), 'translate(100, 200)')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].element, wrapper)
  assert.equal(calls[0].states.supplements.val, '0 0')
  assert.equal(calls[0].states.interventions.val, '60 20')
})

test('regulateLayout leaves unchanged positions unwrapped', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="clef" data-id="clef-1"><use transform="translate(100, 200)"/></g></svg>')
  const atRegSvgDom = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="clef" data-id="clef-1"><use transform="translate(100, 200)"/></g></svg>').ownerDocument
  const calls = []

  regulateAll(ftSvg, null, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(ftSvg.querySelector('.clef > g'), null)
  assert.equal(calls.length, 0)
})

test('regulateLayout does nothing without a reg rendering', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="clef" data-id="clef-1"><use transform="translate(100, 200)"/></g></svg>')

  assert.deepEqual(regulateAll(ftSvg, null, { setAnimation: () => assert.fail('no animation expected') }), [])
})

test('regulateLayout matches an articulated regulation element by data ID', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="artic" data-id="artic-1"><use transform="translate(100, 200)"/></g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="artic" data-id="artic-other"><use transform="translate(10, 20)"/></g>
      <g class="artic" data-id="artic-1"><use transform="translate(125, 240)"/></g>
    </svg>`).ownerDocument
  const calls = []

  regulateAll(ftSvg, null, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].states.interventions.val, '25 40')
})

test('regulateLayout pairs elements with generated ids through their MEI-id ancestor', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" data-class="measure" data-id="m1">
        <g class="barLine" data-class="barLine" data-id="gen-a"><path d="M500 10 L500 90"/></g>
        <g class="barLine" data-class="barLine" data-id="gen-b"><path d="M900 10 L900 90"/></g>
      </g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" data-class="measure" data-id="m1">
        <g class="barLine" data-class="barLine" data-id="other-a"><path d="M450 10 L450 90"/></g>
        <g class="barLine" data-class="barLine" data-id="other-b"><path d="M820 10 L820 90"/></g>
      </g>
    </svg>`).ownerDocument
  const atMeiDom = parseMei('<mei><music><measure xml:id="m1"/></music></mei>')
  const calls = []

  regulateAll(ftSvg, atMeiDom, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.deepEqual(calls.map(call => call.states.interventions.val), ['-50 0', '-80 0'])
})

test('regulateLayout skips generated ids whose counts differ between the renders', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-class="measure" data-id="m1"><g data-class="barLine" data-id="gen-a"><path d="M500 10 L500 90"/></g></g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-class="measure" data-id="m1">
        <g data-class="barLine" data-id="other-a"><path d="M450 10 L450 90"/></g>
        <g data-class="barLine" data-id="other-b"><path d="M820 10 L820 90"/></g>
      </g>
    </svg>`).ownerDocument
  const calls = []

  regulateAll(ftSvg, parseMei('<mei><music><measure xml:id="m1"/></music></mei>'), { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(calls.length, 0)
})

test('regulateLayout pairs orig-branch ids with their reg ids', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-class="note" data-id="onote-1"><use transform="translate(100, 200)"/></g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-class="note" data-id="note-1"><use transform="translate(70, 200)"/></g>
    </svg>`).ownerDocument
  const atMeiDom = parseMei('<mei><music><choice><orig><note xml:id="onote-1"/></orig><reg><note xml:id="note-1"/></reg></choice></music></mei>')
  const calls = []

  regulateAll(ftSvg, atMeiDom, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(calls[0].states.interventions.val, '-30 0')
})

test('regulateLayout does not repeat a shift that an ancestor already applies', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-class="note" data-id="note-1">${translateAnimation('-30 0')}
        <use transform="translate(100, 200)"/>
        <g data-class="accid" data-id="accid-1"><use transform="translate(90, 200)"/></g>
      </g>
      <g data-class="note" data-id="note-2"><use transform="translate(300, 200)"/>
        <g data-class="accid" data-id="accid-2"><use transform="translate(290, 200)"/></g>
      </g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-class="note" data-id="note-1"><use transform="translate(70, 200)"/>
        <g data-class="accid" data-id="accid-1"><use transform="translate(60, 200)"/></g>
      </g>
      <g data-class="note" data-id="note-2"><use transform="translate(250, 200)"/>
        <g data-class="accid" data-id="accid-2"><use transform="translate(240, 200)"/></g>
      </g>
    </svg>`).ownerDocument
  const calls = []
  // like the real writer, record the animation on the element so that descendants can see it
  const setAnimation = descriptor => {
    calls.push(descriptor)
    const animation = descriptor.element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'animateTransform')
    animation.setAttribute('type', 'translate')
    const { finding, normalization, readingOrder, regulation, supplements, interventions } = descriptor.states
    animation.setAttribute('values', ['0 0', '0 0', finding, normalization, readingOrder, regulation, supplements, interventions].map(state => state.val || state).join(';'))
    descriptor.element.appendChild(animation)
  }

  regulateAll(ftSvg, null, { atRegSvgDom, setAnimation })

  // note-1 and its accidental are already shifted by -30; note-2 is shifted once and its accidental inherits it
  assert.deepEqual(calls.map(call => call.states.interventions.val), ['-50 0'])
  assert.equal(calls[0].element.parentNode.getAttribute('data-id'), 'note-2')
})

test('regulateLayout leaves containers such as tremolos and beams to their own liquify module', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-class="bTrem" data-id="trem-1"><use transform="translate(100, 200)"/></g>
      <g data-class="beam" data-id="beam-1"><polygon points="0,0 10,0 10,5 0,5"/></g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-class="bTrem" data-id="trem-1"><use transform="translate(10, 20)"/></g>
      <g data-class="beam" data-id="beam-1"><polygon points="50,0 60,0 60,5 50,5"/></g>
    </svg>`).ownerDocument

  assert.deepEqual(regulateAll(ftSvg, null, { atRegSvgDom, setAnimation: () => assert.fail('no animation expected') }), [])
})

test('regulateLayout leaves elements alone that were marked as handled', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="slur" data-id="slur-1"><path d="M10 10 L20 20"/></g></svg>')
  const atRegSvgDom = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="slur" data-id="slur-1"><path d="M50 10 L60 20"/></g></svg>').ownerDocument
  const tools = { atRegSvgDom, setAnimation: () => assert.fail('no animation expected') }

  markRegulationHandled(tools, ftSvg.querySelector('.slur'))

  assert.deepEqual(regulateAll(ftSvg, null, tools), [])
})

test('runDeferredRegulation runs the registered work in order and then moves what no module regulated', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="rest" data-id="rest-1"><use transform="translate(100, 200)"/></g>
      <g class="fing" data-id="fing-1"><use transform="translate(300, 200)"/></g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="rest" data-id="rest-1"><use transform="translate(110, 200)"/></g>
      <g class="fing" data-id="fing-1"><use transform="translate(330, 200)"/></g>
    </svg>`).ownerDocument
  const order = []
  const warnings = []
  const tools = {
    atRegSvgDom,
    setAnimation: descriptor => order.push(descriptor.element.parentNode.getAttribute('data-id')),
    logger: { warn: message => warnings.push(message) }
  }

  deferRegulation(tools, () => order.push('first'))
  deferRegulation(tools, () => regulateLayout(ftSvg, ftSvg.querySelectorAll('g.rest'), null, tools))
  runDeferredRegulation(ftSvg, null, tools)

  assert.deepEqual(order, ['first', 'rest-1', 'fing-1'])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /fing/)

  // the work runs only once
  runDeferredRegulation(ftSvg, null, tools)
  assert.equal(order.length, 3)
})
