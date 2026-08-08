import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { animateOtherWritingZones, extractAnimatedTranscription } from '../src/rendering/renderers/ftAnimation.js'

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

test('animateOtherWritingZones reveals only later writing zones at supplements', () => {
  const document = new JSDOM(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="transcription">
      <g class="writingZone" data-id="current"><g class="systemBegin" data-id="current-system"/></g>
      <g class="writingZone" data-id="later-1"><g class="systemBegin" data-id="later-system-1"/></g>
      <g class="writingZone" data-id="later-2"><g class="systemBegin" data-id="later-system-2"/></g>
      <g class="bw-system-rastrum" data-system-id="current-system"/>
      <g class="bw-system-rastrum" data-system-id="later-system-1"/>
      <g class="bw-system-rastrum" data-system-id="later-system-2"/>
    </g></svg>
  `, { contentType: 'image/svg+xml' }).window.document
  const transcription = document.querySelector('.transcription')

  animateOtherWritingZones(transcription)

  const zones = transcription.querySelectorAll('g.writingZone')
  assert.equal(zones[0].querySelector('animate[attributeName="opacity"]'), null)
  assert.equal(zones[1].getAttribute('opacity'), '0')
  assert.equal(zones[1].querySelector('animate[attributeName="opacity"]').getAttribute('values'), '0;0;0;0;0;0;1;1')
  assert.equal(zones[2].querySelector('animate[attributeName="opacity"]').getAttribute('values'), '0;0;0;0;0;0;1;1')
  const rastrums = transcription.querySelectorAll('g.bw-system-rastrum')
  assert.equal(rastrums[0].querySelector('animate[attributeName="opacity"]'), null)
  assert.equal(rastrums[1].getAttribute('opacity'), '0')
  assert.equal(rastrums[1].querySelector('animate[attributeName="opacity"]').getAttribute('values'), '0;0;0;0;0;0;1;1')
  assert.equal(rastrums[2].querySelector('animate[attributeName="opacity"]').getAttribute('values'), '0;0;0;0;0;0;1;1')
})
