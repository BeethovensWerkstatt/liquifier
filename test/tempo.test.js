import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyTempo } from '../src/preparation/liquify/tempo.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyTempo reveals inserted text at supplements and animates the DT text width', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="tempo" data-id="at-tempo">
        <text x="100" y="50"><tspan data-class="text"><g class="bounding-box"><rect width="70"/></g><tspan font-size="405px">allegro</tspan></tspan></text>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="tempo" data-id="dt-tempo"><text x="10" y="20" textLength="40px"><tspan>allo</tspan></text></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const animationCalls = []

  liquifyTempo(ftSvg, dtSvg, parser.parseFromString('<mei/>', 'text/xml'), {
    getNewPos: (atPoint, dtPoint) => ({ x: dtPoint.x * 2, y: dtPoint.y * 2 }),
    correspMappings: new Map([['at-tempo', ['dt-tempo']]]),
    setAnimation: descriptor => animationCalls.push(descriptor),
    logger: { debug () {}, info () {}, warn () {}, error () {} }
  })

  assert.equal(ftSvg.querySelector('text').getAttribute('lengthAdjust'), null)
  const diplomaticRun = ftSvg.querySelector('text[data-text-role="diplomatic"]')
  const annotatedRun = ftSvg.querySelector('text[data-text-role="annotated"]')
  assert.equal(diplomaticRun.textContent, 'allo')
  assert.equal(annotatedRun.textContent, 'allegro')
  assert.equal(diplomaticRun.getAttribute('textLength'), '80px')
  assert.equal(annotatedRun.getAttribute('textLength'), '70px')
  const diplomaticWidth = animationCalls.find(call => call.element === diplomaticRun && call.states.finding?.type === 'textLength')
  const annotatedWidth = animationCalls.find(call => call.element === annotatedRun && call.states.finding?.type === 'textLength')
  assert.equal(diplomaticWidth.states.supplements.val, '80px')
  assert.equal(annotatedWidth.states.finding.val, '70px')

  const diplomaticOpacity = animationCalls.find(call => call.element === diplomaticRun && call.states.finding?.type === 'opacity')
  const annotatedOpacity = animationCalls.find(call => call.element === annotatedRun && call.states.finding?.type === 'opacity')
  assert.equal(diplomaticOpacity.states.regulation.val, '1')
  assert.equal(diplomaticOpacity.states.supplements.val, '0')
  assert.equal(annotatedOpacity.states.regulation.val, '0')
  assert.equal(annotatedOpacity.states.supplements.val, '1')
})
