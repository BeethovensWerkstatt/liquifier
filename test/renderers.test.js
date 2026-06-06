import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { buildCurrentDtSvgForFluidTranscripts } from '../src/rendering/renderers/dt2svg.js'
import { resolveFluidTranscriptsOverlayPlacement } from '../src/rendering/renderers/fluidTranscripts/overlay.js'
import { resolveMatchedStaffLineContextForCurrentDt } from '../src/rendering/renderers/fluidTranscripts/staffLineContext.js'

const parser = new (new JSDOM().window.DOMParser)()

test('buildCurrentDtSvgForFluidTranscripts renders DT SVG from current input DOMs', async () => {
  const dtDom = parser.parseFromString('<mei xmlns="http://www.music-encoding.org/ns/mei"/>', 'text/xml')
  const sourceDom = parser.parseFromString('<mei xmlns="http://www.music-encoding.org/ns/mei"/>', 'text/xml')

  const preparedToken = { prepared: true }
  let prepareCallCount = 0
  let renderCallCount = 0

  const dtSvg = await buildCurrentDtSvgForFluidTranscripts({
    dtDom,
    sourceDom,
    parser,
    prepareDt: ({ dtDom: seenDtDom, sourceDom: seenSourceDom }) => {
      prepareCallCount++
      assert.equal(seenDtDom, dtDom)
      assert.equal(seenSourceDom, sourceDom)
      return preparedToken
    },
    renderDt: async (preparedDt) => {
      renderCallCount++
      assert.equal(preparedDt, preparedToken)
      return '<svg xmlns="http://www.w3.org/2000/svg"><g class="system" data-id="s1"/></svg>'
    }
  })

  assert.equal(prepareCallCount, 1)
  assert.equal(renderCallCount, 1)
  assert.equal(dtSvg.documentElement.localName, 'svg')
  assert.equal(dtSvg.querySelector('g.system')?.getAttribute('data-id'), 's1')
})

test('buildCurrentDtSvgForFluidTranscripts throws when DT preparation fails', async () => {
  const dtDom = parser.parseFromString('<mei xmlns="http://www.music-encoding.org/ns/mei"/>', 'text/xml')
  const sourceDom = parser.parseFromString('<mei xmlns="http://www.music-encoding.org/ns/mei"/>', 'text/xml')

  await assert.rejects(
    buildCurrentDtSvgForFluidTranscripts({
      dtDom,
      sourceDom,
      parser,
      prepareDt: () => null,
      renderDt: async () => '<svg xmlns="http://www.w3.org/2000/svg"/>'
    }),
    /Could not prepare diplomatic transcript for fluid transcripts generation/
  )
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

test('resolveFluidTranscriptsOverlayPlacement anchors overlay by AT stream and DT writing-zone center', () => {
  const overlayContext = {
    surfaceId: 'surf1',
    facsimile: {
      imageMm: {
        y: 0
      },
      heightPx: 1000,
      mmPerPx: 0.1,
      mediaFragMm: {
        x: -2,
        y: -5,
        w: 100,
        h: 200
      }
    }
  }

  const dtDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <pb target="../D-BNba_MH_60_Engelmann.xml#surf1"/>
      </section></score></mdiv></body></music>
      <meiHead><fileDesc><sourceDesc>
        <source target="../D-BNba_MH_60_Engelmann.xml#wz1"/>
      </sourceDesc></fileDesc></meiHead>
    </mei>
  `, 'text/xml')

  const sourceDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <facsimile>
          <surface xml:id="surf1">
            <zone xml:id="z1" data="#wz1" ulx="100" uly="100" lrx="500" lry="500"/>
          </surface>
        </facsimile>
      </music>
    </mei>
  `, 'text/xml')

  const fluidSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <path class="rastrum" d="M0 900 L1000 900"/>
      <path class="rastrum" d="M0 2700 L1000 2700"/>
    </svg>
  `, 'image/svg+xml')

  const positionalData = {
    pages: [
      { currentPage: false, precedingWidth: 0, atCenterY: 40 },
      { currentPage: true, precedingWidth: 125.5, atCenterY: 65 }
    ]
  }

  const placement = resolveFluidTranscriptsOverlayPlacement({
    overlayContext,
    positionalData,
    fluidSvg,
    dtDom,
    sourceDom
  })

  assert.equal(placement.unitsPerMm, 90)
  assert.equal(placement.xOffsetMm, 125.5)
  assert.equal(placement.xOffsetUnits, 11295)
  assert.equal(placement.yOffsetMm, -10)
  assert.equal(placement.yOffsetUnits, -900)
})

test('resolveFluidTranscriptsOverlayPlacement falls back to zero offsets when active page is unavailable', () => {
  const overlayContext = {
    facsimile: {
      mediaFragMm: {
        x: 0,
        y: 0,
        w: 100,
        h: 100
      }
    }
  }

  const placement = resolveFluidTranscriptsOverlayPlacement({
    overlayContext,
    positionalData: { pages: [] }
  })

  assert.deepEqual(placement, {
    xOffsetMm: 0,
    yOffsetMm: 0,
    xOffsetUnits: 0,
    yOffsetUnits: 0,
    unitsPerMm: 90
  })
})
