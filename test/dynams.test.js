import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyDynams } from '../src/preparation/liquify/dynams.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyDynams animates text-to-text dynamics with Thulemeier markup', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="dynam" data-id="at-dynam"><text x="100" y="50"><tspan data-class="text"><g class="bounding-box"><rect width="90"/></g><tspan font-size="405px">sempre piano</tspan></tspan></text></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="dynam" data-id="dt-dynam"><text x="10" y="20" textLength="40px"><tspan>piano</tspan></text></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const animationCalls = []

  liquifyDynams(ftSvg, dtSvg, parser.parseFromString('<mei/>', 'text/xml'), {
    getNewPos: (atPoint, dtPoint) => ({ x: dtPoint.x * 2, y: dtPoint.y * 2 }),
    correspMappings: new Map([['at-dynam', ['dt-dynam']]]),
    setAnimation: descriptor => animationCalls.push(descriptor),
    logger: { debug () {}, info () {}, warn () {}, error () {} }
  })

  const diplomaticRun = ftSvg.querySelector('text[data-text-role="diplomatic"]')
  const annotatedRun = ftSvg.querySelector('text[data-text-role="annotated"]')
  assert.equal(diplomaticRun.textContent, 'piano')
  assert.equal(annotatedRun.textContent, 'sempre piano')
  assert.equal(diplomaticRun.getAttribute('textLength'), '80px')
  assert.equal(annotatedRun.getAttribute('textLength'), '80px')

  const widthAnimation = animationCalls.find(call => call.element === diplomaticRun && call.states.finding?.type === 'textLength')
  assert.ok(widthAnimation)
  assert.equal(widthAnimation.states.finding.val, '80px')
  assert.equal(widthAnimation.states.supplements.val, '90px')

  const diplomaticOpacity = animationCalls.find(call => call.element === diplomaticRun && call.states.finding?.type === 'opacity')
  const annotatedOpacity = animationCalls.find(call => call.element === annotatedRun && call.states.finding?.type === 'opacity')
  assert.equal(diplomaticOpacity.states.supplements.val, '0')
  assert.equal(annotatedOpacity.states.supplements.val, '1')
})
