import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { animateOtherWritingZones, animateUnmatchedAtBlocks, extractAnimatedTranscription } from '../src/rendering/renderers/ftAnimation.js'

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

test('animateOtherWritingZones keeps the DT-matched writing zone visible until supplements', () => {
  const document = new JSDOM(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="transcription">
      <g class="writingZone" data-id="before"><g class="systemBegin" data-id="first-system" data-system-id="first-system"/></g>
      <g class="writingZone" data-id="current"><g class="systemBegin" data-id="current-system" data-system-id="current-system"/></g>
      <g class="writingZone" data-id="after"><g class="systemBegin" data-id="later-system" data-system-id="later-system"/></g>
      <g class="bw-system-rastrum" data-id="first-system" data-system-id="first-system"/>
      <g class="bw-system-rastrum" data-id="current-system" data-system-id="current-system"/>
      <g class="bw-system-rastrum" data-id="later-system" data-system-id="later-system"/>
    </g></svg>
  `, { contentType: 'image/svg+xml' }).window.document
  const transcription = document.querySelector('.transcription')

  const atMeiDom = new JSDOM(`
    <mei xmlns="http://www.music-encoding.org/ns/mei"><music><body><mdiv><score><section>
      <sb xml:id="first-system"/><measure xml:id="m1"/>
      <sb xml:id="current-system"/><measure xml:id="m2"/>
      <sb xml:id="later-system"/><measure xml:id="m3"/>
    </section></score></mdiv></body></music></mei>
  `, { contentType: 'text/xml' }).window.document

  animateOtherWritingZones(transcription, atMeiDom, new Set([1]))

  const zones = transcription.querySelectorAll('g.writingZone')
  assert.equal(zones[0].getAttribute('opacity'), '0')
  assert.equal(zones[1].querySelector('animate[attributeName="opacity"]'), null)
  assert.equal(zones[2].querySelector('animate[attributeName="opacity"]').getAttribute('values'), '0;0;0;0;0;0;1;1')
  const rastrums = transcription.querySelectorAll('g.bw-system-rastrum')
  assert.equal(rastrums[0].getAttribute('opacity'), '0')
  assert.equal(rastrums[1].querySelector('animate[attributeName="opacity"]'), null)
  assert.equal(rastrums[2].querySelector('animate[attributeName="opacity"]').getAttribute('values'), '0;0;0;0;0;0;1;1')
})

test('animateUnmatchedAtBlocks hides the first and later AT pages for a second-page DT', () => {
  const document = new JSDOM(`
    <svg xmlns="http://www.w3.org/2000/svg"><g class="transcription">
      <g class="systemBegin"><g class="measure" data-id="m1"/></g>
      <g class="systemBegin"><g class="measure" data-id="m2"/></g>
      <g class="systemBegin"><g class="measure" data-id="m3"/></g>
    </g></svg>
  `, { contentType: 'image/svg+xml' }).window.document
  const atMeiDom = new JSDOM(`
    <mei xmlns="http://www.music-encoding.org/ns/mei"><music><body><mdiv><score><section>
      <pb/><sb/><measure xml:id="m1"/><pb/><sb/><measure xml:id="m2"/><pb/><sb/><measure xml:id="m3"/>
    </section></score></mdiv></body></music></mei>
  `, { contentType: 'text/xml' }).window.document

  animateUnmatchedAtBlocks(document.querySelector('.transcription'), atMeiDom, new Set([1]))

  const systems = document.querySelectorAll('g.systemBegin')
  assert.equal(systems[0].getAttribute('opacity'), '0')
  assert.equal(systems[1].getAttribute('opacity'), null)
  assert.equal(systems[2].getAttribute('opacity'), '0')
  assert.equal(systems[0].querySelector('animate[attributeName="opacity"]').getAttribute('values'), '0;0;0;0;0;0;1;1')
  assert.equal(systems[2].querySelector('animate[attributeName="opacity"]').getAttribute('values'), '0;0;0;0;0;0;1;1')
})
