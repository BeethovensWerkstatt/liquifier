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
