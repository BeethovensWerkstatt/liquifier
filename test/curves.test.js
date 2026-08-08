import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyCurves } from '../src/preparation/liquify/curves.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyCurves uses regulation path geometry at interventions', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="slur" data-id="at-slur"><path d="M0 0 C10 0 20 0 30 0"/></g></svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="curve" data-id="dt-slur"><path d="M1 1 C11 1 21 1 31 1"/></g></svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString('<mei><slur xml:id="at-slur"/></mei>', 'text/xml')
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="slur" data-id="at-slur"><path d="M10 10 C20 5 30 5 40 10"/></g></svg>
  `, 'image/svg+xml').documentElement
  const calls = []

  liquifyCurves(ftSvg, dtSvg, atMeiDom, {
    atRegSvgDom,
    convertD: (atPath, dtPath) => dtPath,
    correspMappings: new Map([['at-slur', ['dt-slur']]]),
    setAnimation: descriptor => calls.push(descriptor)
  })

  assert.equal(calls[0].states.interventions.val, 'M10 10 C20 5 30 5 40 10')
  assert.equal(ftSvg.querySelector('g.slur').getAttribute('data-bw-regulation-layout'), 'true')
})
