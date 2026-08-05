import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { prepareAssets } from '../src/utils/ft/animation.js'

const parser = new (new JSDOM().window.DOMParser)()

test('setAnimation links an exact DT match to its animation target and facsimile shape', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="facsimileBg"/><g class="shapes"><path id="shape-1"/></g><g class="diplomatic"/>
      <g class="transcription"><g class="page-margin" transform="translate(0 0)"/><path id="animated-barline"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const sourceDtMeiDom = parser.parseFromString('<mei><barLine xml:id="dt-barline" facs="../shapes.svg#shape-1"/></mei>', 'application/xml')
  const tools = prepareAssets({
    ftSvgDom: ftSvg,
    atLayer: ftSvg.querySelector('.transcription'),
    dtLayer: ftSvg.querySelector('.diplomatic'),
    atMeiDom: parser.parseFromString('<mei/>', 'application/xml'),
    atRegSvgDom: null,
    currentDtReference: '',
    atScaling: 1,
    atHorizontalPosition: 0,
    atVerticalShift: 0,
    layoutInfo: {},
    sourceDtMeiDom,
    logger: { debug: () => {} }
  })
  const barline = ftSvg.querySelector('#animated-barline')

  tools.setAnimation({
    element: barline,
    referenceId: 'dt-barline',
    states: { finding: { type: 'd', val: 'M0 0 L1 1' } }
  })

  assert.equal(barline.getAttribute('data-ref-id'), 'dt-barline')
  assert.equal(ftSvg.querySelector('#shape-1').getAttribute('data-ref-id'), 'dt-barline')
})

test('setAnimation infers exact references from animated chord and beam targets', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="facsimileBg"/><g class="shapes"><path id="shape-note"/><path id="shape-chord"/><path id="shape-beam"/></g><g class="diplomatic"/>
      <g class="transcription"><g class="page-margin" transform="translate(0 0)"/>
        <g class="measure" data-id="at-measure"><g class="beam" data-id="at-beam"><polygon id="animated-beam"/>
          <g class="chord" data-id="at-chord"><g class="stem"><path id="animated-stem"/></g>
            <g class="note" data-id="at-note"><g class="notehead" id="animated-notehead"/></g>
          </g>
        </g></g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement
  const sourceDtMeiDom = parser.parseFromString(`
    <mei>
      <note xml:id="dt-note" facs="#shape-note"/>
      <chord xml:id="dt-chord" facs="#shape-chord"/>
      <line xml:id="dt-beam" facs="#shape-beam"/>
    </mei>
  `, 'application/xml')
  const tools = prepareAssets({
    ftSvgDom: ftSvg,
    atLayer: ftSvg.querySelector('.transcription'),
    dtLayer: ftSvg.querySelector('.diplomatic'),
    atMeiDom: parser.parseFromString(`
      <mei>
        <measure xml:id="at-measure" corresp="#broad-measure-reference"/>
        <beam xml:id="at-beam" corresp="#dt-beam"/>
        <chord xml:id="at-chord" corresp="#dt-chord"/>
        <note xml:id="at-note" corresp="#dt-note"/>
      </mei>
    `, 'application/xml'),
    atRegSvgDom: null,
    currentDtReference: '',
    atScaling: 1,
    atHorizontalPosition: 0,
    atVerticalShift: 0,
    layoutInfo: {},
    sourceDtMeiDom,
    logger: { debug: () => {} }
  })

  tools.setAnimation({ element: ftSvg.querySelector('#animated-beam'), states: { finding: { type: 'points', val: '0,0 1,0 1,1 0,1' } } })
  tools.setAnimation({ element: ftSvg.querySelector('#animated-stem'), states: { finding: { type: 'd', val: 'M0 0 L1 1' } } })
  tools.setAnimation({ element: ftSvg.querySelector('#animated-notehead'), states: { finding: { type: 'translate', val: '1 1' } } })

  assert.equal(ftSvg.querySelector('#animated-beam').getAttribute('data-ref-id'), 'dt-beam')
  assert.equal(ftSvg.querySelector('#animated-stem').getAttribute('data-ref-id'), 'dt-chord')
  assert.equal(ftSvg.querySelector('#animated-notehead').getAttribute('data-ref-id'), 'dt-note')
  assert.equal(ftSvg.querySelector('#shape-beam').getAttribute('data-ref-id'), 'dt-beam')
  assert.equal(ftSvg.querySelector('#shape-chord').getAttribute('data-ref-id'), 'dt-chord')
  assert.equal(ftSvg.querySelector('#shape-note').getAttribute('data-ref-id'), 'dt-note')
})
