import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { applyFluidSystemsOutputMetadata, resolveMatchedStaffLineContextForCurrentDt } from '../src/rendering/renderers.js'

const parser = new (new JSDOM().window.DOMParser)()

test('applyFluidSystemsOutputMetadata updates provenance desc and overlay metadata JSON', () => {
  const svgDom = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400"></svg>', 'image/svg+xml')
  const svg = svgDom.documentElement
  const provenanceDesc = svgDom.createElementNS('http://www.w3.org/2000/svg', 'desc')
  provenanceDesc.textContent = 'Engraved by Verovio 5.6.0-85e7620'
  svg.appendChild(provenanceDesc)

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

  const dtDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="d1"/>
                <measure xml:id="d2"/>
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
    dtDom,
    dtSvgElement: dtSvgDom.documentElement,
    liquifierVersion: '1.2.0',
    thulemeierVersion: '1.0.0'
  })

  assert.equal(svg.getAttribute('class'), null)
  assert.equal(svg.getAttribute('data-bw-fs-states'), null)
  assert.equal(
    provenanceDesc.textContent,
    'Cached Fluid Transcription rendered by Liquifier 1.2.0, based on Annotated Transcription rendered by Verovio 5.6.0-85e7620 and Diplomatic Transcription rendered by Thulemeier 1.0.0.'
  )

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
  assert.equal(payload.currentPageRegion.source, 'atMeasureCorresp')
  assert.equal(payload.currentPageRegion.coordinateSpace, 'definition-scale-viewBox')
  assert.equal(payload.currentPageRegion.dtMeasureCount, 2)
  assert.equal(payload.currentPageRegion.atMeasureCount, 2)
  assert.equal(payload.currentPageRegion.contentXMin, 0)
  assert.equal(payload.currentPageRegion.contentXMax, 320)
  assert.equal(payload.currentPageRegion.contentWidth, 320)
  assert.equal(payload.currentPageRegion.pageMarginTranslateX, 0)
  assert.equal(payload.currentPageRegion.pageMarginTranslateY, 0)
  assert.equal(payload.currentPageRegion.focusViewBoxString, '-500 0 1320 400')

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
    '<svg xmlns="http://www.w3.org/2000/svg" class="existing bw-fs-state-finding" data-bw-fs-states="finding" width="900" height="300"><desc>Engraved by Verovio 5.5.0</desc><desc id="bw-fs-overlay-metadata">{"old":true}</desc></svg>',
    'image/svg+xml'
  )
  const svg = svgDom.documentElement

  applyFluidSystemsOutputMetadata(svg, {
    triple: { page: 'p010' },
    systemId: null,
    liquifierVersion: '1.2.0',
    thulemeierVersion: '1.0.0'
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
  assert.equal(payload.currentPageRegion, null)

  assert.equal(svg.getAttribute('class'), 'existing')
  assert.equal(svg.getAttribute('data-bw-fs-states'), null)

  const provenanceDesc = Array.from(svg.querySelectorAll('desc')).find(desc => desc.getAttribute('id') !== 'bw-fs-overlay-metadata')
  assert.ok(provenanceDesc)
  assert.equal(
    provenanceDesc.textContent,
    'Cached Fluid Transcription rendered by Liquifier 1.2.0, based on Annotated Transcription rendered by Verovio 5.5.0 and Diplomatic Transcription rendered by Thulemeier 1.0.0.'
  )
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
  assert.equal(payload.currentPageRegion, null)

  const values = [m1, m2, m3].map(node => node.querySelector('animateTransform').getAttribute('values'))
  assert.deepEqual(values, [
    '0 0;0 0;50 0;0 0;0 0;0 0',
    '0 0;0 0;-30 0;0 0;0 0;0 0',
    '0 0;0 0;-50 0;0 0;0 0;0 0'
  ])
})

test('applyFluidSystemsOutputMetadata exposes currentPageRegion in rendered coordinates', () => {
  const svgDom = parser.parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5000 500"><g class="page-margin" transform="translate(1000, 3000)"></g></svg>',
    'image/svg+xml'
  )
  const svg = svgDom.documentElement
  const pageMargin = svg.querySelector('g.page-margin')

  /**
   * Processes measure for this operation.
   *
   * @param {string} id - Identifier for the target element.
   * @param {number} x - Numeric input used by this function.
   * @param {number} width - Identifier for the target element.
   * @returns {Object} Resulting object.
   */
  const makeMeasure = (id, x, width) => {
    const measure = svgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
    measure.setAttribute('class', 'measure')
    measure.setAttribute('data-id', id)

    const box = svgDom.createElementNS('http://www.w3.org/2000/svg', 'g')
    box.setAttribute('class', 'bounding-box')
    const rect = svgDom.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', String(x))
    rect.setAttribute('width', String(width))
    box.appendChild(rect)
    measure.appendChild(box)

    return measure
  }

  pageMargin.appendChild(makeMeasure('m10', 10000, 200))
  pageMargin.appendChild(makeMeasure('m20', 10250, 150))

  const atDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <measure xml:id="m10" corresp="../diplomaticTranscripts/src_dt.xml#d10"/>
        <measure xml:id="m20" corresp="../diplomaticTranscripts/src_dt.xml#d20"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const dtDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <measure xml:id="d10"/>
        <measure xml:id="d20"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  applyFluidSystemsOutputMetadata(svg, {
    triple: { page: 'p999' },
    systemId: 'sysZ',
    atDom,
    dtDom
  })

  const payload = JSON.parse(svg.querySelector('desc#bw-fs-overlay-metadata').textContent)
  assert.equal(pageMargin.getAttribute('transform'), 'translate(-9000, 3000)')
  assert.equal(payload.currentPageRegionAlignment.targetX, 1000)
  assert.equal(payload.currentPageRegionAlignment.previousTranslateX, 1000)
  assert.equal(payload.currentPageRegionAlignment.translatedX, -9000)
  assert.equal(payload.currentPageRegionAlignment.deltaX, -10000)
  assert.equal(payload.currentPageRegion.contentXMin, 1000)
  assert.equal(payload.currentPageRegion.contentXMax, 1400)
  assert.equal(payload.currentPageRegion.contentWidth, 400)
  assert.equal(payload.currentPageRegion.pageMarginTranslateX, -9000)
  assert.equal(payload.currentPageRegion.focusViewBoxString, '500 0 1400 500')
})

test('resolveMatchedStaffLineContextForCurrentDt returns strict block-to-system mapping from sb@corresp', () => {
  const atDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <pb corresp="../D-BNba_MH_60_Engelmann.xml#p001"/>
        <sb corresp="../diplomaticTranscripts/src_dt.xml#sBottom"/>
        <measure xml:id="m1"/>
        <sb corresp="../diplomaticTranscripts/src_dt.xml#sTop"/>
        <measure xml:id="m2"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const dtDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <pb target="../D-BNba_MH_60_Engelmann.xml#p001"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const warnings = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: msg => warnings.push(String(msg)),
    error: () => {}
  }

  const context = resolveMatchedStaffLineContextForCurrentDt(atDom, dtDom, logger)
  assert.equal(context.errorMessage, null)
  assert.ok(context.matchedStaffLineBlocks instanceof Set)
  assert.ok(context.blockToDtSystemId instanceof Map)
  assert.deepEqual(Array.from(context.matchedStaffLineBlocks).sort((a, b) => a - b), [0, 1])
  assert.equal(context.blockToDtSystemId.get(0), 'sBottom')
  assert.equal(context.blockToDtSystemId.get(1), 'sTop')
  assert.deepEqual(warnings, [])
})

test('resolveMatchedStaffLineContextForCurrentDt fails when matched block lacks sb system mapping', () => {
  const atDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <pb corresp="../D-BNba_MH_60_Engelmann.xml#p001"/>
        <sb corresp="../diplomaticTranscripts/src_dt.xml#sBottom"/>
        <measure xml:id="m1"/>
        <sb/>
        <measure xml:id="m2"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const dtDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <pb target="../D-BNba_MH_60_Engelmann.xml#p001"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const warnings = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: msg => warnings.push(String(msg)),
    error: () => {}
  }

  const context = resolveMatchedStaffLineContextForCurrentDt(atDom, dtDom, logger)
  assert.equal(context.matchedStaffLineBlocks, null)
  assert.equal(context.blockToDtSystemId, null)
  assert.ok(context.errorMessage)
  assert.ok(context.errorMessage.includes('Missing AT sb@corresp DT system mapping'))
  assert.ok(warnings.some(msg => msg.includes('Missing AT sb@corresp DT system mapping')))
})
