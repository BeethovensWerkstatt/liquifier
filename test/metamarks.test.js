import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyMetamarks } from '../src/preparation/liquify/metamarks.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyMetamarks maps DT coordinates into the corresponding FT system and fades marks at regulation', () => {
  const ftSvg = parser.parseFromString(`
    <g xmlns="http://www.w3.org/2000/svg" class="transcription" transform="translate(100 200) scale(2)">
      <g class="page-margin" transform="translate(10 20)">
        <g class="writingZone">
          <g class="systemBegin" data-system-id="at-system"><g class="bw-system-content"><text x="0" y="0">source system</text></g><animateTransform type="translate" values="0 0;0 0;0 0;0 0;120 40;0 0;0 0;0 0"/></g>
          <g class="systemBegin" data-system-id="target-system">
            <animateTransform type="translate" values="0 0;0 0;0 0;0 0;240 80;0 0;0 0;0 0"/>
            <g class="bw-system-content"><text x="0" y="10">target system</text></g>
          </g>
        </g>
      </g>
    </g>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <g xmlns="http://www.w3.org/2000/svg" transform="translate(50 60) scale(4)">
      <g class="system" data-id="dt-system">
        <g class="clarification" data-id="clarification-1"><text x="20" y="30">clarify</text></g>
        <g class="metaMark navigation" data-id="navigation-1"><text x="40" y="50">navigate</text></g>
      </g>
      <g class="system" data-id="target-dt-system"/>
    </g>
  `, 'image/svg+xml').documentElement
  const atMeiDom = parser.parseFromString('<mei><music><body><sb xml:id="at-system" corresp="#dt-system"/><sb xml:id="target-system" corresp="#target-dt-system"/></body></music></mei>', 'application/xml')
  const animationCalls = []

  liquifyMetamarks(ftSvg, dtSvg, atMeiDom, {
    getNewPos: (atPosition, dtPosition) => ({
      x: atPosition.x + dtPosition.x + 100,
      y: atPosition.y + dtPosition.y + 200
    }),
    setAnimation: descriptor => animationCalls.push(descriptor)
  })

  const writingZone = ftSvg.querySelector('g.writingZone')
  const wrappers = writingZone.querySelectorAll('g.bw-metamark')
  const systemAnimation = Array.from(wrappers[0].parentNode.childNodes).find(element => element.localName === 'animateTransform')
  assert.equal(wrappers.length, 2)
  assert.ok(Array.from(wrappers).every(wrapper => wrapper.parentNode.getAttribute('class') === 'systemBegin'))
  assert.equal(systemAnimation.getAttribute('values'), '0 0;0 0;0 0;0 0;120 40;0 0;0 0;0 0')
  assert.equal(ftSvg.querySelectorAll(':scope > g.bw-metamark').length, 0)
  assert.equal(wrappers[0].hasAttribute('transform'), false)
  assert.equal(wrappers[0].querySelector('text').getAttribute('x'), '120')
  assert.equal(wrappers[0].querySelector('text').getAttribute('y'), '230')
  assert.equal(wrappers[1].querySelector('g.metaMark').getAttribute('data-id'), 'navigation-1')
  assert.equal(wrappers[1].querySelector('text').getAttribute('x'), '140')
  assert.equal(wrappers[1].querySelector('text').getAttribute('y'), '250')
  assert.equal(wrappers[0].querySelector('animateTransform').getAttribute('values'), '0 0;0 0;0 0;0 0;0 0;120 40;0 0;0 0')
  assert.deepEqual(animationCalls[0].states, {
    digitalFacsimile: { type: 'opacity', val: '1' },
    writingZone: { type: 'opacity', val: '1' },
    finding: { type: 'opacity', val: '1' },
    normalization: { type: 'opacity', val: '1' },
    readingOrder: { type: 'opacity', val: '1' },
    regulation: { type: 'opacity', val: '0' },
    supplements: { type: 'opacity', val: '0' },
    interventions: { type: 'opacity', val: '0' }
  })
  assert.equal(animationCalls.length, 2)
})
