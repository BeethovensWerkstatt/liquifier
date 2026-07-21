import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyBeams } from '../src/preparation/liquify/beams.js'

const parser = new (new JSDOM().window.DOMParser)()

const polygon = (y) => `<polygon points="0,${y} 10,${y} 10,${y + 2} 0,${y + 2}"/>`

const suppliedPolygonY = (stemDir) => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="beam" data-id="at-beam">
        ${polygon(10)}
        ${polygon(20)}
        ${polygon(30)}
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="beam" data-id="dt-beam">
        ${polygon(100)}
        ${polygon(110)}
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <beam xml:id="at-beam">
        <note xml:id="note-1" stem.dir="${stemDir}"/>
        <note xml:id="note-2" stem.dir="${stemDir}"/>
      </beam>
    </mei>
  `, 'text/xml')
  const animationCalls = []

  liquifyBeams(ftSvg, dtSvg, atMeiDom, {
    getNewPos: point => point,
    correspMappings: new Map([['at-beam', ['dt-beam']]]),
    setAnimation: descriptor => animationCalls.push(descriptor),
    logger: { debug () {}, info () {}, warn () {}, error () {} }
  })

  const supplied = animationCalls.find(call => call.states.finding === null)
  assert.ok(supplied)
  return averageY(supplied.element.getAttribute('points'))
}

const averageY = (points) => {
  const values = points.trim().split(/\s+/).map(point => Number(point.split(',')[1]))
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

test('liquifyBeams selects unmatched AT beam polygons from the innermost direction', () => {
  assert.equal(suppliedPolygonY('up'), 31)
  assert.equal(suppliedPolygonY('down'), 11)
})
