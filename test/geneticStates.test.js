import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { addGeneticInformation, getGeneticStates } from '../src/rendering/renderers/ft2svg.js'

const parser = new (new JSDOM().window.DOMParser)()

test('getGeneticStates returns all intermediate sequences across genetic branches', () => {
  const genDescWz = parser.parseFromString(`
    <genDesc>
      <genState xml:id="state-1" next="#state-2"/>
      <genState xml:id="state-2" next="#state-3"/>
      <genState xml:id="state-3" precedes="#state-4 #state-5"/>
      <genState xml:id="state-4" follows="#state-3"/>
      <genState xml:id="state-5" follows="#state-3"/>
    </genDesc>
  `, 'text/xml').documentElement

  assert.deepEqual(getGeneticStates(genDescWz), [
    ['state-1'],
    ['state-1', 'state-2'],
    ['state-1', 'state-2', 'state-3'],
    ['state-1', 'state-2', 'state-3', 'state-4'],
    ['state-1', 'state-2', 'state-3', 'state-5']
  ])
})

test('getGeneticStates resolves predecessor references and ignores cycles', () => {
  const genDescWz = parser.parseFromString(`
    <genDesc>
      <genState xml:id="state-1"/>
      <genState xml:id="state-2" prev="#state-1"/>
      <genState xml:id="state-3" follows="#state-2" next="#state-1"/>
    </genDesc>
  `, 'text/xml').documentElement

  assert.deepEqual(getGeneticStates(genDescWz), [
    ['state-1'],
    ['state-1', 'state-2']
  ])
})

test('getGeneticStates excludes the complete state set after parallel terminal branches', () => {
  const genDescWz = parser.parseFromString(`
    <genDesc>
      <genState xml:id="state-1" next="#state-2"/>
      <genState xml:id="state-2" precedes="#state-3 #state-4"/>
      <genState xml:id="state-3"/>
      <genState xml:id="state-4"/>
    </genDesc>
  `, 'text/xml').documentElement

  assert.deepEqual(getGeneticStates(genDescWz), [
    ['state-1'],
    ['state-1', 'state-2'],
    ['state-1', 'state-2', 'state-3'],
    ['state-1', 'state-2', 'state-4']
  ])
})

test('getGeneticStates deduplicates equivalent state sets reached in different orders', () => {
  const genDescWz = parser.parseFromString(`
    <genDesc>
      <genState xml:id="state-1" precedes="#state-2 #state-3"/>
      <genState xml:id="state-2" next="#state-3"/>
      <genState xml:id="state-3" next="#state-2"/>
    </genDesc>
  `, 'text/xml').documentElement

  assert.deepEqual(getGeneticStates(genDescWz), [
    ['state-1'],
    ['state-1', 'state-2'],
    ['state-1', 'state-3']
  ])
})

test('addGeneticInformation writes one replaceable metadata element for each file type', () => {
  const ftSvgDom = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><metadata class="geneticInformation">stale</metadata></svg>', 'image/svg+xml')
  const finalStateInformation = {
    fileType: 'finalState',
    precedingStates: [{ n: 1, activeStates: ['state-1'], fileName: 'example_ft/example_ft_v001.svg' }],
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
