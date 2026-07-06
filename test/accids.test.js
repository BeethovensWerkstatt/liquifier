import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyAccids } from '../src/preparation/liquify/accids.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyAccids compensates inherited note translation for AT x/y-positioned accidentals', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="note" data-id="note-1">
        <g class="accid" data-id="accid-1">
          <use href="#sym-accid" x="10" y="15"/>
        </g>
        <animateTransform
          attributeName="transform"
          attributeType="XML"
          type="translate"
          values="20 0;20 0;20 0;20 0;20 0;0 0;0 0;0 0"
          repeatCount="indefinite"
          dur="5s"
        />
      </g>
    </svg>
  `, 'image/svg+xml').documentElement

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="accid" data-id="dt-accid-1">
        <use href="#sym-accid" x="40" y="18"/>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement

  const animationCalls = []

  liquifyAccids(ftSvg, dtSvg, null, {
    getNewPos: (atPos, dtPos) => dtPos,
    correspMappings: new Map([['accid-1', ['dt-accid-1']]]),
    setAnimation: descriptor => animationCalls.push(descriptor),
    logger: { debug () {}, info () {}, warn () {}, error () {} },
    stateModel: 'fluidTranscript',
    getChoiceVerticalOffset: () => 0
  })

  assert.equal(animationCalls.length, 1)
  assert.equal(animationCalls[0].states.finding?.val, '10 3')
  assert.equal(animationCalls[0].states.normalization?.val, '10 3')
})

test('liquifyAccids reuses notehead animation for accidentals inside chord notes', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="chord" data-id="chord-1">
        <g class="note" data-id="note-1">
          <g class="notehead">
            <use href="#sym-note" x="100" y="200"/>
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="translate"
              values="-978 441;-978 441;-978 441;-978 441;-978 441;0 0;0 0;0 0"
              repeatCount="indefinite"
              dur="5s"
            />
          </g>
          <g class="accid" data-id="accid-1">
            <use href="#sym-accid" x="300" y="400"/>
          </g>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="accid" data-id="dt-accid-1">
        <use href="#sym-accid" x="-612" y="937"/>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement

  const animationCalls = []

  liquifyAccids(ftSvg, dtSvg, null, {
    getNewPos: (atPos, dtPos) => dtPos,
    correspMappings: new Map([['accid-1', ['dt-accid-1']]]),
    setAnimation: descriptor => animationCalls.push(descriptor),
    logger: { debug () {}, info () {}, warn () {}, error () {} },
    stateModel: 'fluidTranscript',
    getChoiceVerticalOffset: () => 0
  })

  assert.equal(animationCalls.length, 1)
  assert.equal(animationCalls[0].states.finding?.val, '66 96')
  assert.equal(animationCalls[0].states.normalization?.val, '66 96')
})

test('liquifyAccids derives parent note compensation from notehead geometry when no parent animation exists yet', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="note" data-id="note-1">
        <g class="notehead">
          <use href="#sym-note" transform="translate(2368, 2680) scale(0.656, 0.656)"/>
        </g>
        <g class="accid" data-id="accid-1">
          <use href="#sym-accid" transform="translate(2015, 2680) scale(0.656, 0.656)"/>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement

  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="note" data-id="dt-note-1">
        <g class="notehead">
          <use href="#sym-note" x="1390" y="3121"/>
        </g>
      </g>
      <g class="accid" data-id="dt-accid-1">
        <use href="#sym-accid" x="1103" y="3217"/>
      </g>
    </svg>
  `, 'image/svg+xml').documentElement

  const animationCalls = []

  liquifyAccids(ftSvg, dtSvg, null, {
    getNewPos: (atPos, dtPos) => dtPos,
    correspMappings: new Map([
      ['note-1', ['dt-note-1']],
      ['accid-1', ['dt-accid-1']]
    ]),
    setAnimation: descriptor => animationCalls.push(descriptor),
    logger: { debug () {}, info () {}, warn () {}, error () {} },
    stateModel: 'fluidTranscript',
    getChoiceVerticalOffset: () => 0
  })

  assert.equal(animationCalls.length, 1)
  assert.equal(animationCalls[0].states.finding?.val, '66 96')
  assert.equal(animationCalls[0].states.normalization?.val, '66 96')
})
