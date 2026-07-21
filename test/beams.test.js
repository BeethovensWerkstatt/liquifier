import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyBeams } from '../src/preparation/liquify/beams.js'

const parser = new (new JSDOM().window.DOMParser)()

const polygon = (y) => `<polygon points="0,${y + 2} 10,${y + 2} 10,${y} 0,${y}"/>`

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

const normalizedBeamGeometry = (stemDir, beamPolygons, dtPolygons) => {
  const sourcePolygons = beamPolygons || (stemDir === 'down'
    ? [polygon(10), polygon(0)]
    : [polygon(10), polygon(20)])
  const diplomaticPolygons = dtPolygons || sourcePolygons
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="note" data-id="note-1">
        <g class="stem"><path d="M0 ${stemDir === 'up' ? '100' : '0'} L0 ${stemDir === 'up' ? '0' : '100'}"/></g>
      </g>
      <g class="note" data-id="note-2">
        <g class="stem"><path d="M100 ${stemDir === 'up' ? '100' : '0'} L100 ${stemDir === 'up' ? '0' : '100'}"/></g>
      </g>
      <g class="beam" data-id="at-beam">
        ${sourcePolygons.join('\n')}
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="beam" data-id="dt-beam">
        ${diplomaticPolygons.join('\n')}
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

  return animationCalls.map(call => ({
    finding: parsePoints(call.states.finding.val),
    normalization: parsePoints(call.states.normalization.val),
    regulation: parsePoints(call.states.regulation.val)
  }))
}

const parsePoints = (points) => points.trim().split(/\s+/).map(point => {
  const [x, y] = point.split(',').map(Number)
  return { x, y }
})

const winding = (points) => points.reduce((area, point, index) => {
  const next = points[(index + 1) % points.length]
  return area + point.x * next.y - next.x * point.y
}, 0)

test('liquifyBeams keeps normalized beam stacks inside stem endpoints without reversing winding', () => {
  const up = normalizedBeamGeometry('up')
  assert.deepEqual(up.map(state => state.normalization), [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 2 }, { x: 0, y: 2 }],
    [{ x: 0, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 12 }, { x: 0, y: 12 }]
  ])
  const down = normalizedBeamGeometry('down')
  assert.deepEqual(down.map(state => state.normalization), [
    [{ x: 0, y: 98 }, { x: 100, y: 98 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    [{ x: 0, y: 88 }, { x: 100, y: 88 }, { x: 100, y: 90 }, { x: 0, y: 90 }]
  ])

  const allStates = [...up, ...down]
  allStates.forEach(state => {
    assert.equal(Math.sign(winding(state.normalization)), Math.sign(winding(state.regulation)))
  })
})

test('liquifyBeams preserves short-beam widths and unequal Phase 8 spacing', () => {
  const shortBeamStack = [
    '<polygon points="0,12 100,12 100,10 0,10"/>',
    '<polygon points="80,22 100,22 100,20 80,20"/>',
    '<polygon points="80,27 100,27 100,25 80,25"/>'
  ]
  const up = normalizedBeamGeometry('up', shortBeamStack)

  assert.deepEqual(up.map(state => state.normalization), [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 2 }, { x: 0, y: 2 }],
    [{ x: 80, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 12 }, { x: 80, y: 12 }],
    [{ x: 80, y: 15 }, { x: 100, y: 15 }, { x: 100, y: 17 }, { x: 80, y: 17 }]
  ])
})

test('liquifyBeams aligns opposite-wound DT polygons before the up-stem finding transition', () => {
  const up = normalizedBeamGeometry('up', undefined, [
    '<polygon points="0,10 100,10 100,12 0,12"/>',
    '<polygon points="0,20 100,20 100,22 0,22"/>'
  ])

  up.forEach(state => {
    assert.equal(Math.sign(winding(state.finding)), Math.sign(winding(state.normalization)))
  })
})
