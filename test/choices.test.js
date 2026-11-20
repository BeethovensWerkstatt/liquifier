import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import {
  createChoice,
  findRhythmChoice,
  finishChoices,
  placeInRegBranch,
  queueChoiceUnwrap,
  regulatePolygonLines,
  swapWholeEvent
} from '../src/utils/ft/choices.js'

const parseSvg = source => new JSDOM(source, { contentType: 'image/svg+xml' }).window.document.documentElement
const parseMei = source => new JSDOM(source, { contentType: 'text/xml' }).window.document
const choiceSvg = content => `<g class="choice" data-class="choice"><g class="orig" data-class="orig">${content}</g><g class="reg" data-class="reg"/></g>`

test('createChoice builds the markup that Verovio uses for choices', () => {
  const doc = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><path id="a"/><path id="b"/></svg>').ownerDocument
  const [a, b] = Array.from(doc.querySelectorAll('path'))

  const choice = createChoice(doc, [a], [b])

  assert.equal(choice.getAttribute('class'), 'choice')
  assert.equal(choice.getAttribute('data-class'), 'choice')
  assert.deepEqual(Array.from(choice.children).map(child => child.getAttribute('class')), ['orig', 'reg'])
  assert.equal(choice.querySelector('.orig > path'), a)
  assert.equal(choice.querySelector('.reg > path'), b)
})

test('placeInRegBranch adds content to the reg branch next to the orig that holds the element', () => {
  const ftSvg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${choiceSvg('<g class="rest" data-id="o-rest"/>')}</svg>`)
  const content = ftSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')

  assert.equal(placeInRegBranch(ftSvg.querySelector('.rest'), content), true)
  assert.equal(ftSvg.querySelector('.choice > .reg > g'), content)

  const plain = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="rest"/></svg>')
  assert.equal(placeInRegBranch(plain.querySelector('.rest'), content), false)
})

const meiWithChoices = parseMei(`<mei><music>
  <choice><orig><rest xml:id="o-rest" dur="4"/></orig><reg><rest xml:id="a-rest" dur="2"/></reg></choice>
  <choice><orig><note xml:id="o-pitch" dur="4" pname="c"/></orig><reg><note xml:id="a-pitch" dur="4" pname="d"/></reg></choice>
  <choice><orig><note xml:id="o-both" dur="4" pname="c"/></orig><reg><note xml:id="a-both" dur="8" pname="d"/></reg></choice>
  <note xml:id="plain" dur="4"/>
</music></mei>`)
const regSvgWithRests = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">
  <g class="rest" data-id="a-rest"><use href="#regGlyph" transform="translate(70, 190)"/></g>
  <g class="note" data-id="a-both"><use href="#regGlyph"/></g>
</svg>`).ownerDocument
const renderedEvent = (className, id) => parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><g class="${className}" data-id="${id}"/></svg>`).querySelector('g')

test('findRhythmChoice finds events whose rhythm differs between orig and reg', () => {
  const found = findRhythmChoice(renderedEvent('rest', 'o-rest'), meiWithChoices, regSvgWithRests)

  assert.equal(found.regId, 'a-rest')
  assert.equal(found.regElement.getAttribute('data-id'), 'a-rest')
  assert.equal(found.pitchChanged, false)
})

test('findRhythmChoice tells whether the pitch changes as well', () => {
  assert.equal(findRhythmChoice(renderedEvent('note', 'o-both'), meiWithChoices, regSvgWithRests).pitchChanged, true)
})

test('findRhythmChoice ignores events without rhythm edit and warns if the reg rendering is missing', () => {
  assert.equal(findRhythmChoice(renderedEvent('note', 'o-pitch'), meiWithChoices, regSvgWithRests), null)
  assert.equal(findRhythmChoice(renderedEvent('note', 'plain'), meiWithChoices, regSvgWithRests), null)
  assert.equal(findRhythmChoice(renderedEvent('rest', 'unknown'), meiWithChoices, regSvgWithRests), null)

  const warnings = []
  const noReg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"/>').ownerDocument
  assert.equal(findRhythmChoice(renderedEvent('rest', 'o-rest'), meiWithChoices, noReg, { warn: message => warnings.push(message) }), null)
  assert.equal(warnings.length, 1)
})

test('swapWholeEvent adds the reg rendering to the reg branch, fades both, and lets it travel from the orig position', () => {
  const ftSvg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><defs/>${choiceSvg('<g class="rest" data-id="o-rest"><use href="#regGlyph" transform="translate(100, 200)"/></g>')}</svg>`)
  const atRegSvgDom = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">
    <defs><g id="regGlyph"><path d="M0 0 L1 1"/></g></defs>
    <g class="rest" data-id="a-rest" id="svg-id"><use href="#regGlyph" transform="translate(70, 190)"/></g>
  </svg>`).ownerDocument
  const calls = []
  const tools = { atRegSvgDom, correspMappings: new Map([['o-rest', ['dt-rest']]]), setAnimation: descriptor => calls.push(descriptor) }
  const element = ftSvg.querySelector('.rest')
  const found = findRhythmChoice(element, meiWithChoices, atRegSvgDom)

  swapWholeEvent(ftSvg, element, found, atRegSvgDom, tools)

  const overlay = ftSvg.querySelector('.choice > .reg > .rest')
  assert.equal(overlay.getAttribute('data-id'), 'a-rest')
  assert.equal(overlay.hasAttribute('id'), false)
  assert.equal(overlay.getAttribute('opacity'), '0')
  assert.ok(ftSvg.querySelector('defs [id="regGlyph"]'))

  const origFade = calls.find(call => call.element === element)
  const regFade = calls.find(call => call.element === overlay && call.states.interventions.type === 'opacity')
  assert.equal(origFade.referenceId, 'dt-rest')
  assert.equal(origFade.states.supplements.val, '1')
  assert.equal(origFade.states.interventions.val, '0')
  assert.equal(regFade.states.supplements.val, '0')
  assert.equal(regFade.states.interventions.val, '1')

  const travel = calls.find(call => call.element === overlay && call.states.interventions.type === 'translate')
  assert.equal(travel.states.supplements.val, '30 10')
  assert.equal(travel.states.interventions.val, '0 0')
})

test('swapWholeEvent warns and changes nothing without a reg branch to put the reg rendering in', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="rest" data-id="o-rest"/></svg>')
  const warnings = []
  const found = { regId: 'a-rest', regElement: regSvgWithRests.querySelector('.rest') }

  swapWholeEvent(ftSvg, ftSvg.querySelector('.rest'), found, regSvgWithRests, { setAnimation: () => assert.fail('no animation expected') }, { warn: message => warnings.push(message) })

  assert.equal(warnings.length, 1)
})

test('finishChoices replaces queued choice groups by their event and renames ids and ledger references', () => {
  const ftSvg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">
    <g class="layer">${choiceSvg('<g class="chord" data-id="o-chord"><g class="note" data-id="o-n1"/><g class="note" data-id="o-n2"/></g>')}</g>
    <g class="layer">${choiceSvg('<g class="note" data-id="o-kept"/>')}</g>
    <g class="lineDash" data-related="#o-n2 #other"/>
    <g class="lineDash" data-related="#o-chord"/>
  </svg>`)
  const tools = {}

  queueChoiceUnwrap(tools, ftSvg.querySelector('.chord'), 'a-chord', [['o-n1', 'a-n1'], ['o-n2', 'a-n2']])
  finishChoices(ftSvg, tools)

  const chord = ftSvg.querySelector('.layer > .chord')
  assert.equal(chord.getAttribute('data-id'), 'a-chord')
  assert.deepEqual(Array.from(chord.querySelectorAll('.note')).map(note => note.getAttribute('data-id')), ['a-n1', 'a-n2'])
  assert.deepEqual(Array.from(ftSvg.querySelectorAll('.lineDash')).map(line => line.getAttribute('data-related')), ['#a-n2 #other', '#a-chord'])
  // only what was queued is unwrapped
  assert.equal(ftSvg.querySelectorAll('.choice').length, 1)
  assert.equal(ftSvg.querySelector('.choice > .orig > .note').getAttribute('data-id'), 'o-kept')

  // the queue is empty afterwards
  finishChoices(ftSvg, tools)
  assert.equal(chord.getAttribute('data-id'), 'a-chord')
})

test('finishChoices does not touch events that are not inside a choice group', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="layer"><g class="note" data-id="o-note"/></g></svg>')
  const tools = {}

  queueChoiceUnwrap(tools, ftSvg.querySelector('.note'), 'a-note')
  finishChoices(ftSvg, tools)

  assert.equal(ftSvg.querySelector('.note').getAttribute('data-id'), 'o-note')
})

test('regulatePolygonLines reshapes lines that exist in both renderings', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g><polygon points="0,0 100,0 100,10 0,10"/></g></svg>')
  const calls = []

  regulatePolygonLines(Array.from(ftSvg.querySelectorAll('polygon')), ['0,0 80,0 80,10 0,10'], { setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].states.supplements.val, '0,0 100,0 100,10 0,10')
  assert.equal(calls[0].states.interventions.val, '0,0 80,0 80,10 0,10')
  assert.equal(ftSvg.querySelector('.choice'), null)
})

test('regulatePolygonLines recycles lines and fades in only the additional reg line in a choice', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g><polygon fill="#000" points="0,0 100,0 100,10 0,10"/><g class="note"/></g></svg>')
  const calls = []
  const recycled = ftSvg.querySelector('polygon')

  regulatePolygonLines([recycled], ['0,0 80,0 80,10 0,10', '0,20 80,20 80,30 0,30'], { setAnimation: descriptor => calls.push(descriptor) })

  const recycledMove = calls.find(call => call.element === recycled)
  assert.equal(recycledMove.states.interventions.val, '0,0 80,0 80,10 0,10')
  assert.equal(recycled.getAttribute('opacity'), null)

  const choices = ftSvg.querySelectorAll('g > .choice')
  assert.equal(choices.length, 1)
  assert.equal(choices[0].querySelectorAll('.orig > *').length, 0)
  const added = choices[0].querySelector('.reg > polygon')
  assert.equal(added.getAttribute('opacity'), '0')
  assert.equal(added.getAttribute('fill'), '#000')
  // the new line grows out of the recycled one
  const growth = calls.find(call => call.element === added && call.states.interventions.type === 'points')
  assert.equal(growth.states.supplements.val, '0,0 100,0 100,10 0,10')
  assert.equal(growth.states.interventions.val, '0,20 80,20 80,30 0,30')
  assert.equal(calls.find(call => call.element === added && call.states.interventions.type === 'opacity').states.interventions.val, '1')
  assert.ok(ftSvg.querySelector('g > .note'))
})

test('regulatePolygonLines moves a surplus orig line onto its neighbour while it fades out', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g><polygon points="0,0 100,0 100,10 0,10"/><polygon points="0,20 100,20 100,30 0,30"/></g></svg>')
  const calls = []

  regulatePolygonLines(Array.from(ftSvg.querySelectorAll('polygon')), ['0,0 80,0 80,10 0,10'], { setAnimation: descriptor => calls.push(descriptor) })

  const removed = ftSvg.querySelector('g > .choice > .orig > polygon')
  assert.equal(removed.getAttribute('points'), '0,20 100,20 100,30 0,30')
  assert.equal(ftSvg.querySelectorAll('g > .choice > .reg > *').length, 0)
  assert.equal(calls.find(call => call.element === removed && call.states.interventions.type === 'points').states.interventions.val, '0,0 80,0 80,10 0,10')
  assert.equal(calls.find(call => call.element === removed && call.states.interventions.type === 'opacity').states.interventions.val, '0')
})

test('regulatePolygonLines does nothing if one of the renderings has no lines', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g><polygon points="0,0 1,0 1,1 0,1"/></g></svg>')
  const tools = { setAnimation: () => assert.fail('no animation expected') }

  regulatePolygonLines(Array.from(ftSvg.querySelectorAll('polygon')), [], tools)
  regulatePolygonLines([], ['0,0 1,0 1,1 0,1'], tools)
})
