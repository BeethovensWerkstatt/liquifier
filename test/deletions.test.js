import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyDeletions } from '../src/preparation/liquify/deletions.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyDeletions maps active DT-only deletions and limits them to phases 3 and 4', () => {
  const document = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="shapes">
        <g class="writingLayer" id="active-layer"><path id="shape-active"/></g>
        <g class="writingLayer" id="inactive-layer"><path id="shape-inactive"/></g>
      </g>
      <g class="transcription"><g class="page-margin" transform="translate(10 20)"/></g>
    </svg>
  `, 'image/svg+xml')
  const ftSvg = document.querySelector('g.transcription')
  const dtSvg = parser.parseFromString(`
    <g xmlns="http://www.w3.org/2000/svg">
      <g class="deletions">
        <g class="del" data-id="deletion-active"><path class="deletionBack" d="M10,20 L30,20 L30,40 L10,40"/><path class="deletionLine" d="M10,20 L30,40"/></g>
        <g class="del" data-id="deletion-inactive"><path class="deletionBack" d="M50,60 L70,60 L70,80 L50,80"/></g>
      </g>
    </g>
  `, 'image/svg+xml').documentElement
  const sourceDtMeiDom = parser.parseFromString(`
    <mei>
      <del xml:id="deletion-active" facs="#shape-active"/>
      <del xml:id="deletion-inactive" facs="#shape-inactive"/>
    </mei>
  `, 'application/xml')
  const animationCalls = []

  liquifyDeletions(ftSvg, dtSvg, null, {
    getNewPos: (atPosition, dtPosition) => ({ x: dtPosition.x + 100, y: dtPosition.y + 200 }),
    setAnimation: descriptor => animationCalls.push(descriptor),
    sourceDtMeiDom,
    activeSvgLayers: ['active-layer']
  })

  const wrapper = ftSvg.querySelector('g.bw-deletion')
  assert.equal(ftSvg.querySelectorAll('g.bw-deletion').length, 1)
  assert.equal(wrapper.parentNode.getAttribute('class'), 'page-margin')
  assert.equal(wrapper.querySelector('g.del').getAttribute('data-id'), 'deletion-active')
  assert.equal(wrapper.querySelector('path.deletionBack').getAttribute('d'), 'M110 220 L130 220 L130 240 L110 240')
  assert.equal(animationCalls[0].referenceId, 'deletion-active')
  assert.deepEqual(animationCalls[0].states, {
    digitalFacsimile: { type: 'opacity', val: '0' },
    writingZone: { type: 'opacity', val: '0' },
    finding: { type: 'opacity', val: '1' },
    normalization: { type: 'opacity', val: '1' },
    readingOrder: { type: 'opacity', val: '0' },
    regulation: { type: 'opacity', val: '0' },
    supplements: { type: 'opacity', val: '0' },
    interventions: { type: 'opacity', val: '0' }
  })
})
