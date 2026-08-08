import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { liquifyRegulationLayout } from '../src/preparation/liquify/regulationLayout.js'

const parseSvg = source => new JSDOM(source, { contentType: 'image/svg+xml' }).window.document.documentElement

test('liquifyRegulationLayout applies the orig-to-reg position delta on a nested wrapper', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="rest" data-id="rest-1"><use transform="translate(100, 200)"/></g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="rest" data-id="rest-1"><use transform="translate(160, 220)"/></g>
    </svg>`).ownerDocument
  const calls = []

  liquifyRegulationLayout(ftSvg, null, null, {
    atRegSvgDom,
    setAnimation: descriptor => calls.push(descriptor)
  })

  const rest = ftSvg.querySelector('.rest')
  const wrapper = rest.querySelector('g[data-bw-regulation-layout="true"]')
  assert.ok(wrapper)
  assert.equal(wrapper.querySelector('use')?.getAttribute('transform'), 'translate(100, 200)')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].element, wrapper)
  assert.equal(calls[0].states.supplements.val, '0 0')
  assert.equal(calls[0].states.interventions.val, '60 20')
})

test('liquifyRegulationLayout leaves unchanged positions unwrapped', () => {
  const ftSvg = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="clef" data-id="clef-1"><use transform="translate(100, 200)"/></g></svg>')
  const atRegSvgDom = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="clef" data-id="clef-1"><use transform="translate(100, 200)"/></g></svg>').ownerDocument
  const calls = []

  liquifyRegulationLayout(ftSvg, null, null, { atRegSvgDom, setAnimation: descriptor => calls.push(descriptor) })

  assert.equal(ftSvg.querySelector('[data-bw-regulation-layout]'), null)
  assert.equal(calls.length, 0)
})

test('liquifyRegulationLayout matches an articulated regulation element by data ID', () => {
  const ftSvg = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="artic" data-id="artic-1"><use transform="translate(100, 200)"/></g>
    </svg>`)
  const atRegSvgDom = parseSvg(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g class="artic" data-id="artic-other"><use transform="translate(10, 20)"/></g>
      <g class="artic" data-id="artic-1"><use transform="translate(125, 240)"/></g>
    </svg>`).ownerDocument
  const calls = []

  liquifyRegulationLayout(ftSvg, null, null, {
    atRegSvgDom,
    setAnimation: descriptor => calls.push(descriptor)
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].states.interventions.val, '25 40')
})

