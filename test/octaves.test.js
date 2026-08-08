import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyOctaves } from '../src/preparation/liquify/octaves.js'

const parser = new (new JSDOM().window.DOMParser)()
const logger = { debug () {}, info () {}, warn () {}, error () {} }

test('liquifyOctaves translates the complete Verovio octave group to its Thulemeier anchor', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="octave" data-id="at-octave">
        <use transform="translate(100, 200) scale(0.72, 0.72)"/>
        <path d="M110 0 L200 0"/>
        <polyline points="200,180 200,0 110,0"/>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="octave" data-id="dt-octave">
        <use x="40px" y="80px"/>
        <path d="M50 30 L90 30"/>
        <polyline points="90,150 90,30 50,30"/>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const calls = []

  liquifyOctaves(ftSvg, dtSvg, null, {
    getNewPos: (atAnchor, dtAnchor) => ({ x: dtAnchor.x * 2, y: dtAnchor.y * 2 }),
    correspMappings: new Map([['at-octave', ['dt-octave']]]),
    setAnimation: descriptor => calls.push(descriptor),
    applyUnmatchedClass () {},
    logger
  })

  assert.equal(calls.length, 3)
  assert.equal(calls[0].referenceId, 'dt-octave')
  assert.equal(calls[0].states.finding.val, '-20 -40')
  assert.equal(calls[0].states.normalization.val, '-20 -40')
  assert.equal(calls[0].states.regulation.val, '0 0')
  assert.equal(calls[1].states.finding.val, 'M120 100 L200 100')
  assert.equal(calls[1].states.regulation.val, 'M110 0 L200 0')
  assert.equal(calls[2].states.finding.val, '200,340 200,100 120,100')
  assert.equal(calls[2].states.regulation.val, '200,180 200,0 110,0')
})

test('liquifyOctaves uses regulation anchor and extender geometry at interventions', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="octave" data-id="at-octave"><use transform="translate(100, 200)"/><path d="M110 0 L200 0"/><polyline points="200,180 200,0 110,0"/></g></svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="octave" data-id="dt-octave"><use x="100" y="200"/><path d="M110 0 L200 0"/><polyline points="200,180 200,0 110,0"/></g></svg>
  `, 'image/svg+xml').documentElement
  const atRegSvgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="octave" data-id="at-octave"><use transform="translate(200, 300)"/><path d="M210 100 L350 100"/><polyline points="350,280 350,100 210,100"/></g></svg>
  `, 'image/svg+xml').documentElement
  const calls = []

  liquifyOctaves(ftSvg, dtSvg, null, {
    atRegSvgDom,
    getNewPos: (atPoint, dtPoint) => dtPoint,
    correspMappings: new Map([['at-octave', ['dt-octave']]]),
    setAnimation: descriptor => calls.push(descriptor),
    applyUnmatchedClass () {},
    logger
  })

  assert.equal(calls[0].states.interventions.val, '100 100')
  assert.equal(calls[1].states.interventions.val, 'M110 0 L250 0')
  assert.equal(calls[2].states.interventions.val, '250,180 250,0 110,0')
  assert.equal(ftSvg.querySelector('g.octave').getAttribute('data-bw-regulation-layout'), 'true')
})

test('liquifyOctaves supports number-only octave markings', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="octave" data-id="at-octave"><use x="100" y="200"/></g></svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="octave" data-id="dt-octave"><use x="40" y="80"/></g></svg>
  `, 'image/svg+xml').documentElement
  const calls = []

  liquifyOctaves(ftSvg, dtSvg, null, {
    getNewPos: (atAnchor, dtAnchor) => dtAnchor,
    correspMappings: new Map([['at-octave', ['dt-octave']]]),
    setAnimation: descriptor => calls.push(descriptor),
    applyUnmatchedClass () {},
    logger
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].states.finding.val, '-60 -120')
})

test('liquifyOctaves hides octave markings without a current-page correspondence', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="octave" data-id="at-octave"><use x="100" y="200"/></g></svg>
  `, 'image/svg+xml').documentElement
  const calls = []
  let classified = false

  liquifyOctaves(ftSvg, ftSvg, null, {
    getNewPos: point => point,
    correspMappings: new Map(),
    setAnimation: descriptor => calls.push(descriptor),
    applyUnmatchedClass () { classified = true },
    logger
  })

  assert.equal(classified, true)
  assert.equal(calls[0].states.finding, null)
  assert.equal(calls[0].states.regulation.val, '0 0')
})
