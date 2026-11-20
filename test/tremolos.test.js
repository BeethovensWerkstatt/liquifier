import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { regulateTremoloStrokes } from '../src/preparation/liquify/tremolos.js'

const parser = new (new JSDOM().window.DOMParser)()
const parseSvg = source => parser.parseFromString(source, 'image/svg+xml')

test('regulateTremoloStrokes moves the strokes to the strokes of the reg glyph instead of shifting the whole tremolo', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="bTrem" data-class="bTrem" data-id="trem-1">
        <polygon class="bw-trem-stroke bw-trem-inline" points="0,0 100,0 100,10 0,10"/>
        <polygon class="bw-trem-stroke bw-trem-inline" points="0,30 100,30 100,40 0,40"/>
        <g class="chord" data-class="chord" data-id="chord-1"><use href="#head" transform="translate(10, 20)"/></g>
      </g>
    </svg>`).documentElement
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <defs><symbol id="trem-glyph"><path d="M0 0 L100 0 L100 10 L0 10 Z M0 30 L100 30 L100 40 L0 40 Z"/></symbol></defs>
      <g class="bTrem" data-class="bTrem" data-id="trem-1">
        <use href="#trem-glyph" transform="translate(-30, 20)"/>
        <g class="chord" data-class="chord" data-id="chord-1"><use href="#head" transform="translate(10, 20)"/></g>
      </g>
    </svg>`)
  const calls = []

  regulateTremoloStrokes(ftSvg.querySelector('g.bTrem'), { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].states.supplements.val, '0,0 100,0 100,10 0,10')
  assert.equal(calls[0].states.interventions.val, '-30,20 70,20 70,30 -30,30')
  assert.equal(calls[1].states.interventions.val, '-30,50 70,50 70,60 -30,60')
  // neither the tremolo nor the chord inside it is shifted
  assert.equal(calls.some(call => call.states.interventions.type === 'translate'), false)
})

test('regulateTremoloStrokes adds a stroke that only exists in the reg rendering, but leaves DT-only strokes alone', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="bTrem" data-class="bTrem" data-id="trem-1">
        <polygon class="bw-trem-stroke bw-trem-inline" points="0,0 100,0 100,10 0,10"/>
        <polygon class="bw-trem-stroke bw-trem-inline bw-trem-dt-only" points="5,5 9,5 9,6 5,6"/>
      </g>
    </svg>`).documentElement
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <defs><symbol id="trem-glyph"><path d="M0 0 L100 0 L100 10 L0 10 Z M0 30 L100 30 L100 40 L0 40 Z"/></symbol></defs>
      <g class="bTrem" data-class="bTrem" data-id="trem-1"><use href="#trem-glyph" transform="translate(0, 0)"/></g>
    </svg>`)
  const calls = []

  regulateTremoloStrokes(ftSvg.querySelector('g.bTrem'), { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(ftSvg.querySelectorAll('.choice > .reg > polygon').length, 1)
  assert.equal(calls.some(call => call.element.getAttribute('points') === '5,5 9,5 9,6 5,6'), false)
})

test('regulateTremoloStrokes does nothing if the reg rendering has no stroke glyph', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="bTrem" data-class="bTrem" data-id="trem-1"><polygon class="bw-trem-stroke bw-trem-inline" points="0,0 1,0 1,1 0,1"/></g>
    </svg>`).documentElement
  const atRegSvgDom = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="bTrem" data-class="bTrem" data-id="trem-1"/></svg>')

  regulateTremoloStrokes(ftSvg.querySelector('g.bTrem'), { atRegSvgDom, setAnimation: () => assert.fail('no animation expected') })
})
