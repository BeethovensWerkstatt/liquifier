import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { liquifyWords } from '../src/preparation/liquify/words.js'

const parser = new (new JSDOM().window.DOMParser)()

test('liquifyWords moves syllables to DT words and cross-fades differing text', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="note"><g class="syl" data-id="at-syllable"><text x="10" y="20" font-size="0px"><tspan class="text"><tspan font-size="405px">ner</tspan></tspan></text></g><animateTransform type="translate" values="0 0;0 0;10 20;10 20;10 20;0 0;0 0;0 0"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="word" data-id="dt-word"><text x="110" y="220" textLength="50px"><tspan><tspan font-size="360px">ne</tspan></tspan></text></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const animationCalls = []

  liquifyWords(ftSvg, dtSvg, null, {
    getNewPos: (atPosition, dtPosition) => ({ x: atPosition.x + (dtPosition.x / 2), y: atPosition.y + (dtPosition.y / 2) }),
    correspMappings: new Map([['at-syllable', ['dt-word']]]),
    setAnimation: descriptor => animationCalls.push(descriptor)
  })

  const syllable = ftSvg.querySelector('g.syl')
  const diplomaticRun = syllable.querySelector('text[data-text-role="diplomatic"]')
  const annotatedRun = syllable.querySelector('text[data-text-role="annotated"]')
  assert.equal(diplomaticRun.textContent, 'ne')
  assert.equal(diplomaticRun.getAttribute('textLength'), '25px')
  assert.equal(annotatedRun.textContent, 'ner')
  assert.equal(animationCalls[0].states.finding.val, '35 70')
  assert.equal(animationCalls[0].states.regulation.val, '0 0')
  assert.equal(animationCalls[1].states.finding.val, '1')
  assert.equal(animationCalls[1].states.regulation.val, '0')
  assert.equal(animationCalls[2].states.finding.val, '0')
  assert.equal(animationCalls[2].states.regulation.val, '1')
})

test('liquifyWords hides hyphen connectors during DT-facing phases and shows them with the AT reading', () => {
  const ftSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="note"><g class="syl" data-id="at-syllable"><text x="10" y="20" font-size="0px"><tspan class="text"><tspan font-size="405px">ner</tspan></tspan></text><rect x="30" y="20" height="22" width="98"/></g><animateTransform type="translate" values="0 0;0 0;10 20;10 20;10 20;0 0;0 0;0 0"/></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const dtSvg = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="word" data-id="dt-word"><text x="110" y="220" textLength="50px"><tspan><tspan font-size="360px">ne</tspan></tspan></text></g>
    </svg>
  `, 'image/svg+xml').documentElement
  const animationCalls = []

  liquifyWords(ftSvg, dtSvg, null, {
    getNewPos: (atPosition, dtPosition) => ({ x: atPosition.x + (dtPosition.x / 2), y: atPosition.y + (dtPosition.y / 2) }),
    correspMappings: new Map([['at-syllable', ['dt-word']]]),
    setAnimation: descriptor => animationCalls.push(descriptor)
  })

  const hyphenCall = animationCalls.find(call => call.element.localName === 'rect')
  assert.ok(hyphenCall, 'expected an animation descriptor for the hyphen rect')
  assert.equal(hyphenCall.states.finding.val, '0')
  assert.equal(hyphenCall.states.normalization.val, '0')
  assert.equal(hyphenCall.states.regulation.val, '1')
  assert.equal(hyphenCall.states.supplements.val, '1')
  assert.equal(hyphenCall.states.interventions.val, '1')
})
