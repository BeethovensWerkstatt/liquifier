import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { addGeneticInformation, getGeneticStates, retrieveGeneticStateFromAt } from '../src/rendering/renderers/ft2svg.js'

const parser = new (new JSDOM().window.DOMParser)()

test('getGeneticStates follows text stages by next and uses follows as each stage state set', () => {
  const genDescWz = parser.parseFromString(`
    <genDesc>
      <genState xml:id="layer-1" class="#geneticOrder_writingLayerLevel" corresp="./svg/example.svg#svg-layer-1"/>
      <genState xml:id="text-1" class="#bw_textStufe" label="Text stage 1" follows="#layer-1" next="#text-2"/>
      <genState xml:id="layer-2" class="#geneticOrder_writingLayerLevel" corresp="./svg/example.svg#svg-layer-2"/>
      <genState xml:id="other-state" class="#geneticOrder_otherLevel" corresp="./svg/example.svg#ignored-layer"/>
      <genState xml:id="text-2" class="#bw_textStufe" label="Text stage 2" follows="#layer-1 #other-state #missing-state #layer-2" next="#text-final"/>
      <genState xml:id="text-final" class="#bw_textStufe #bw_finalGeneticState" label="Text stage 3" follows="#layer-1 #layer-2 #layer-3"/>
      <genState xml:id="layer-3" class="#geneticOrder_writingLayerLevel" corresp="./svg/example.svg#svg-layer-3"/>
    </genDesc>
  `, 'text/xml').documentElement

  assert.deepEqual(getGeneticStates(genDescWz), [
    { id: 'text-1', label: 'Text stage 1', activeStates: ['layer-1'], svgLayers: ['svg-layer-1'] },
    { id: 'text-2', label: 'Text stage 2', activeStates: ['layer-1', 'other-state', 'missing-state', 'layer-2'], svgLayers: ['svg-layer-1', 'svg-layer-2'] }
  ])
})

test('getGeneticStates uses document order for text stages without a next predecessor', () => {
  const genDescWz = parser.parseFromString(`
    <genDesc>
      <genState xml:id="layer-1" class="#geneticOrder_writingLayerLevel" corresp="#svg-layer-1"/>
      <genState xml:id="layer-2" class="#geneticOrder_writingLayerLevel" corresp="#svg-layer-2"/>
      <genState xml:id="text-1" class="#bw_textStufe" label="One" follows="#layer-1"/>
      <genState xml:id="text-2" class="#bw_textStufe" label="Two" follows="#layer-1 #layer-2"/>
    </genDesc>
  `, 'text/xml').documentElement

  assert.deepEqual(getGeneticStates(genDescWz), [
    { id: 'text-1', label: 'One', activeStates: ['layer-1'], svgLayers: ['svg-layer-1'] },
    { id: 'text-2', label: 'Two', activeStates: ['layer-1', 'layer-2'], svgLayers: ['svg-layer-1', 'svg-layer-2'] }
  ])
})

test('getGeneticStates follows text stages across continuation writing zones', () => {
  const firstWritingZone = parser.parseFromString(`
    <genDesc>
      <genState xml:id="layer-1" class="#geneticOrder_writingLayerLevel" corresp="#svg-layer-1"/>
      <genState xml:id="text-1" class="#bw_textStufe" label="First page" follows="#layer-1" next="#text-2"/>
    </genDesc>
  `, 'text/xml').documentElement
  const continuationWritingZone = parser.parseFromString(`
    <genDesc>
      <genState xml:id="layer-2" class="#geneticOrder_writingLayerLevel" corresp="#svg-layer-2"/>
      <genState xml:id="text-2" class="#bw_textStufe" label="Continuation" follows="#layer-1 #layer-2" next="#text-final"/>
      <genState xml:id="text-final" class="#bw_textStufe #bw_finalGeneticState" follows="#layer-1 #layer-2"/>
    </genDesc>
  `, 'text/xml').documentElement

  assert.deepEqual(getGeneticStates([firstWritingZone, continuationWritingZone]), [
    { id: 'text-1', label: 'First page', activeStates: ['layer-1'], svgLayers: ['svg-layer-1'] },
    { id: 'text-2', label: 'Continuation', activeStates: ['layer-1', 'layer-2'], svgLayers: ['svg-layer-1', 'svg-layer-2'] }
  ])
})

test('retrieveGeneticStateFromAt skips nested states detached with an active deletion', () => {
  const atDom = parser.parseFromString(`
    <mei>
      <del state="#continuation-state">
        <restore state="#restored-state"><note xml:id="restored-note"/></restore>
      </del>
    </mei>
  `, 'text/xml').documentElement

  const statedAt = retrieveGeneticStateFromAt(atDom, ['continuation-state'])

  assert.equal(statedAt.querySelector('del'), null)
  assert.equal(statedAt.querySelector('restore'), null)
})

test('addGeneticInformation writes one replaceable metadata element for each file type', () => {
  const ftSvgDom = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><metadata class="geneticInformation">stale</metadata></svg>', 'image/svg+xml')
  const finalStateInformation = {
    fileType: 'finalState',
    precedingStates: [{ n: 1, label: 'Text stage 1', activeStates: ['state-1'], svgLayers: ['svg-layer-1'], fileName: 'example_ft/example_ft_v001.svg' }],
    parentFile: null
  }

  addGeneticInformation(ftSvgDom, finalStateInformation)

  const metadata = ftSvgDom.querySelector('metadata.geneticInformation')
  assert.deepEqual(JSON.parse(metadata.textContent), finalStateInformation)
  assert.equal(ftSvgDom.querySelectorAll('metadata.geneticInformation').length, 1)

  const predecessorInformation = { fileType: 'precedingState', precedingStates: [], parentFile: '../example_ft.svg' }
  addGeneticInformation(ftSvgDom.documentElement, predecessorInformation)
  assert.deepEqual(JSON.parse(ftSvgDom.querySelector('metadata.geneticInformation').textContent), predecessorInformation)
})

test('addGeneticInformation explicitly represents a final state without predecessors', () => {
  const ftSvgDom = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml')
  const noPredecessorInformation = { fileType: 'finalState', precedingStates: [], parentFile: null }

  addGeneticInformation(ftSvgDom, noPredecessorInformation)

  assert.deepEqual(JSON.parse(ftSvgDom.querySelector('metadata.geneticInformation').textContent), noPredecessorInformation)
})
