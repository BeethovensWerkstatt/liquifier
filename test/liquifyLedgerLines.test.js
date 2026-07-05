import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyLedgerLines } from '../src/preparation/liquify/liquifyLedgerLines.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyLedgerLines copies note animation onto related ledger lines', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure">
        <g class="ledgerLines above">
          <g class="lineDash" data-related="#note-1"><path d="M10 10 L20 10"/></g>
          <g class="lineDash" data-related="#note-1"><path d="M10 20 L20 20"/></g>
        </g>
        <g class="note" data-id="note-1">
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
            <g class="notehead">
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
})
