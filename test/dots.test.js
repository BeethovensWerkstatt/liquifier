import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyDots } from '../src/preparation/liquify/dots.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyDots animates written repeat dots by staff and supplies the remaining Verovio dots', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" data-id="measure-1">
        <g class="staff" data-n="1"><path d="M0 0 L200 0"/><path d="M0 20 L200 20"/></g>
        <g class="staff" data-n="2"><path d="M0 100 L200 100"/><path d="M0 120 L200 120"/></g>
        <g class="barLine">
          <path d="M10 0 L10 120"/>
          <use transform="translate(15, 4) scale(0.72, 0.72)"/>
          <use transform="translate(15, 16) scale(0.72, 0.72)"/>
          <use transform="translate(15, 104) scale(0.72, 0.72)"/>
          <use transform="translate(15, 116) scale(0.72, 0.72)"/>
        </g>
        <g class="barLine">
          <path d="M190 0 L190 120"/>
          <use transform="translate(185, 4) scale(0.72, 0.72)"/>
          <use transform="translate(185, 16) scale(0.72, 0.72)"/>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="staff" data-n="1">
        <g class="dot repeat" data-id="dt-top"><ellipse cx="18" cy="5"/></g>
        <g class="dot repeat" data-id="dt-bottom"><ellipse cx="18" cy="15"/></g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const animationCalls = []

  liquifyDots(ftSvg, dtSvg, null, {
    getNewPos: (atPos, dtPos) => dtPos,
    correspMappings: new Map([['measure-1', ['dt-top', 'dt-bottom']]]),
    setAnimation: descriptor => animationCalls.push(descriptor)
  })

  assert.equal(animationCalls.length, 6)
  const callsByY = new Map(animationCalls.map(call => [call.element.querySelector('use').getAttribute('transform'), call]))
  assert.equal(callsByY.get('translate(15, 4) scale(0.72, 0.72)').states.finding.val, '3 1')
  assert.equal(callsByY.get('translate(15, 16) scale(0.72, 0.72)').states.finding.val, '3 -1')
  assert.equal(callsByY.get('translate(15, 104) scale(0.72, 0.72)').states.finding, null)
  assert.equal(callsByY.get('translate(185, 4) scale(0.72, 0.72)').states.finding, null)
})
