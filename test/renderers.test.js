import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { applyFluidSystemsOutputMetadata, FLUID_SYSTEMS_STATE_SEQUENCE } from '../src/rendering/renderers.js'

const parser = new (new JSDOM().window.DOMParser)()

test('applyFluidSystemsOutputMetadata adds state markers and overlay metadata JSON', () => {
  const svgDom = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400"></svg>', 'image/svg+xml')
  const svg = svgDom.documentElement

  const atDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1" corresp="../diplomaticTranscripts/src_dt.xml#d1"/>
                <sb xml:id="sb2"/>
                <measure xml:id="m2" corresp="../diplomaticTranscripts/src_dt.xml#d2"/>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const dtSvgDom = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/svg+xml')
  const dtMeasureLayer = dtSvgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const d1 = dtSvgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const d2 = dtSvgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const d1Rect = dtSvgDom.createElementNS('http://www.w3.org/2000/svg', 'rect')
  const d2Rect = dtSvgDom.createElementNS('http://www.w3.org/2000/svg', 'rect')
  d1.setAttribute('class', 'measure')
  d2.setAttribute('class', 'measure')
  d1.setAttribute('data-id', 'd1')
  d2.setAttribute('data-id', 'd2')
  d1Rect.setAttribute('x', '0')
  d1Rect.setAttribute('width', '100')
  d2Rect.setAttribute('x', '300')
  d2Rect.setAttribute('width', '200')
  d1.appendChild(d1Rect)
  d2.appendChild(d2Rect)
  dtMeasureLayer.appendChild(d1)
  dtMeasureLayer.appendChild(d2)
  dtSvgDom.documentElement.appendChild(dtMeasureLayer)

  const measureLayer = svgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const m1 = svgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const m2 = svgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const m1Rect = svgDom.createElementNS('http://www.w3.org/2000/svg', 'rect')
  const m2Rect = svgDom.createElementNS('http://www.w3.org/2000/svg', 'rect')
  m1.setAttribute('class', 'measure')
  m2.setAttribute('class', 'measure')
  m1.setAttribute('data-id', 'm1')
  m2.setAttribute('data-id', 'm2')
  m1Rect.setAttribute('x', '0')
  m1Rect.setAttribute('width', '100')
  m2Rect.setAttribute('x', '220')
  m2Rect.setAttribute('width', '100')
  m1.appendChild(m1Rect)
  m2.appendChild(m2Rect)
  measureLayer.appendChild(m1)
  measureLayer.appendChild(m2)
  svg.appendChild(measureLayer)

  applyFluidSystemsOutputMetadata(svg, {
    triple: { page: 'p005' },
    systemId: 's123',
    atDom,
    dtSvgElement: dtSvgDom.documentElement
  })

  const classes = (svg.getAttribute('class') || '').split(/\s+/)
  FLUID_SYSTEMS_STATE_SEQUENCE.forEach(state => {
    assert.ok(classes.includes(`bw-fs-state-${state}`))
  })

  assert.equal(svg.getAttribute('data-bw-fs-states'), FLUID_SYSTEMS_STATE_SEQUENCE.join(','))

  const desc = svg.querySelector('desc#bw-fs-overlay-metadata')
  assert.ok(desc)

  const payload = JSON.parse(desc.textContent)
  assert.equal(payload.currentPageId, 'p005')
  assert.equal(payload.overlayOffsetX, 0)
  assert.equal(payload.overlayOffsetY, 0)
  assert.equal(payload.overlayWidth, 1200)
  assert.equal(payload.overlayHeight, 400)
  assert.equal(payload.svgUnits, 'viewBox')
  assert.deepEqual(payload.dtSystemsUsed, ['s123'])
  assert.equal(payload.readingOrderAdjustedCount, 2)
  assert.deepEqual(payload.readingOrderAdjustedMeasures.sort(), ['m1', 'm2'])
  assert.equal(payload.readingOrderGeometrySource, 'dt')

  const m1Anim = m1.querySelector('animateTransform')
  const m2Anim = m2.querySelector('animateTransform')
  assert.ok(m1Anim)
  assert.ok(m2Anim)
  assert.equal(m1Anim.getAttribute('values'), '0 0;0 0;60 0;0 0;0 0;0 0')
  assert.equal(m2Anim.getAttribute('values'), '0 0;0 0;-60 0;0 0;0 0;0 0')
  assert.equal(m1.getAttribute('data-bw-reading-order-offset-x'), '60')
  assert.equal(m2.getAttribute('data-bw-reading-order-offset-x'), '-60')
})

test('applyFluidSystemsOutputMetadata updates existing metadata desc', () => {
  const svgDom = parser.parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg" class="existing" width="900" height="300"><desc id="bw-fs-overlay-metadata">{"old":true}</desc></svg>',
    'image/svg+xml'
  )
  const svg = svgDom.documentElement

  applyFluidSystemsOutputMetadata(svg, {
    triple: { page: 'p010' },
    systemId: null
  })

  const descNodes = svg.querySelectorAll('desc#bw-fs-overlay-metadata')
  assert.equal(descNodes.length, 1)

  const payload = JSON.parse(descNodes[0].textContent)
  assert.equal(payload.currentPageId, 'p010')
  assert.equal(payload.overlayWidth, 900)
  assert.equal(payload.overlayHeight, 300)
  assert.deepEqual(payload.dtSystemsUsed, [])
  assert.equal(payload.readingOrderAdjustedCount, 0)
  assert.deepEqual(payload.readingOrderAdjustedMeasures, [])
  assert.equal(payload.readingOrderGeometrySource, 'none')

  const classes = (svg.getAttribute('class') || '').split(/\s+/)
  assert.ok(classes.includes('existing'))
})

test('applyFluidSystemsOutputMetadata uses FT geometry fallback when DT mapping is unavailable', () => {
  const svgDom = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/svg+xml')
  const svg = svgDom.documentElement

  const atDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1"/>
                <sb xml:id="sb2"/>
                <measure xml:id="m2"/>
                <sb xml:id="sb3"/>
                <measure xml:id="m3"/>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const measureLayer = svgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const m1 = svgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const m2 = svgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const m3 = svgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
  const r1 = svgDom.createElementNS('http://www.w3.org/2000/svg', 'rect')
  const r2 = svgDom.createElementNS('http://www.w3.org/2000/svg', 'rect')
  const r3 = svgDom.createElementNS('http://www.w3.org/2000/svg', 'rect')

  m1.setAttribute('class', 'measure')
  m2.setAttribute('class', 'measure')
  m3.setAttribute('class', 'measure')
  m1.setAttribute('data-id', 'm1')
  m2.setAttribute('data-id', 'm2')
  m3.setAttribute('data-id', 'm3')
  r1.setAttribute('x', '0')
  r1.setAttribute('width', '90')
  r2.setAttribute('x', '250')
  r2.setAttribute('width', '120')
  r3.setAttribute('x', '470')
  r3.setAttribute('width', '80')

  m1.appendChild(r1)
  m2.appendChild(r2)
  m3.appendChild(r3)
  measureLayer.appendChild(m1)
  measureLayer.appendChild(m2)
  measureLayer.appendChild(m3)
  svg.appendChild(measureLayer)

  applyFluidSystemsOutputMetadata(svg, {
    triple: { page: 'p001' },
    systemId: 'sysA',
    atDom
  })

  const payload = JSON.parse(svg.querySelector('desc#bw-fs-overlay-metadata').textContent)
  assert.equal(payload.readingOrderGeometrySource, 'ft')
  assert.equal(payload.readingOrderAdjustedCount, 3)

  const values = [m1, m2, m3].map(node => node.querySelector('animateTransform').getAttribute('values'))
  assert.deepEqual(values, [
    '0 0;0 0;50 0;0 0;0 0;0 0',
    '0 0;0 0;-30 0;0 0;0 0;0 0',
    '0 0;0 0;-50 0;0 0;0 0;0 0'
  ])
})
