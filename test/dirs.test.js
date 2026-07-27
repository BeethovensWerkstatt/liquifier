import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyDirs } from '../src/preparation/liquify/dirs.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyDirs replaces source text and animates one-line direction width with Thulemeier markup', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-id="at-dir" data-class="dir"><text x="100" y="50"><tspan data-class="text"><g class="bounding-box"><rect width="90"/></g><tspan font-size="405px">quartett</tspan></tspan></text></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g data-id="dt-dir" data-class="dir"><text x="10" y="20" textLength="40px"><tspan>quartett</tspan></text></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString('<mei><dir xml:id="at-dir"/></mei>', 'text/xml')
  const animationCalls = []

  liquifyDirs(ftSvg, dtSvg, atMeiDom, {
    getNewPos: (atPoint, dtPoint) => ({ x: dtPoint.x * 2, y: dtPoint.y * 2 }),
    correspMappings: new Map([['at-dir', ['dt-dir']]]),
    applyUnmatchedClass () {},
    setAnimation: descriptor => animationCalls.push(descriptor),
    logger: { debug () {}, info () {}, warn () {}, error () {} }
  })

  const textRuns = ftSvg.querySelectorAll('g[data-id="at-dir"] text')
  const continuousRun = ftSvg.querySelector('text[data-text-role="continuous"]')
  assert.equal(textRuns.length, 1)
  assert.equal(continuousRun.textContent, 'quartett')
  assert.equal(continuousRun.getAttribute('textLength'), '80px')

  const widthAnimation = animationCalls.find(call => call.element === continuousRun && call.states.finding?.type === 'textLength')
  assert.ok(widthAnimation)
  assert.equal(widthAnimation.states.finding.val, '80px')
  assert.equal(widthAnimation.states.supplements.val, '90px')
})
