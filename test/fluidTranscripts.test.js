import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { calculateScaleFactor, generateFluidTranscription as generateFluidTranscriptionImpl, resolveFluidSystemsStates, retrievePositioningDataForFluidTranscripts } from '../src/preparation/fluidTranscripts.js'
import { adjustViewBoxForContent } from '../src/preparation/liquify/viewbox.js'

const parser = new (new JSDOM().window.DOMParser)()

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
}

const generateFluidTranscription = (dtSvg, atSvg, atMei, fourthArg, fifthArg, sixthArg) => {
  const hasDtMeiArg = sixthArg !== undefined
  const logger = hasDtMeiArg ? fifthArg : fourthArg
  const options = hasDtMeiArg ? sixthArg : fifthArg

  return generateFluidTranscriptionImpl({
    dtSvg,
    atSvg,
    atMei,
    dtMei: hasDtMeiArg ? fourthArg : null,
    sourceMei: null,
    reconstructionMei: null,
    logger,
    overlayContext: null,
    positioningData: null
  }, options)
}

test('retrievePositioningDataForFluidTranscripts uses overlay facsimile geometry when provided', () => {
  const dtSvg = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml')
  const atSvg = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml')
  const atMei = parser.parseFromString('<mei><music><body><pb corresp="#surface-current"/></body></music></mei>', 'text/xml')
  const dtMei = parser.parseFromString('<mei><music><body><pb target="#surface-current"/></body></music></mei>', 'text/xml')
  const sourceMei = parser.parseFromString('<mei><music><body/></music></mei>', 'text/xml')
  const reconstructionMei = parser.parseFromString('<mei><music><body/></music></mei>', 'text/xml')

  const overlayContext = {
    surfaceId: 'surface-current',
    facsimile: {
      href: 'https://example.org/iiif/image',
      widthPx: 6000,
      heightPx: 4000,
      fragment: { x: 120, y: 80, w: 1800, h: 1200, rotate: 2 },
      pageMm: { width: 420, height: 297 },
      mediaFragMm: { x: -5, y: -7, w: 430, h: 310 },
      imageMm: { x: -33.7, y: -25.2, width: 1400.3, height: 933.5 },
      ratioPxPerMm: 4.186,
      mmPerPx: 0.23889
    },
    shapes: {
      absolutePath: null
    }
  }

  const positionalData = retrievePositioningDataForFluidTranscripts({
    dtSvg,
    atSvg,
    atMei,
    dtMei,
    sourceMei,
    reconstructionMei,
    logger: noopLogger,
    overlayContext
  })

  assert.equal(positionalData.iiifUrl, overlayContext.facsimile.href)
  assert.deepEqual(positionalData.facsimile, overlayContext.facsimile)
})

test('resolveFluidSystemsStates moves non-supplied material in regulation', () => {
  const finding = { type: 'translate', val: '10 20' }
  const normalization = { type: 'translate', val: '15 25' }
  const supplements = { type: 'translate', val: '0 0' }
  const interventions = { type: 'translate', val: '0 0' }

  const resolved = resolveFluidSystemsStates({
    finding,
    normalization,
    supplements,
    interventions
  })

  assert.equal(resolved.finding, finding)
  assert.equal(resolved.normalization, normalization)
  assert.equal(resolved.readingOrder, normalization)
  assert.equal(resolved.regulation, supplements)
  assert.equal(resolved.supplements, supplements)
  assert.equal(resolved.interventions, interventions)
})

test('resolveFluidSystemsStates honors explicit fluidSystems keys', () => {
  const finding = { type: 'd', val: 'F' }
  const normalization = { type: 'd', val: 'N' }
  const readingOrder = { type: 'd', val: 'R' }
  const regulation = { type: 'd', val: 'G' }
  const supplements = { type: 'd', val: 'S' }
  const interventions = { type: 'd', val: 'I' }

  const resolved = resolveFluidSystemsStates({
    finding,
    normalization,
    readingOrder,
    regulation,
    supplements,
    interventions
  })

  assert.deepEqual(resolved, {
    digitalFacsimile: null,
    writingZone: null,
    finding,
    normalization,
    readingOrder,
    regulation,
    supplements,
    interventions
  })
})

test('generateFluidTranscription fluidSystems uses full DT-to-AT scale by default', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="system" data-id="sys1">
        <g class="measure" data-id="m1">
          <g class="staff">
            <path d="M0 100 L300 100"/>
            <path d="M0 110 L300 110"/>
            <path d="M0 120 L300 120"/>
            <path d="M0 130 L300 130"/>
            <path d="M0 140 L300 140"/>
          </g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="33.333333"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section><measure xml:id="m1"/></section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const fullScaleFactor = calculateScaleFactor(dtSvg.documentElement || dtSvg, atSvg.documentElement || atSvg)
  const outputWithFullMode = generateFluidTranscription(dtSvg, atSvg, atMei, null, noopLogger, {
    stateModel: 'fluidTranscripts',
    dtScaleReductionMode: 'full'
  })

  const outputWithConfiguredReduction = generateFluidTranscription(dtSvg, atSvg, atMei, null, noopLogger, {
    stateModel: 'fluidTranscripts',
    dtScaleReductionFactor: fullScaleFactor
  })

  const outputWithDefaultReduction = generateFluidTranscription(dtSvg, atSvg, atMei, null, noopLogger, {
    stateModel: 'fluidTranscripts'
  })

  const getFirstAnimatedY = (svg) => {
    const rastrum = svg.querySelector('path.rastrum')
    assert.ok(rastrum)
    const animation = rastrum.querySelector('animate[attributeName="d"]')
    assert.ok(animation)
    const firstState = animation.getAttribute('values').split(';')[0]
    const match = firstState.match(/M[\d.-]+\s+([\d.-]+)\s+L/)
    assert.ok(match)
    return Number.parseFloat(match[1])
  }

  const yWithFullMode = getFirstAnimatedY(outputWithFullMode)
  const yWithConfiguredReduction = getFirstAnimatedY(outputWithConfiguredReduction)
  const yWithDefaultReduction = getFirstAnimatedY(outputWithDefaultReduction)

  assert.equal(yWithDefaultReduction, yWithFullMode)
  assert.notEqual(yWithConfiguredReduction, yWithDefaultReduction)
  assert.ok(yWithConfiguredReduction > yWithDefaultReduction)
})

test('generateFluidTranscription fluidTranscripts applies per-system reduction factors by matched block', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400">
      <g class="system" data-id="sysAT">
        <g class="measure" data-id="m1">
          <g class="staff">
            <path d="M0 100 L240 100"/>
            <path d="M0 110 L240 110"/>
          </g>
        </g>
        <g class="measure" data-id="m2">
          <g class="staff">
            <path d="M0 220 L240 220"/>
            <path d="M0 230 L240 230"/>
          </g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400">
      <g class="system" data-id="s1">
        <g class="rastrum bounding-box"><rect x="0" y="60" width="240" height="8"/></g>
        <g class="rastrum">
          <path d="M0 60 L240 60"/>
          <path d="M0 68 L240 68"/>
        </g>
      </g>
      <g class="system" data-id="s2">
        <g class="rastrum bounding-box"><rect x="0" y="160" width="240" height="16"/></g>
        <g class="rastrum">
          <path d="M0 160 L240 160"/>
          <path d="M0 176 L240 176"/>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <measure xml:id="m1"/>
        <sb xml:id="sb2"/>
        <measure xml:id="m2"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const commonOptions = {
    stateModel: 'fluidTranscripts',
    matchedStaffLineBlocks: new Set([0, 1]),
    blockToDtSystemId: new Map([[0, 's1'], [1, 's2']])
  }

  const outFull = generateFluidTranscription(dtSvg, atSvg, atMei, null, noopLogger, {
    ...commonOptions,
    dtScaleReductionMode: 'full'
  })

  const outPerSystem = generateFluidTranscription(dtSvg, atSvg, atMei, null, noopLogger, {
    ...commonOptions
  })

  const readStartY = (svg, blockIndex) => {
    const line = svg.querySelector(`path.rastrum[data-bw-block="${blockIndex}"][data-bw-line-index="0"]`)
    assert.ok(line)
    const animation = line.querySelector('animate[attributeName="d"]')
    assert.ok(animation)
    const first = animation.getAttribute('values').split(';')[0]
    const match = first.match(/M[\d.-]+\s+([\d.-]+)\s+L/)
    assert.ok(match)
    return Number.parseFloat(match[1])
  }

  const fullBlock0 = readStartY(outFull, 0)
  const fullBlock1 = readStartY(outFull, 1)
  const perBlock0 = readStartY(outPerSystem, 0)
  const perBlock1 = readStartY(outPerSystem, 1)

  const deltaBlock0 = perBlock0 - fullBlock0
  const deltaBlock1 = perBlock1 - fullBlock1

  assert.notEqual(deltaBlock0, 0)
  assert.notEqual(deltaBlock1, 0)
  assert.notEqual(deltaBlock0, deltaBlock1)
})

test('adjustViewBoxForContent focuses fluidSystems viewBox to matched blocks', () => {
  const svg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <svg class="definition-scale" viewBox="0 0 10000 2000">
        <g class="page-margin" transform="translate(1000,3000)">
          <g class="bw-system-rastrum" data-bw-block="0">
            <path class="rastrum" data-bw-block="0" d="M0 100 L200 100"/>
          </g>
          <g class="measure" data-id="m1">
            <path d="M0 120 L220 120"/>
          </g>
          <g class="measure" data-id="m2" data-bw-unmatched-container="true">
            <path d="M5000 120 L5200 120"/>
          </g>
        </g>
      </svg>
    </svg>
  `, 'image/svg+xml').documentElement

  adjustViewBoxForContent(svg, {
    logger: noopLogger,
    stateModel: 'fluidSystems',
    matchedStaffLineBlocks: new Set([0]),
    measureBlockMap: new Map([
      ['m1', 0],
      ['m2', 4]
    ])
  })

  const definitionScale = svg.querySelector('svg.definition-scale')
  assert.equal(definitionScale.getAttribute('viewBox'), '950 3050 320 120')
})

test('generateFluidTranscription fluidSystems keeps AT-only note hidden through regulation', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="note" data-id="a1">
          <g class="notehead"><use transform="translate(120,120)"/></g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <note xml:id="a1" pname="c" oct="4"/>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  }

  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })
  const outNote = outSvg.querySelector('g.note[data-id="a1"]')
  assert.ok(outNote)

  const opacityAnim = outNote.querySelector('animate[attributeName="opacity"]')
  assert.ok(opacityAnim)
  assert.equal(opacityAnim.getAttribute('values'), '0;0;0;0;0;0;1;1')
})

test('generateFluidTranscription fluidSystems keeps staff lines stable through readingOrder and transitions by regulation', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="system" data-id="sysA">
        <g class="measure" data-id="m1">
          <g class="staff"><path d="M10 100 L80 100"/></g>
        </g>
        <g class="measure" data-id="m2">
          <g class="staff"><path d="M120 100 L190 100"/></g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="200" height="40"/></g>
      <g class="rastrum"><path d="M0 100 L200 100"/></g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section><measure xml:id="m1"/></section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

  const lines = Array.from(outSvg.querySelectorAll('path.rastrum'))
  assert.ok(lines.length >= 1)

  const transitionsAtRegulation = lines.map(line => {
    const dAnim = line.querySelector('animate[attributeName="d"]')
    assert.ok(dAnim)

    const values = dAnim.getAttribute('values').split(';')
    assert.equal(values.length, 8)
    assert.equal(values[0], values[1])
    assert.equal(values[1], values[2])
    assert.equal(values[2], values[3])
    assert.equal(values[3], values[4])
    assert.equal(values[5], values[6])
    assert.equal(values[6], values[7])
    return values[4] !== values[5]
  })

  assert.ok(transitionsAtRegulation.some(Boolean))
})

test('generateFluidTranscription fluidSystems keeps matched block geometry stable through readingOrder', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400">
      <g class="system" data-id="sysA">
        <g class="measure" data-id="m1">
          <g class="staff"><path d="M10 100 L90 100"/></g>
        </g>
        <g class="measure" data-id="m2">
          <g class="staff"><path d="M140 100 L240 100"/></g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400">
      <g class="system" data-id="s1">
        <g class="rastrum bounding-box"><rect x="0" y="90" width="80" height="20"/></g>
        <g class="rastrum"><path d="M0 100 L80 100"/></g>
      </g>
      <g class="system" data-id="s2">
        <g class="rastrum bounding-box"><rect x="0" y="190" width="80" height="20"/></g>
        <g class="rastrum"><path d="M0 200 L80 200"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <measure xml:id="m1"/>
        <sb xml:id="sb2" corresp="#s2"/>
        <measure xml:id="m2"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, {
    stateModel: 'fluidSystems',
    matchedStaffLineBlocks: new Set([0, 1]),
    blockToDtSystemId: new Map([[0, 's1'], [1, 's2']])
  })

  const blockOneLine = outSvg.querySelector('path.rastrum[data-bw-block="1"]')
  assert.ok(blockOneLine)

  const dValues = blockOneLine.querySelector('animate[attributeName="d"]').getAttribute('values').split(';')
  assert.equal(dValues.length, 8)
  assert.equal(dValues[3], dValues[4], 'normalization and readingOrder should retain identical child geometry')
  assert.notEqual(dValues[4], dValues[5], 'readingOrder and regulation should still differ')

  assert.notEqual(dValues[4], dValues[5], 'regulation should still be able to change internal layout after readingOrder')
})

test('generateFluidTranscription fluidTranscripts builds separate AT target staff sets per AT block', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="system" data-id="sysA">
        <g class="measure" data-id="m1"><g class="staff"><path d="M10 100 L90 100"/></g></g>
        <g class="measure" data-id="m2"><g class="staff"><path d="M110 100 L190 100"/></g></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="90" width="120" height="40"/></g>
      <g class="rastrum"><path d="M0 100 L120 100"/></g>
      <g class="rastrum bounding-box"><rect x="0" y="190" width="120" height="40"/></g>
      <g class="rastrum"><path d="M0 200 L120 200"/></g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <measure xml:id="m1"/>
        <sb xml:id="sb2"/>
        <measure xml:id="m2"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidTranscripts' })

  const rastrumLines = Array.from(outSvg.querySelectorAll('path.rastrum'))
  assert.equal(rastrumLines.length, 2)

  const atTargets = rastrumLines.map(line => {
    const vals = line.querySelector('animate[attributeName="d"]').getAttribute('values').split(';')
    return vals[5]
  })

  assert.deepEqual(atTargets.sort(), ['M10 100 L90 100', 'M110 100 L190 100'])
})

test('generateFluidTranscription fluidTranscripts keeps AT block rastrum order left-to-right', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="system" data-id="sysA">
        <g class="measure" data-id="m1"><g class="staff"><path d="M10 100 L90 100"/></g></g>
        <g class="measure" data-id="m2"><g class="staff"><path d="M110 100 L190 100"/></g></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="90" width="120" height="40"/></g>
      <g class="rastrum"><path d="M0 100 L120 100"/></g>
      <g class="rastrum bounding-box"><rect x="0" y="190" width="120" height="40"/></g>
      <g class="rastrum"><path d="M0 200 L120 200"/></g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <measure xml:id="m1"/>
        <sb xml:id="sb2"/>
        <measure xml:id="m2"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidTranscripts' })

  const rastrumLines = Array.from(outSvg.querySelectorAll('path.rastrum'))
  assert.equal(rastrumLines.length, 2)

  const xStarts = rastrumLines.map(path => {
    const d = path.getAttribute('d')
    return Number(d.match(/^M([\d.-]+)/)[1])
  })

  assert.deepEqual(xStarts, [10, 110])
})

test('generateFluidTranscription fluidTranscripts clones AT staff lines to cover multiple DT systems', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="system" data-id="sysA">
        <g class="measure" data-id="m1">
          <g class="staff"><path d="M10 100 L90 100"/></g>
          <g class="staff"><path d="M10 120 L90 120"/></g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="90" width="120" height="40"/></g>
      <g class="rastrum"><path d="M0 100 L120 100"/><path d="M0 120 L120 120"/></g>
      <g class="rastrum bounding-box"><rect x="0" y="200" width="120" height="40"/></g>
      <g class="rastrum"><path d="M0 210 L120 210"/><path d="M0 230 L120 230"/></g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section><measure xml:id="m1"/></section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidTranscripts' })

  const rastrumLines = outSvg.querySelectorAll('path.rastrum')
  assert.equal(rastrumLines.length, 4)
  const animatedLines = outSvg.querySelectorAll('path.rastrum animate[attributeName="d"]')
  assert.equal(animatedLines.length, 4)
})

test('generateFluidTranscription fluidTranscripts resolves DT lines from staff data-rastrum references', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="system" data-id="sysA">
        <g class="measure" data-id="m1">
          <g class="staff">
            <path d="M10 100 L90 100"/>
            <path d="M10 120 L90 120"/>
          </g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="90" width="200" height="40"/></g>
      <g class="rastrums">
        <g class="rastrum" data-id="r-a"><path d="M0 100 L200 100"/></g>
        <g class="rastrum" data-id="r-b"><path d="M0 120 L200 120"/></g>
      </g>
      <g class="system" data-id="s1">
        <g class="staff" data-rastrum="r-a"/>
        <g class="staff" data-rastrum="r-b"/>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section><measure xml:id="m1"/></section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, {
    stateModel: 'fluidTranscripts',
    matchedStaffLineBlocks: new Set([0]),
    blockToDtSystemId: new Map([[0, 's1']])
  })

  const blockLines = Array.from(outSvg.querySelectorAll('path.rastrum[data-bw-block="0"]'))
  assert.equal(blockLines.length, 2)

  blockLines.forEach(line => {
    const dAnim = line.querySelector('animate[attributeName="d"]')
    assert.ok(dAnim)
    assert.equal(line.querySelector('animate[attributeName="opacity"]'), null)
  })
})

test('generateFluidTranscription fluidTranscripts honors explicit block-to-system mapping order', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="system" data-id="sysA">
        <g class="measure" data-id="m1"><g class="staff"><path d="M10 100 L90 100"/></g></g>
        <g class="measure" data-id="m2"><g class="staff"><path d="M110 100 L190 100"/></g></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="90" width="200" height="40"/></g>
      <g class="rastrum bounding-box"><rect x="0" y="190" width="200" height="40"/></g>
      <g class="system" data-id="sTop">
        <g class="rastrum"><path d="M0 100 L200 100"/></g>
      </g>
      <g class="system" data-id="sBottom">
        <g class="rastrum"><path d="M0 200 L200 200"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <measure xml:id="m1"/>
        <sb xml:id="sb2"/>
        <measure xml:id="m2"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

  const outputNormal = generateFluidTranscription(dtSvg, atSvg, atMei, logger, {
    stateModel: 'fluidTranscripts',
    matchedStaffLineBlocks: new Set([0, 1]),
    blockToDtSystemId: new Map([[0, 'sTop'], [1, 'sBottom']])
  })

  const outputReversed = generateFluidTranscription(dtSvg, atSvg, atMei, logger, {
    stateModel: 'fluidTranscripts',
    matchedStaffLineBlocks: new Set([0, 1]),
    blockToDtSystemId: new Map([[0, 'sBottom'], [1, 'sTop']])
  })

  const normalBlock0 = outputNormal.querySelector('path.rastrum[data-bw-block="0"] animate[attributeName="d"]').getAttribute('values').split(';')[0]
  const normalBlock1 = outputNormal.querySelector('path.rastrum[data-bw-block="1"] animate[attributeName="d"]').getAttribute('values').split(';')[0]
  const reversedBlock0 = outputReversed.querySelector('path.rastrum[data-bw-block="0"] animate[attributeName="d"]').getAttribute('values').split(';')[0]
  const reversedBlock1 = outputReversed.querySelector('path.rastrum[data-bw-block="1"] animate[attributeName="d"]').getAttribute('values').split(';')[0]

  assert.equal(reversedBlock0, normalBlock1)
  assert.equal(reversedBlock1, normalBlock0)
})

test('generateFluidTranscription fluidSystems keeps AT target in regulation and supplements', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="note" data-id="a1">
          <g class="notehead"><use transform="translate(120,120)"/></g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
      <g class="note" data-id="d1">
        <g class="notehead"><use x="140" y="140"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <note xml:id="a1" pname="c" oct="4" corresp="#d1"/>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

  const noteAnim = outSvg.querySelector('g.note[data-id="a1"] > animateTransform[type="translate"]')
  assert.ok(noteAnim)
  const values = noteAnim.getAttribute('values').split(';')
  assert.equal(values.length, 8)
  assert.equal(values[5], '0 0')
  assert.equal(values[6], '0 0')
  assert.equal(values[7], '0 0')
})

test('generateFluidTranscription fluidTranscripts skips no-op note translate animation when all states are 0 0', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="note" data-id="a1">
          <g class="notehead"><use transform="translate(120,120)"/></g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
      <g class="note" data-id="d1">
        <g class="notehead"><use x="120" y="120"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <note xml:id="a1" pname="c" oct="4" corresp="#d1"/>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidTranscripts' })

  const noteAnim = outSvg.querySelector('g.note[data-id="a1"] > animateTransform[type="translate"]')
  assert.equal(noteAnim, null)
})

test('generateFluidTranscription fluidSystems applies vertical choice offsets in regulation and supplements only', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="note" data-id="a1">
          <g class="notehead"><use transform="translate(120,120)"/></g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
      <g class="note" data-id="d1">
        <g class="notehead"><use x="120" y="120"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <note xml:id="a1" pname="c" oct="4" corresp="#d1"/>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, {
    stateModel: 'fluidSystems',
    choiceVerticalOffsets: new Map([['a1', -20]])
  })

  const noteAnim = outSvg.querySelector('g.note[data-id="a1"] > animateTransform[type="translate"]')
  assert.ok(noteAnim)
  const values = noteAnim.getAttribute('values').split(';')
  assert.equal(values.length, 8)
  assert.equal(values[5], '0 -20')
  assert.equal(values[6], '0 -20')
  assert.equal(values[7], '0 0')
})

test('generateFluidTranscription classifies foreign-DT note corresp as otherWz', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="note" data-id="a1">
          <g class="notehead"><use transform="translate(120,120)"/></g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="note" data-id="dForeign">
        <g class="notehead"><use x="120" y="120"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <measure xml:id="m1">
          <staff n="1"><layer>
            <note xml:id="a1" corresp="../diplomaticTranscripts/other_piece_p001_wz01_dt.xml#dForeign"/>
          </layer></staff>
        </measure>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, {
    stateModel: 'fluidTranscripts',
    currentDtReference: '../data/sources/D-BNba_MH_60_Engelmann/diplomaticTranscripts/D-BNba_MH_60_Engelmann_p017_wz01_dt.xml'
  })

  const note = outSvg.querySelector('g.note[data-id="a1"]')
  const noteClass = note.getAttribute('class') || ''
  assert.match(noteClass, /\botherWz\b/)
  assert.ok(!/\bsupplied\b/.test(noteClass))
})

test('generateFluidTranscription classifies foreign-DT tempo corresp as otherWz', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="tempo" data-id="t1">
        <text x="100" y="100">Allegro</text>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <measure xml:id="m1">
          <staff n="1"><layer>
            <tempo xml:id="t1" corresp="../diplomaticTranscripts/other_piece_p001_wz01_dt.xml#dtTempo"/>
          </layer></staff>
        </measure>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, {
    stateModel: 'fluidTranscripts',
    currentDtReference: '../data/sources/D-BNba_MH_60_Engelmann/diplomaticTranscripts/D-BNba_MH_60_Engelmann_p017_wz01_dt.xml'
  })

  const tempo = outSvg.querySelector('g.tempo[data-id="t1"]')
  const tempoClass = tempo.getAttribute('class') || ''
  assert.match(tempoClass, /\botherWz\b/)
  assert.ok(!/\bsupplied\b/.test(tempoClass))
})

test('generateFluidTranscription fluidSystems animates system labels from regulation onward', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
      </g>
      <text class="pageLabel" x="10" y="20">Label</text>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1"/>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

  const label = outSvg.querySelector('text.pageLabel')
  assert.ok(label)
  assert.equal(label.getAttribute('opacity'), '0')

  const opacityAnim = label.querySelector('animate[attributeName="opacity"]')
  assert.ok(opacityAnim)
  assert.equal(opacityAnim.getAttribute('values'), '0;0;0;0;0;1;1;1')
  assert.equal(opacityAnim.getAttribute('keyTimes'), '0.00;0.14;0.29;0.43;0.70;0.71;0.86;1.00')
})

test('generateFluidTranscription animates chord note augmentation dots with noteheads', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="chord" data-id="ac1" data-stem.dir="up">
          <g class="note" data-id="an1">
            <g class="notehead"><use transform="translate(120,120)"/></g>
            <g class="dots"><ellipse cx="140" cy="120" rx="4" ry="4"/></g>
          </g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
      <g class="chord" data-id="dc1">
        <g class="note" data-id="dn1">
          <g class="notehead"><use x="140" y="130"/></g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <chord xml:id="ac1" stem.dir="up" corresp="#dc1">
                        <note xml:id="an1" pname="c" oct="4" dots="1"/>
                      </chord>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidTranscripts' })

  const noteheadAnim = outSvg.querySelector('g.chord[data-id="ac1"] g.note[data-id="an1"] g.notehead > animateTransform[type="translate"]')
  const dotsAnim = outSvg.querySelector('g.chord[data-id="ac1"] g.note[data-id="an1"] g.dots > animateTransform[type="translate"]')

  assert.ok(noteheadAnim)
  assert.ok(dotsAnim)
  assert.equal(dotsAnim.getAttribute('values'), noteheadAnim.getAttribute('values'))
})

test('generateFluidTranscription fluidSystems hides unmatched subsequent-page measure via container animation', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="system" data-id="sysA">
        <g class="measure" data-id="m1">
          <g class="staff"><path d="M0 100 L300 100"/></g>
          <g class="note" data-id="a1">
            <g class="notehead"><use transform="translate(120,120)"/></g>
          </g>
        </g>
        <g class="measure" data-id="m2">
          <g class="staff"><path d="M0 200 L300 200"/></g>
          <g class="ledgerLines above">
            <g class="lineDash" data-related="#a2"><path d="M95 185 L165 185"/></g>
          </g>
          <g class="note" data-id="a2">
            <g class="notehead"><use transform="translate(120,190)"/></g>
          </g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum"><path d="M0 100 L300 100"/></g>
      <g class="system" data-id="dts1">
        <g class="staff"><g class="rastrum"><path d="M0 100 L300 100"/></g></g>
      </g>
      <g class="note" data-id="d1">
        <g class="notehead"><use x="140" y="130"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1"><layer>
                    <note xml:id="a1" corresp="#d1"/>
                  </layer></staff>
                </measure>
                <sb xml:id="sb2"/>
                <measure xml:id="m2">
                  <staff n="1"><layer>
                    <note xml:id="a2" corresp="../diplomaticTranscripts/other_piece_p001_wz01_dt.xml#d2"/>
                  </layer></staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, {
    stateModel: 'fluidSystems',
    matchedStaffLineBlocks: new Set([0]),
    blockToDtSystemId: new Map([[0, 'dts1']]),
    currentDtReference: '../data/sources/current_piece_p017_wz01_dt.xml'
  })

  const unmatchedMeasure = outSvg.querySelector('g.measure[data-id="m2"]')
  assert.ok(unmatchedMeasure)
  assert.equal(unmatchedMeasure.getAttribute('data-bw-unmatched-container'), 'true')

  const measureOpacityAnim = unmatchedMeasure.querySelector(':scope > animate[attributeName="opacity"]')
  assert.ok(measureOpacityAnim)
  assert.equal(measureOpacityAnim.getAttribute('values'), '0;0;0;0;0;0;1;1')

  const unmatchedNote = outSvg.querySelector('g.note[data-id="a2"]')
  assert.ok(unmatchedNote)
  assert.match(unmatchedNote.getAttribute('class') || '', /\botherWz\b/)

  const unmatchedLedger = outSvg.querySelector('g.measure[data-id="m2"] g.lineDash[data-related="#a2"]')
  assert.ok(unmatchedLedger)
  assert.equal(unmatchedLedger.querySelector('animateTransform[type="translate"]'), null)
})

test('generateFluidTranscription animates bTrem tremolo symbol from DT line corresp', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="bTrem" data-id="atTrem1">
          <use href="#E222" transform="translate(120,100) scale(0.72,0.72)"/>
          <g class="chord" data-id="atChord1" data-stem.dir="down"/>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
      <g class="line bTrem" data-id="dtLine1">
        <polygon points="200,100 240,70 240,80 200,110"/>
      </g>
      <g class="line bTrem" data-id="dtLine2">
        <polygon points="205,120 245,90 245,100 205,130"/>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <bTrem xml:id="atTrem1" corresp="#dtLine1 #dtLine2" dur="2" unitdur="32">
                        <chord xml:id="atChord1" dur="2" stem.dir="down">
                          <note xml:id="atNote1" pname="c" oct="4"/>
                        </chord>
                      </bTrem>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidTranscripts' })

  // AT glyph: hidden in DT phases (opacity 0), visible in AT phases (opacity 1)
  const tremUse = outSvg.querySelector('g.bTrem[data-id="atTrem1"] > use')
  assert.ok(tremUse, 'AT glyph use element must exist')
  assert.equal(tremUse.getAttribute('opacity'), '0', 'AT glyph starts hidden (DT phase)')

  const glyphOpacity = tremUse.querySelector('animate[attributeName="opacity"]')
  assert.ok(glyphOpacity, 'AT glyph must have opacity animation')
  const glyphValues = glyphOpacity.getAttribute('values').split(';')
  assert.equal(glyphValues.length, 6)
  assert.equal(glyphValues[0], '0') // finding: hidden
  assert.equal(glyphValues[1], '0') // normalization: hidden
  assert.equal(glyphValues[2], '1') // readingOrder: visible
  assert.equal(glyphValues[3], '1') // regulation: visible
  assert.equal(glyphValues[4], '1') // supplements: visible
  assert.equal(glyphValues[5], '1') // interventions: visible

  // No translate animation on the glyph (avoids scale collapse)
  assert.equal(tremUse.querySelector('animateTransform[type="translate"]'), null)

  // Two DT stroke polygons added – one per DT corresp line
  const dtStrokes = outSvg.querySelectorAll('g.bTrem[data-id="atTrem1"] > polygon.bw-trem-stroke')
  assert.equal(dtStrokes.length, 2, 'one polygon per DT stroke')

  dtStrokes.forEach(poly => {
    const strokeOpacity = poly.querySelector('animate[attributeName="opacity"]')
    assert.ok(strokeOpacity, 'DT stroke polygon must have opacity animation')
    const sv = strokeOpacity.getAttribute('values').split(';')
    assert.equal(sv.length, 6)
    assert.equal(sv[0], '1') // finding: visible
    assert.equal(sv[1], '1') // normalization: visible
    assert.equal(sv[2], '0') // readingOrder: hidden
    assert.equal(sv[3], '0') // regulation: hidden
    assert.equal(sv[4], '0') // supplements: hidden
    assert.equal(sv[5], '0') // interventions: hidden
  })
})

test('generateFluidTranscription aligns bTrem symbol with nested note animation', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="bTrem" data-id="atTremNested1">
          <use href="#E222" transform="translate(120,100) scale(0.72,0.72)"/>
          <g class="note" data-id="atNestedNote1">
            <g class="notehead"><use transform="translate(120,120)"/></g>
          </g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
      <g class="line bTrem" data-id="dtNestedLine1">
        <polygon points="260,90 300,60 300,70 260,100"/>
      </g>
      <g class="note" data-id="dtNestedNote1">
        <g class="notehead"><use x="180" y="130"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <bTrem xml:id="atTremNested1" corresp="#dtNestedLine1" dur="2" unitdur="32">
                        <note xml:id="atNestedNote1" corresp="#dtNestedNote1" pname="c" oct="4" dur="4"/>
                      </bTrem>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidTranscripts' })

  // Nested note still gets its own translate animation from liquifyNotes
  const noteAnim = outSvg.querySelector('g.note[data-id="atNestedNote1"] > animateTransform[type="translate"]')
  assert.ok(noteAnim, 'nested note must have translate animation')

  // AT glyph gets opacity animation (no translate), independent of note movement
  const tremUse = outSvg.querySelector('g.bTrem[data-id="atTremNested1"] > use')
  assert.ok(tremUse, 'AT glyph use element must exist')
  assert.equal(tremUse.querySelector('animateTransform[type="translate"]'), null, 'AT glyph must not have translate animation')

  const glyphOpacity = tremUse.querySelector('animate[attributeName="opacity"]')
  assert.ok(glyphOpacity, 'AT glyph must have opacity animation')
  const gv = glyphOpacity.getAttribute('values').split(';')
  assert.equal(gv.length, 6)
  assert.equal(gv[0], '0') // finding: hidden
  assert.equal(gv[1], '0') // normalization: hidden
  assert.equal(gv[2], '1') // readingOrder: visible
  assert.equal(gv[3], '1') // regulation: visible
  assert.equal(gv[4], '1') // supplements: visible
  assert.equal(gv[5], '1') // interventions: visible

  // One DT stroke polygon added for the single DT corresp line
  const dtStroke = outSvg.querySelector('g.bTrem[data-id="atTremNested1"] > polygon.bw-trem-stroke')
  assert.ok(dtStroke, 'DT stroke polygon must be added')
  const strokeOpacity = dtStroke.querySelector('animate[attributeName="opacity"]')
  assert.ok(strokeOpacity, 'DT stroke must have opacity animation')
  const sv = strokeOpacity.getAttribute('values').split(';')
  assert.equal(sv.length, 6)
  assert.equal(sv[0], '1') // finding: visible
  assert.equal(sv[1], '1') // normalization: visible
  assert.equal(sv[2], '0') // readingOrder: hidden
  assert.equal(sv[3], '0') // regulation: hidden
  assert.equal(sv[4], '0') // supplements: hidden
  assert.equal(sv[5], '0') // interventions: hidden
})

test('generateFluidTranscription animates fTrem tremolo symbol from DT line corresp', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="fTrem" data-id="atTremF1">
          <use href="#E220" transform="translate(140,120) scale(0.72,0.72)"/>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
      <g class="line fTrem" data-id="dtFLine1">
        <polygon points="220,120 260,90 260,100 220,130"/>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <fTrem xml:id="atTremF1" corresp="#dtFLine1"/>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidTranscripts' })

  // AT glyph: hidden in DT phases, visible in AT phases
  const tremUse = outSvg.querySelector('g.fTrem[data-id="atTremF1"] > use')
  assert.ok(tremUse, 'AT fTrem glyph use element must exist')
  assert.equal(tremUse.getAttribute('opacity'), '0', 'AT glyph starts hidden (DT phase)')

  const glyphOpacity = tremUse.querySelector('animate[attributeName="opacity"]')
  assert.ok(glyphOpacity, 'AT fTrem glyph must have opacity animation')
  const glyphValues = glyphOpacity.getAttribute('values').split(';')
  assert.equal(glyphValues.length, 6)
  assert.equal(glyphValues[0], '0') // finding: hidden
  assert.equal(glyphValues[1], '0') // normalization: hidden
  assert.equal(glyphValues[2], '1') // readingOrder: visible
  assert.equal(glyphValues[3], '1') // regulation: visible
  assert.equal(glyphValues[4], '1') // supplements: visible
  assert.equal(glyphValues[5], '1') // interventions: visible

  assert.equal(tremUse.querySelector('animateTransform[type="translate"]'), null)

  // One DT stroke polygon added
  const dtStroke = outSvg.querySelector('g.fTrem[data-id="atTremF1"] > polygon.bw-trem-stroke')
  assert.ok(dtStroke, 'DT stroke polygon must be added')
  const strokeOpacity = dtStroke.querySelector('animate[attributeName="opacity"]')
  assert.ok(strokeOpacity)
  const sv = strokeOpacity.getAttribute('values').split(';')
  assert.equal(sv.length, 6)
  assert.equal(sv[0], '1') // finding: visible
  assert.equal(sv[1], '1') // normalization: visible
  assert.equal(sv[2], '0') // readingOrder: hidden
  assert.equal(sv[3], '0') // regulation: hidden
  assert.equal(sv[4], '0') // supplements: hidden
  assert.equal(sv[5], '0') // interventions: hidden
})

test('generateFluidTranscription fluidSystems countermeasures inherited bTrem translate to avoid stacking', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="bTrem" data-id="atTremCounter1">
          <animateTransform attributeName="transform" attributeType="XML" type="translate" values="100 200;100 200;100 200;0 0;0 0;0 0" repeatCount="indefinite" dur="5s"/>
          <use href="#E222" transform="translate(120,100) scale(0.72,0.72)"/>
          <g class="note" data-id="atCounterNote1">
            <g class="notehead"><use transform="translate(120,120)"/></g>
          </g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
      <g class="line bTrem" data-id="dtCounterLine1">
        <polygon points="220,120 260,90 260,100 220,130"/>
      </g>
      <g class="note" data-id="dtCounterNote1">
        <g class="notehead"><use x="220" y="320"/></g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <bTrem xml:id="atTremCounter1" corresp="#dtCounterLine1" dur="2" unitdur="32">
                        <note xml:id="atCounterNote1" corresp="#dtCounterNote1" pname="c" oct="4" dur="4"/>
                      </bTrem>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

  // Nested note still gets its translate animation
  const noteAnim = outSvg.querySelector('g.note[data-id="atCounterNote1"] > animateTransform[type="translate"]')
  assert.ok(noteAnim)
  assert.equal(noteAnim.getAttribute('values'), '0 0;0 0;100 200;100 200;100 200;0 0;0 0;0 0')

  // The glyph use must NOT have a translate animation (opacity only – no stacking)
  const tremTranslate = outSvg.querySelector('g.bTrem[data-id="atTremCounter1"] > use > animateTransform[type="translate"]')
  assert.equal(tremTranslate, null, 'glyph must not inherit stacking translate animation')

  // The glyph must instead have opacity animation
  const tremUse = outSvg.querySelector('g.bTrem[data-id="atTremCounter1"] > use')
  const glyphOpacity = tremUse.querySelector('animate[attributeName="opacity"]')
  assert.ok(glyphOpacity, 'glyph must have opacity animation instead of translate')
})

test('generateFluidTranscription fluidSystems expands tremolo glyph use to inline strokes and animates points', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <defs>
        <g id="E222">
          <path transform="scale(1,-1)" d="M-163 -200l326 150v-100l-326 -150v100zM-163 150l326 150v-100l-326 -150v100zM-163 -25l326 150v-100l-326 -150v100z"/>
        </g>
      </defs>
      <g class="measure" data-id="m1">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
        <g class="bTrem" data-id="atInline1">
          <use href="#E222" transform="translate(120,100) scale(0.72,0.72)"/>
          <g class="chord" data-id="atInlineChord1" data-stem.dir="down"/>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
      <g class="line bTrem" data-id="dtInlineLine1">
        <polygon points="200,100 240,70 240,80 200,110"/>
      </g>
      <g class="line bTrem" data-id="dtInlineLine2">
        <polygon points="205,120 245,90 245,100 205,130"/>
      </g>
      <g class="line bTrem" data-id="dtInlineLine3">
        <polygon points="210,140 250,110 250,120 210,150"/>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1">
                  <staff n="1">
                    <layer>
                      <bTrem xml:id="atInline1" corresp="#dtInlineLine1 #dtInlineLine2 #dtInlineLine3" dur="2" unitdur="32">
                        <chord xml:id="atInlineChord1" dur="2" stem.dir="down">
                          <note xml:id="atInlineNote1" pname="c" oct="4"/>
                        </chord>
                      </bTrem>
                    </layer>
                  </staff>
                </measure>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

  const trem = outSvg.querySelector('g.bTrem[data-id="atInline1"]')
  assert.equal(trem.querySelector(':scope > use'), null, 'glyph use should be replaced when defs are available')

  const inlineStrokes = trem.querySelectorAll(':scope > polygon.bw-trem-inline')
  assert.equal(inlineStrokes.length, 3, 'expected three inline AT tremolo strokes from glyph path')

  inlineStrokes.forEach((poly, i) => {
    const animatePoints = poly.querySelector('animate[attributeName="points"]')
    assert.ok(animatePoints, `inline stroke ${i} should animate points`)
    const values = animatePoints.getAttribute('values').split(';')
    assert.equal(values.length, 8)
    assert.equal(values[0], values[1], 'digitalFacsimile and writingZone should share DT geometry')
    assert.equal(values[1], values[2], 'writingZone and finding should share DT geometry')
    assert.notEqual(values[2], values[3], 'DT and AT geometry should differ between finding and normalization')
    assert.equal(values[3], values[4], 'normalization and readingOrder should currently be identical')
    assert.notEqual(values[4], values[5], 'readingOrder and regulation should differ by position')
    assert.equal(values[5], values[6], 'regulation and supplements should share AT position and shape')
    assert.equal(values[6], values[7], 'supplements and interventions should share AT position and shape')
  })

  // Normalization/readingOrder keep one shared group offset relative to AT: same line spacing and x alignment.
  const parsedFrames = Array.from(inlineStrokes).map(poly => {
    const values = poly.querySelector('animate[attributeName="points"]').getAttribute('values').split(';')
    return {
      normalization: parsePoints(values[3]),
      readingOrder: parsePoints(values[4]),
      regulation: parsePoints(values[5])
    }
  })

  const normCenters = parsedFrames.map(frame => centerOf(frame.normalization))
  const readCenters = parsedFrames.map(frame => centerOf(frame.readingOrder))
  const regCenters = parsedFrames.map(frame => centerOf(frame.regulation))

  // All lines must have identical x at normalization, like AT glyph layout.
  const normXSpread = Math.max(...normCenters.map(c => c.x)) - Math.min(...normCenters.map(c => c.x))
  assert.ok(normXSpread < 0.0001, 'all normalization lines should share identical x center')

  // Vertical spacing should match AT layout across phases, i.e., rigid translation only.
  const normDy = normCenters[1].y - normCenters[0].y
  const readDy = readCenters[1].y - readCenters[0].y
  const regDy = regCenters[1].y - regCenters[0].y
  assert.ok(Math.abs(normDy - readDy) < 0.0001, 'normalization vertical spacing must match AT spacing')
  assert.ok(Math.abs(readDy - regDy) < 0.0001, 'regulation vertical spacing must match AT spacing')

  // The readingOrder->regulation shift must be identical for each line.
  const shifts = parsedFrames.map(frame => {
    const cRead = centerOf(frame.readingOrder)
    const cReg = centerOf(frame.regulation)
    return { dx: cReg.x - cRead.x, dy: cReg.y - cRead.y }
  })

  shifts.forEach((shift, i) => {
    assert.ok(Math.abs(shift.dx - shifts[0].dx) < 0.0001, `line ${i} should share readingOrder->regulation dx`)
    assert.ok(Math.abs(shift.dy - shifts[0].dy) < 0.0001, `line ${i} should share readingOrder->regulation dy`)
  })
})

test('generateFluidTranscription fluidSystems animates staffGrp braces visible from supplements only', () => {
  const atSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400">
      <g class="system" data-id="sys1">
        <g class="measure" data-id="m1">
          <g class="staff">
            <path d="M0 100 L300 100"/>
            <path d="M0 110 L300 110"/>
            <path d="M0 120 L300 120"/>
            <path d="M0 130 L300 130"/>
            <path d="M0 140 L300 140"/>
          </g>
        </g>
      </g>
      <path data-id="brace1" d="M20 90 C5 150 5 250 20 310"/>
      <g class="other"/>
      <path data-id="notBrace" d="M800 10 L900 10"/>
    </svg>
  `, 'image/svg+xml')

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400">
      <g class="rastrum bounding-box"><rect x="0" y="100" width="300" height="40"/></g>
      <g class="rastrum">
        <path d="M0 100 L300 100"/>
        <path d="M0 110 L300 110"/>
        <path d="M0 120 L300 120"/>
        <path d="M0 130 L300 130"/>
        <path d="M0 140 L300 140"/>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atMei = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <measure xml:id="m1"/>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

  const brace = outSvg.querySelector('path[data-id="brace1"]')
  assert.ok(brace)
  assert.equal(brace.getAttribute('opacity'), '0')

  const opacityAnim = brace.querySelector('animate[attributeName="opacity"]')
  assert.ok(opacityAnim, 'staffGrp brace should receive opacity animation')
  assert.equal(opacityAnim.getAttribute('values'), '0;0;0;0;0;0;1;1')

  const nonBrace = outSvg.querySelector('path[data-id="notBrace"]')
  assert.ok(nonBrace)
  assert.equal(nonBrace.querySelector('animate[attributeName="opacity"]'), null, 'non-selector path must stay untouched')
})

function parsePoints (pointsStr) {
  return pointsStr.trim().split(/\s+/).map(pair => {
    const [x, y] = pair.split(',').map(Number)
    return { x, y }
  })
}

function centerOf (points) {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}
