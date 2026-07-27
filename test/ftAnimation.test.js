import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { extractAnimatedTranscription } from '../src/rendering/renderers/ftAnimation.js'

test('extractAnimatedTranscription removes shared layers and retains the animated transcription', () => {
  const ftSvgDom = new JSDOM(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="facsimileBg"/>
      <g class="shapes"/>
      <g class="diplomatic"/>
      <g class="transcription"><path id="animated-note"/></g>
    </svg>
  `, { contentType: 'image/svg+xml' }).window.document

  const companion = extractAnimatedTranscription(ftSvgDom)

  assert.equal(companion.querySelector('.facsimileBg'), null)
  assert.equal(companion.querySelector('.shapes'), null)
  assert.equal(companion.querySelector('.diplomatic'), null)
  assert.ok(companion.querySelector('.transcription #animated-note'))
  assert.ok(ftSvgDom.querySelector('.facsimileBg'))
})
