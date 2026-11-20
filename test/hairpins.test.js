import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyHairpins } from '../src/preparation/liquify/hairpins.js'
import { isRegulationHandled } from '../src/utils/ft/regulation.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyHairpins uses regulation leg geometry at interventions', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="hairpin" data-id="at-hairpin"><polyline points="0,0 10,5 0,10"/></g></svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g data-id="dt-hairpin"><polyline points="1,0 11,5 1,10"/></g></svg>
  `, 'image/svg+xml').documentElement
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="hairpin" data-id="reg-hairpin"><polyline points="20,0 30,5 20,10"/></g></svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString(`
    <mei><choice><orig><hairpin xml:id="at-hairpin"/></orig><reg><hairpin xml:id="reg-hairpin"/></reg></choice></mei>
  `, 'text/xml')
  const calls = []
  const logger = { debug () {}, info () {}, warn () {}, error () {} }

  const tools = {
    atRegSvgDom,
    correspMappings: new Map([['at-hairpin', ['dt-hairpin']]]),
    getNewPos: (atPoint, dtPoint) => dtPoint,
    setAnimation: descriptor => calls.push(descriptor),
    applyUnmatchedClass () {},
    logger
  }

  liquifyHairpins(ftSvg, dtSvg, atMeiDom, tools)

  assert.equal(calls[0].states.interventions.val, '20,0 30,5')
  assert.equal(calls[1].states.interventions.val, '20,10 30,5')
  assert.equal(isRegulationHandled(tools, ftSvg.querySelector('g.hairpin')), true)
})
