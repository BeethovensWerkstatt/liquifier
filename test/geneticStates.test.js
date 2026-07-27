import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { getGeneticStates } from '../src/rendering/renderers/ft2svg.js'

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
    ['state-1', 'state-2', 'state-3', 'state-5'],
    ['state-1', 'state-2', 'state-3', 'state-4', 'state-5']
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
    ['state-1', 'state-2'],
    ['state-1', 'state-2', 'state-3']
  ])
})

test('getGeneticStates adds the complete state set after parallel terminal branches', () => {
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
    ['state-1', 'state-2', 'state-4'],
    ['state-1', 'state-2', 'state-3', 'state-4']
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
    ['state-1', 'state-2', 'state-3'],
    ['state-1', 'state-3']
  ])
})
