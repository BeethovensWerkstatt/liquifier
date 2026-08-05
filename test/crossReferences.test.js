import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { addCrossReferences } from '../src/rendering/renderers/ft2svg.js'

const parser = new (new JSDOM().window.DOMParser)()

test('addCrossReferences joins DT elements to their facsimile shape paths', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="shapes"><path id="shape-1"/><path id="shape-2"/><path id="unreferenced"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtDom = parser.parseFromString(`
    <mei>
      <note xml:id="dt-1" facs="../shapes.svg#shape-1 ../shapes.svg#shape-2"/>
      <note xml:id="dt-2" facs="#shape-2"/>
      <note xml:id="dt-3" facs="#missing-shape"/>
    </mei>
  `, 'application/xml')

  addCrossReferences(ftSvg, dtDom)

  assert.equal(ftSvg.querySelector('#shape-1').getAttribute('data-ref-id'), 'dt-1')
  assert.equal(ftSvg.querySelector('#shape-2').getAttribute('data-ref-id'), 'dt-1 dt-2')
  assert.equal(ftSvg.querySelector('#unreferenced').hasAttribute('data-ref-id'), false)
})
