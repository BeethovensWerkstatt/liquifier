import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyBarlines } from '../src/preparation/liquify/barlines.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyBarlines pairs repeated AT barlines with DT barlines by horizontal position', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" data-id="measure-1">
        <g class="barLine">
          <path d="M10 0 L10 20" stroke-width="90"/>
          <path d="M20 0 L20 20" stroke-width="27"/>
        </g>
        <g class="barLine"><path d="M100 0 L100 20" stroke-width="27"/></g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="barLine" data-id="dt-right"><path d="M150 0 L150 20"/></g>
      <g class="barLine" data-id="dt-left"><path d="M50 0 L50 20"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const animationCalls = []

  liquifyBarlines(ftSvg, dtSvg, null, {
    getNewPos: (atPos, dtPos) => dtPos,
    correspMappings: new Map([['measure-1', ['dt-right', 'dt-left']]]),
    setAnimation: descriptor => animationCalls.push(descriptor)
  })

  const callsByStrokeWidth = new Map(animationCalls.map(call => [call.element.getAttribute('stroke-width'), call]))
  assert.equal(callsByStrokeWidth.get('90').states.finding, null)
  assert.equal(callsByStrokeWidth.get('90').states.supplements.val, 'M10 0 L10 20')
  assert.equal(callsByStrokeWidth.get('27').states.finding.val, 'M150 0 L150 20')

  const thinLeft = animationCalls.find(call => call.element.getAttribute('d') === 'M20 0 L20 20')
  assert.equal(thinLeft.states.finding.val, 'M50 0 L50 20')
})

test('liquifyBarlines expands a single AT line for horizontally ordered double DT lines', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" data-id="measure-1">
        <g class="barLine"><path d="M10 0 L10 20" stroke-width="27"/></g>
        <g class="barLine"><path d="M100 0 L100 20" stroke-width="27"/></g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="barLine" data-id="dt-right"><path d="M150 0 L150 20"/></g>
      <g class="barLine" data-id="dt-left-inner"><path d="M55 0 L55 20"/></g>
      <g class="barLine" data-id="dt-left-outer"><path d="M45 0 L45 20"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const animationCalls = []

  liquifyBarlines(ftSvg, dtSvg, null, {
    getNewPos: (atPos, dtPos) => dtPos,
    correspMappings: new Map([['measure-1', ['dt-right', 'dt-left-inner', 'dt-left-outer']]]),
    setAnimation: descriptor => animationCalls.push(descriptor)
  })

  assert.equal(animationCalls.length, 3)
  assert.deepEqual(
    new Set(animationCalls.map(call => call.states.finding.val)),
    new Set(['M45 0 L45 20', 'M55 0 L55 20', 'M150 0 L150 20'])
  )
  const rightBarline = animationCalls.find(call => call.element.getAttribute('d') === 'M100 0 L100 20')
  assert.equal(rightBarline.states.finding.val, 'M150 0 L150 20')
})
