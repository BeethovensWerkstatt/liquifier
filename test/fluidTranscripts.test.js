import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { generateFluidTranscription, resolveFluidSystemsStates } from '../src/preparation/fluidTranscripts.js'

const parser = new (new JSDOM().window.DOMParser)()

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
    finding,
    normalization,
    readingOrder,
    regulation,
    supplements,
    interventions
  })
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
  assert.equal(opacityAnim.getAttribute('values'), '0;0;0;0;1;1')
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

  const transitionsAtSupplements = lines.map(line => {
    const dAnim = line.querySelector('animate[attributeName="d"]')
    assert.ok(dAnim)

    const values = dAnim.getAttribute('values').split(';')
    assert.equal(values.length, 6)
    assert.equal(values[0], values[1])
    assert.equal(values[1], values[2])
    assert.equal(values[3], values[4])
    assert.equal(values[4], values[5])
    return values[2] !== values[3]
  })

  assert.ok(transitionsAtSupplements.some(Boolean))
})

test('generateFluidTranscription fluidSystems builds separate AT target staff sets per AT block', () => {
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
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

  const rastrumLines = Array.from(outSvg.querySelectorAll('path.rastrum'))
  assert.equal(rastrumLines.length, 2)

  const atTargets = rastrumLines.map(line => {
    const vals = line.querySelector('animate[attributeName="d"]').getAttribute('values').split(';')
    return vals[4]
  })

  assert.deepEqual(atTargets.sort(), ['M10 100 L90 100', 'M110 100 L190 100'])
})

test('generateFluidTranscription fluidSystems keeps AT block rastrum order left-to-right', () => {
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
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

  const rastrumLines = Array.from(outSvg.querySelectorAll('path.rastrum'))
  assert.equal(rastrumLines.length, 2)

  const xStarts = rastrumLines.map(path => {
    const d = path.getAttribute('d')
    return Number(d.match(/^M([\d.-]+)/)[1])
  })

  assert.deepEqual(xStarts, [10, 110])
})

test('generateFluidTranscription fluidSystems clones AT staff lines to cover multiple DT systems', () => {
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
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

  const rastrumLines = outSvg.querySelectorAll('path.rastrum')
  assert.equal(rastrumLines.length, 4)
  const animatedLines = outSvg.querySelectorAll('path.rastrum animate[attributeName="d"]')
  assert.equal(animatedLines.length, 4)
})

test('generateFluidTranscription fluidSystems resolves DT lines from staff data-rastrum references', () => {
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
    stateModel: 'fluidSystems',
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

test('generateFluidTranscription fluidSystems honors explicit block-to-system mapping order', () => {
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
    stateModel: 'fluidSystems',
    matchedStaffLineBlocks: new Set([0, 1]),
    blockToDtSystemId: new Map([[0, 'sTop'], [1, 'sBottom']])
  })

  const outputReversed = generateFluidTranscription(dtSvg, atSvg, atMei, logger, {
    stateModel: 'fluidSystems',
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
  assert.equal(values.length, 6)
  assert.equal(values[3], '0 0')
  assert.equal(values[4], '0 0')
  assert.equal(values[5], '0 0')
})

test('generateFluidTranscription fluidSystems skips no-op note translate animation when all states are 0 0', () => {
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
  const outSvg = generateFluidTranscription(dtSvg, atSvg, atMei, logger, { stateModel: 'fluidSystems' })

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
  assert.equal(values.length, 6)
  assert.equal(values[3], '0 -20')
  assert.equal(values[4], '0 -20')
  assert.equal(values[5], '0 0')
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
    stateModel: 'fluidSystems',
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
    stateModel: 'fluidSystems',
    currentDtReference: '../data/sources/D-BNba_MH_60_Engelmann/diplomaticTranscripts/D-BNba_MH_60_Engelmann_p017_wz01_dt.xml'
  })

  const tempo = outSvg.querySelector('g.tempo[data-id="t1"]')
  const tempoClass = tempo.getAttribute('class') || ''
  assert.match(tempoClass, /\botherWz\b/)
  assert.ok(!/\bsupplied\b/.test(tempoClass))
})

test('generateFluidTranscription fluidSystems animates system labels from readingOrder onward', () => {
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
  assert.equal(opacityAnim.getAttribute('values'), '0;0;0;1;1;1')
  assert.equal(opacityAnim.getAttribute('keyTimes'), '0.00;0.20;0.58;0.60;0.80;1.00')
})
