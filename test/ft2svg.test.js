import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { fluidTranscriptDefaultCss } from '../src/rendering/renderers/ft2svg.js'

test('fluid transcript CSS styles a supplied beam without styling its ordinary nested notes', () => {
  const document = new JSDOM(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="beam supplied">
        <polygon id="supplied-beam"/>
        <g class="note"><path id="beam-note"/></g>
      </g>
      <g class="note supplied"><path id="supplied-note"/></g>
    </svg>
  `, { contentType: 'image/svg+xml' }).window.document

  const matches = selector => Array.from(document.querySelectorAll(selector)).map(element => element.id)

  assert.match(fluidTranscriptDefaultCss, /\.beam\.supplied > polygon/)
  assert.match(fluidTranscriptDefaultCss, /\.supplied:not\(\.beam\):not\(\.beamSpan\) \*/)
  assert.deepEqual(matches('.beam.supplied > polygon'), ['supplied-beam'])
  assert.deepEqual(matches('.supplied:not(.beam):not(.beamSpan) *'), ['supplied-note'])
  assert.equal(matches('.supplied:not(.beam):not(.beamSpan) *').includes('beam-note'), false)
})
