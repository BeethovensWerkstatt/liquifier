import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyLedgerLines } from '../src/preparation/liquify/ledgerLines.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyLedgerLines copies note animation onto related ledger lines', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure">
        <g class="ledgerLines above">
          <g class="lineDash" data-related="#note-1"><path d="M10 10 L20 10"/></g>
          <g class="lineDash" data-related="#note-1"><path d="M10 20 L20 20"/></g>
        </g>
        <g class="note" data-id="note-1" data-ref-id="dt-note-1">
          <g class="notehead"><use href="#sym"/></g>
          <animate attributeName="opacity" values="0;0;1;1;1;1;1;1" repeatCount="indefinite" dur="5s"/>
          <animateTransform attributeName="transform" attributeType="XML" type="translate" values="30 40;30 40;30 40;30 40;30 40;0 0;0 0;0 0" repeatCount="indefinite" dur="5s"/>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement

  liquifyLedgerLines(ftSvg, null, null, {})

  const ledgerLines = ftSvg.querySelectorAll('.lineDash')
  assert.equal(ledgerLines.length, 2)

  ledgerLines.forEach(ledgerLine => {
    const opacityAnimation = ledgerLine.querySelector('animate[attributeName="opacity"]')
    const transformAnimation = ledgerLine.querySelector('animateTransform[attributeName="transform"]')

    assert.ok(opacityAnimation)
    assert.ok(transformAnimation)
    assert.equal(opacityAnimation.getAttribute('values'), '0;0;1;1;1;1;1;1')
    assert.equal(transformAnimation.getAttribute('values'), '30 40;30 40;30 40;30 40;30 40;0 0;0 0;0 0')
    assert.equal(ledgerLine.getAttribute('data-ref-id'), 'dt-note-1')
  })
})

test('liquifyLedgerLines falls back to animated notehead for chord-contained notes', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure">
        <g class="ledgerLines below">
          <g class="lineDash" data-related="#note-in-chord"><path d="M10 10 L20 10"/></g>
        </g>
        <g class="chord" data-id="chord-1">
          <g class="note" data-id="note-in-chord">
            <g class="notehead" data-ref-id="dt-chord-note">
              <use href="#sym"/>
              <animateTransform attributeName="transform" attributeType="XML" type="translate" values="12 18;12 18;12 18;12 18;12 18;0 0;0 0;0 0" repeatCount="indefinite" dur="5s"/>
            </g>
            <animate attributeName="opacity" values="0;0;1;1;1;1;1;1" repeatCount="indefinite" dur="5s"/>
          </g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement

  liquifyLedgerLines(ftSvg, null, null, {})

  const ledgerLine = ftSvg.querySelector('.lineDash')
  const opacityAnimation = ledgerLine.querySelector('animate[attributeName="opacity"]')
  const transformAnimation = ledgerLine.querySelector('animateTransform[attributeName="transform"]')

  assert.ok(opacityAnimation)
  assert.ok(transformAnimation)
  assert.equal(transformAnimation.getAttribute('values'), '12 18;12 18;12 18;12 18;12 18;0 0;0 0;0 0')
  assert.equal(ledgerLine.getAttribute('data-ref-id'), 'dt-chord-note')
})

test('liquifyLedgerLines reconciles orig-only and reg-only ledger lines at interventions', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="ledgerLines above"><g class="lineDash" data-related="#orig-note"><path d="M10 10 L20 10"/></g><g class="lineDash" data-related="#orig-note"><path d="M10 20 L20 20"/></g><g class="lineDash" data-related="#orig-removed"><path d="M10 30 L20 30"/></g></g>
      <g class="note" data-id="orig-note"><animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 0;0 0;0 0;0 0;0 0;0 0"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString(`
    <mei><choice><orig><note xml:id="orig-note"/></orig><reg><note xml:id="reg-note"/></reg></choice><note xml:id="orig-removed"/></mei>
  `, 'text/xml')
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="ledgerLines above"><g class="lineDash" data-related="#reg-note"><path d="M30 30 L40 30"/></g><g class="lineDash" data-related="#reg-note"><path d="M30 40 L40 40"/></g><g class="lineDash" data-related="#reg-note"><path d="M30 50 L40 50"/></g></g>
    </svg>
  `, 'image/svg+xml').documentElement.ownerDocument
  const calls = []

  const originalLines = Array.from(ftSvg.querySelectorAll('.lineDash'))

  liquifyLedgerLines(ftSvg, null, atMeiDom, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  // the first two orig lines move to their reg lines, the third reg line is new, and the unmatched orig line fades
  const regulationLines = Array.from(ftSvg.querySelectorAll('.lineDash')).filter(line => !originalLines.includes(line))
  assert.deepEqual(regulationLines.map(line => line.querySelector('path')?.getAttribute('d')), ['M30 50 L40 50'])
  const moves = calls.filter(call => call.states.interventions.type === 'd')
  assert.deepEqual(moves.map(call => call.states.interventions.val), ['M30 30 L40 30', 'M30 40 L40 40'])
  assert.deepEqual(moves.map(call => call.states.supplements.val), ['M10 10 L20 10', 'M10 20 L20 20'])
  assert.ok(calls.filter(call => regulationLines.includes(call.element)).every(call => call.states.interventions.val === '1'))
  const fades = calls.filter(call => call.states.interventions.type === 'opacity' && !regulationLines.includes(call.element))
  assert.deepEqual(fades.map(call => call.element.getAttribute('data-related')), ['#orig-removed'])
  assert.equal(fades[0].states.interventions.val, '0')
})

test('liquifyLedgerLines lets paired lines follow the note and only animates the remaining difference', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="ledgerLines below">
        <g class="lineDash" data-related="#orig-note"><path d="M100 200 L300 200"/></g>
        <g class="lineDash" data-related="#orig-other"><path d="M500 200 L700 200"/></g>
      </g>
      <g class="note" data-id="orig-note"><animateTransform attributeName="transform" type="translate" values="9 9;9 9;9 9;9 9;9 9;0 0;0 0;-40 -10"/></g>
      <g class="note" data-id="orig-other"><animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 0;0 0;0 0;0 0;0 0;-40 -10"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString(`
    <mei>
      <choice><orig><note xml:id="orig-note"/></orig><reg><note xml:id="reg-note"/></reg></choice>
      <choice><orig><note xml:id="orig-other"/></orig><reg><note xml:id="reg-other"/></reg></choice>
    </mei>
  `, 'text/xml')
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="ledgerLines below">
        <g class="lineDash" data-related="#reg-note"><path d="M60 190 L260 190"/></g>
        <g class="lineDash" data-related="#reg-other"><path d="M460 190 L640 195"/></g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement.ownerDocument
  const calls = []

  const lineCount = ftSvg.querySelectorAll('.lineDash').length

  liquifyLedgerLines(ftSvg, null, atMeiDom, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  // the first line already ends at the reg line through the note animation; the second needs a corrected end
  assert.equal(ftSvg.querySelectorAll('.lineDash').length, lineCount)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].element.parentNode.getAttribute('data-related'), '#orig-other')
  assert.equal(calls[0].states.interventions.val, 'M500 200 L680 205')
})

test('liquifyLedgerLines finds a regulation note through nested orig markup', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="ledgerLines above"><g class="lineDash" data-related="#orig-note"><path d="M10 10 L20 10"/></g></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString(`
    <mei><choice><orig><supplied><note xml:id="orig-note"/></supplied></orig><reg><supplied><note xml:id="reg-note"/></supplied></reg></choice></mei>
  `, 'text/xml')
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="ledgerLines above"/></svg>
  `, 'image/svg+xml').documentElement.ownerDocument
  const calls = []

  liquifyLedgerLines(ftSvg, null, atMeiDom, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].element.getAttribute('data-related'), '#orig-note')
  assert.equal(calls[0].states.interventions.val, '0')
})

test('liquifyLedgerLines does not retain an old line from another measure with the same regulation note ID', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" data-id="measure-1"><g class="staff" data-id="staff-1"><g class="ledgerLines above"><g class="lineDash" data-related="#orig-note"><path d="M10 10 L20 10"/></g></g></g></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString(`
    <mei><choice><orig><note xml:id="orig-note"/></orig><reg><note xml:id="reg-note"/></reg></choice></mei>
  `, 'text/xml')
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" data-id="measure-2"><g class="staff" data-id="staff-1"><g class="ledgerLines above"><g class="lineDash" data-related="#reg-note"><path d="M10 10 L20 10"/></g></g></g></g>
    </svg>
  `, 'image/svg+xml').documentElement.ownerDocument
  const calls = []

  liquifyLedgerLines(ftSvg, null, atMeiDom, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].states.interventions.val, '0')
})

test('liquifyLedgerLines copies animations in XML DOMs that do not support attribute selectors', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="ledgerLines above"><g class="lineDash" data-related="#note-1"><path d="M10 10 L20 10"/></g></g>
      <g class="note" data-id="note-1"><animateTransform attributeName="transform" type="translate" values="1 2;3 4"/></g>
    </svg>
  `, 'image/svg+xml').documentElement

  liquifyLedgerLines(ftSvg, null, null, {})

  assert.equal(ftSvg.querySelector('.lineDash animateTransform')?.getAttribute('values'), '1 2;3 4')
})
