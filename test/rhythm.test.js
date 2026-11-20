import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { finishChoices } from '../src/utils/ft/choices.js'
import { markInterventions } from '../src/utils/ft/phaseEight.js'
import { regulateLayout } from '../src/utils/ft/regulation.js'
import { regulateRhythm } from '../src/utils/ft/rhythm.js'

const parseSvg = source => new JSDOM(source, { contentType: 'image/svg+xml' }).window.document.documentElement
const parseMei = source => new JSDOM(source, { contentType: 'text/xml' }).window.document
const choiceSvg = content => `<g class="choice" data-class="choice"><g class="orig" data-class="orig">${content}</g><g class="reg" data-class="reg"/></g>`
const className = element => (element.getAttribute('class') || '').split(/\s+/)

// Like the real writer, leave the opacity animation in the DOM, where it is picked up to mark phase-8 changes.
const writeOpacityAnimation = (calls, descriptor) => {
  calls.push(descriptor)
  if (descriptor.states.interventions.type !== 'opacity') return

  const animation = descriptor.element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'animate')
  animation.setAttribute('attributeName', 'opacity')
  const phases = ['finding', 'normalization', 'readingOrder', 'regulation', 'supplements', 'supplements', 'supplements', 'interventions']
  animation.setAttribute('values', phases.map(phase => descriptor.states[phase].val).join(';'))
  descriptor.element.appendChild(animation)
}

// What liquifyMusic does for the interventions phase, for the rhythm of the events in an SVG
const regulateEvents = (ftSvg, atMeiDom, atRegSvgDom, calls) => {
  const tools = { atRegSvgDom, correspMappings: new Map(), setAnimation: descriptor => writeOpacityAnimation(calls, descriptor) }
  const events = ftSvg.querySelectorAll('g.note, g.chord, g.rest, g.mRest')
  regulateLayout(ftSvg, events, atMeiDom, tools)
  events.forEach(event => regulateRhythm(ftSvg, event, atMeiDom, tools))
  finishChoices(ftSvg, tools)
  markInterventions(ftSvg)
}

const translateTo = shift => shift ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 0;0 0;0 0;0 0;0 0;${shift}"/>` : ''
const noteSvg = (id, { head = 'E0A4', y = 200, stem = true, flag = false, dots = 0, x = 100, shift = '' } = {}) => `
  <g class="note" data-class="note" data-id="${id}">${translateTo(shift)}
    <g class="notehead" data-class="notehead"><use href="#${head}-suffix" transform="translate(${x}, ${y}) scale(0.665, 0.665)"/></g>
    ${dots ? `<g class="dots" data-class="dots">${'<ellipse cx="1" cy="2" rx="3" ry="3"/>'.repeat(dots)}</g>` : ''}
    ${stem ? `<g class="stem" data-class="stem"><path d="M${x + 8} ${y} L${x + 8} ${y + 300}"/>${flag ? `<g class="flag" data-class="flag"><use href="#E241-suffix" transform="translate(${x + 8}, ${y + 300})"/></g>` : ''}</g>` : ''}
  </g>`

const noteMei = parseMei(`<mei><music>
  <choice><orig><note xml:id="o-note" dur="4"/></orig><reg><note xml:id="a-note" dur="8"/></reg></choice>
  <choice><orig><note xml:id="o-pitchnote" dur="4" pname="c"/></orig><reg><note xml:id="a-pitchnote" dur="8" pname="d"/></reg></choice>
</music></mei>`)
const morphNote = (origNote, regNote, { id = 'o-note' } = {}) => {
  const ftSvg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><defs><g id="E0A4-suffix"/></defs><g class="layer" data-id="layer-1">${choiceSvg(origNote)}</g></svg>`)
  const atRegSvgDom = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><defs><g id="E241-suffix"><path d="M0 0"/></g></defs>${regNote}</svg>`).ownerDocument
  const calls = []
  const ledger = ftSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
  ledger.setAttribute('data-related', `#${id}`)
  ftSvg.appendChild(ledger)
  regulateEvents(ftSvg, noteMei, atRegSvgDom, calls)
  return { ftSvg, calls, ledger }
}

test('regulateRhythm adds only the new flag, in a choice of its own, when a note turns from a quarter into an eighth', () => {
  const { ftSvg, calls, ledger } = morphNote(noteSvg('o-note', { x: 100, y: 200, shift: '-40 -50' }), noteSvg('a-note', { x: 60, y: 150, flag: true }))

  // the choice around the whole note is gone, the note carries its AT id again, and ledger lines follow
  const note = ftSvg.querySelector('.layer > .note')
  assert.equal(note.getAttribute('data-id'), 'a-note')
  assert.equal(ledger.getAttribute('data-related'), '#a-note')
  assert.equal(ftSvg.querySelectorAll('.choice').length, 1)

  const choice = ftSvg.querySelector('.stem > .choice')
  assert.equal(choice.querySelectorAll('.orig > *').length, 0)
  const reg = choice.querySelector('.reg')
  assert.ok(reg.querySelector('.flag'))
  // reg parts are drawn relative to where the orig notehead ends up
  assert.equal(reg.getAttribute('transform'), 'translate(40 50)')
  assert.equal(reg.getAttribute('opacity'), '0')
  const regFades = calls.filter(call => call.element === reg)
  assert.equal(regFades.length, 1)
  assert.equal(regFades[0].states.supplements.val, '0')
  assert.equal(regFades[0].states.interventions.val, '1')
  assert.equal(note.querySelector('.notehead').getAttribute('opacity'), null)
})

test('regulateRhythm puts only the notehead in a choice when the head glyph changes', () => {
  const { ftSvg, calls } = morphNote(noteSvg('o-note', { head: 'E0A3' }), noteSvg('a-note', { head: 'E0A4' }))

  const choice = ftSvg.querySelector('.note > .choice')
  assert.equal(choice.querySelector('.reg use').getAttribute('href'), '#E0A4-suffix')
  const head = choice.querySelector('.orig > .notehead')
  assert.ok(head)
  const headFade = calls.find(call => call.element === head)
  assert.equal(headFade.states.supplements.val, '1')
  assert.equal(headFade.states.interventions.val, '0')
  assert.equal(ftSvg.querySelector('.stem').getAttribute('opacity'), null)
  assert.equal(ftSvg.querySelector('.stem').parentNode.getAttribute('class'), 'note')
})

test('regulateRhythm fades a stem in when a whole note becomes a half note and dots out when they vanish', () => {
  const { ftSvg, calls } = morphNote(
    noteSvg('o-note', { head: 'E0A2', stem: false, dots: 1 }),
    noteSvg('a-note', { head: 'E0A3', stem: true })
  )

  const regBranches = Array.from(ftSvg.querySelectorAll('.note > .choice > .reg'))
  assert.ok(regBranches.some(reg => reg.querySelector('.stem')))
  assert.ok(regBranches.some(reg => reg.querySelector('use')?.getAttribute('href') === '#E0A3-suffix'))
  const dots = ftSvg.querySelector('.choice > .orig > .dots')
  assert.equal(calls.find(call => call.element === dots).states.interventions.val, '0')
})

test('regulateRhythm keeps the choice around a note whose pitch changes as well', () => {
  const { ftSvg } = morphNote(noteSvg('o-pitchnote', { head: 'E0A3' }), noteSvg('a-pitchnote', { head: 'E0A4' }), { id: 'o-pitchnote' })

  assert.equal(ftSvg.querySelector('.layer > .choice > .orig > .note').getAttribute('data-id'), 'o-pitchnote')
  assert.equal(ftSvg.querySelectorAll('.choice').length, 1)
  assert.ok(ftSvg.querySelector('.note > g[opacity="0"] use'))
})

test('regulateRhythm marks what arrives as intervention suppl and what leaves as intervention remove', () => {
  const { ftSvg } = morphNote(noteSvg('o-note', { head: 'E0A3', dots: 1 }), noteSvg('a-note', { head: 'E0A4', flag: true }))

  assert.deepEqual(className(ftSvg.querySelector('.choice > .orig > .notehead')).filter(name => name !== 'notehead'), ['intervention', 'remove'])
  assert.ok(className(ftSvg.querySelector('.choice > .orig > .dots')).includes('remove'))
  const filledRegs = Array.from(ftSvg.querySelectorAll('.choice > .reg')).filter(reg => reg.firstElementChild)
  assert.equal(filledRegs.length, 2)
  assert.ok(filledRegs.every(reg => className(reg).includes('suppl') && className(reg).includes('intervention')))
  assert.equal(className(ftSvg.querySelector('.stem')).includes('remove'), false)
})

const chordSvg = (id, noteIds, { heads = ['E0A4', 'E0A4'], flag = false, dots = 0, x = 100, shift = '' } = {}) => `
  <g class="chord" data-class="chord" data-id="${id}">
    ${dots ? `<g class="dots" data-class="dots">${'<ellipse cx="1" cy="2" rx="3" ry="3"/>'.repeat(dots)}</g>` : ''}
    <g class="stem" data-class="stem"><path d="M${x} 100 L${x} 300">${translateTo(shift)}</path>${flag ? `<g class="flag" data-class="flag"><use href="#E241-suffix" transform="translate(${x}, 300)"/></g>` : ''}</g>
    ${noteIds.map((noteId, index) => `<g class="note" data-class="note" data-id="${noteId}"><g class="notehead" data-class="notehead"><use href="#${heads[index]}-suffix" transform="translate(${x - 8}, ${200 + index * 20})"/>${translateTo(shift)}</g></g>`).join('')}
  </g>`

const chordMei = parseMei(`<mei><music>
  <choice><orig><chord xml:id="o-chord" dur="4"><note xml:id="o-n1"/><note xml:id="o-n2"/></chord></orig><reg><chord xml:id="a-chord" dur="8"><note xml:id="a-n1"/><note xml:id="a-n2"/></chord></reg></choice>
</music></mei>`)
const morphChord = (origChord, regChord) => {
  const ftSvg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><g class="layer" data-id="layer-1">${choiceSvg(origChord)}</g></svg>`)
  const atRegSvgDom = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><defs><g id="E241-suffix"><path d="M0 0"/></g></defs>${regChord}</svg>`).ownerDocument
  const ledger = ftSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
  ledger.setAttribute('data-related', '#o-n2')
  ftSvg.appendChild(ledger)
  regulateEvents(ftSvg, chordMei, atRegSvgDom, [])
  return { ftSvg, ledger }
}

test('regulateRhythm breaks a chord down to the flag, dots and noteheads that differ', () => {
  const { ftSvg, ledger } = morphChord(
    chordSvg('o-chord', ['o-n1', 'o-n2'], { heads: ['E0A3', 'E0A4'], dots: 1, shift: '-10 -20' }),
    chordSvg('a-chord', ['a-n1', 'a-n2'], { heads: ['E0A4', 'E0A4'], flag: true, dots: 2 })
  )

  // the chord is plain again, with AT ids for itself and its notes
  const chord = ftSvg.querySelector('.layer > .chord')
  assert.equal(chord.getAttribute('data-id'), 'a-chord')
  assert.deepEqual(Array.from(chord.querySelectorAll('.note')).map(note => note.getAttribute('data-id')), ['a-n1', 'a-n2'])
  assert.equal(ledger.getAttribute('data-related'), '#a-n2')

  // only the first notehead, the dots and the flag are in choices
  const choices = Array.from(chord.querySelectorAll('.choice'))
  assert.equal(choices.length, 3)
  assert.ok(chord.querySelector('.note > .choice > .orig > .notehead'))
  assert.equal(chord.querySelectorAll('.note')[1].querySelector('.choice'), null)
  assert.ok(chord.querySelector(':scope > .choice > .orig > .dots'))
  assert.ok(chord.querySelector('.stem > .choice > .reg .flag'))
  assert.equal(chord.querySelector(':scope > .choice > .reg').getAttribute('transform'), 'translate(0 0)')
  assert.equal(chord.querySelector('.note > .choice > .reg').getAttribute('transform'), 'translate(0 0)')
})

test('regulateRhythm replaces a chord as a whole when its notes cannot be paired', () => {
  const { ftSvg } = morphChord(
    chordSvg('o-chord', ['o-n1', 'o-n2']),
    chordSvg('a-chord', ['a-n1'])
  )

  assert.equal(ftSvg.querySelector('.layer > .choice > .orig > .chord').getAttribute('data-id'), 'o-chord')
  assert.equal(ftSvg.querySelector('.layer > .choice > .reg > .chord').getAttribute('data-id'), 'a-chord')
})

test('regulateRhythm replaces rests as a whole in the reg branch of their choice', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <defs><g id="origGlyph"/></defs>
      <g class="layer" data-id="layer-1">
        ${choiceSvg('<g class="rest" data-class="rest" data-id="o-rest"><use href="#origGlyph" transform="translate(100, 200)"/></g>')}
        ${choiceSvg('<g class="mRest" data-class="mRest" data-id="o-mRest"><use href="#origGlyph"/></g>')}
        <g class="rest" data-class="rest" data-id="plain-rest"><use href="#origGlyph"/></g>
      </g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <defs><g id="regGlyph"><path d="M0 0 L1 1"/></g></defs>
      <g class="layer" data-id="layer-1">
        <g class="rest" data-class="rest" data-id="a-rest"><use href="#regGlyph" transform="translate(70, 190)"/></g>
        <g class="rest" data-class="rest" data-id="a-mRest"><use href="#regGlyph"/></g>
      </g>
    </svg>`).ownerDocument
  const atMeiDom = parseMei(`<mei><music>
    <choice><orig><rest xml:id="o-rest" dur="4"/></orig><reg><rest xml:id="a-rest" dur="8"/></reg></choice>
    <choice><orig><mRest xml:id="o-mRest" dur="1"/></orig><reg><mRest xml:id="a-mRest" dur="2"/></reg></choice>
    <rest xml:id="plain-rest" dur="4"/>
  </music></mei>`)
  const calls = []

  regulateEvents(ftSvg, atMeiDom, atRegSvgDom, calls)

  assert.deepEqual(Array.from(ftSvg.querySelectorAll('.choice > .reg > *')).map(reg => reg.getAttribute('data-id')), ['a-rest', 'a-mRest'])
  assert.equal(ftSvg.querySelectorAll('.choice').length, 2)
  assert.ok(ftSvg.querySelector('defs [id="regGlyph"]'))
  const overlay = ftSvg.querySelector('.choice > .reg > .rest')
  assert.ok(className(overlay).includes('suppl'))
  assert.ok(className(ftSvg.querySelector('.choice > .orig > .rest')).includes('remove'))
  const travel = calls.find(call => call.element === overlay && call.states.interventions.type === 'translate')
  assert.equal(travel.states.supplements.val, '30 10')
})

test('regulateRhythm leaves events without a rhythm edit alone', () => {
  const ftSvg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><g class="layer">${choiceSvg('<g class="note" data-id="o-pitch"><g class="notehead"><use href="#E0A4-x"/></g></g>')}</g></svg>`)
  const atRegSvgDom = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"/>').ownerDocument
  const atMeiDom = parseMei('<mei><music><choice><orig><note xml:id="o-pitch" dur="4" pname="c"/></orig><reg><note xml:id="a-pitch" dur="4" pname="d"/></reg></choice></music></mei>')

  regulateEvents(ftSvg, atMeiDom, atRegSvgDom, [])

  assert.equal(ftSvg.querySelectorAll('.choice').length, 1)
  assert.equal(ftSvg.querySelector('.choice > .orig > .note').getAttribute('data-id'), 'o-pitch')
})
