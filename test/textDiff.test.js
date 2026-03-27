import test from 'node:test'
import assert from 'node:assert/strict'

import { computeTextDiff, computeWordDiff } from '../src/utils/textDiff.js'

test('computeTextDiff returns one common segment for identical strings', () => {
  const res = computeTextDiff('abc', 'abc')
  assert.deepEqual(res, [{ text: 'abc', type: 'common' }])
})

test('computeTextDiff detects insertions and deletions', () => {
  const res = computeTextDiff('dimin:', 'dim.')

  assert.equal(res.some(seg => seg.type === 'common' && seg.text.includes('dim')), true)
  assert.equal(res.some(seg => seg.type === 'delete'), true)
  assert.equal(res.some(seg => seg.type === 'insert'), true)
})

test('computeTextDiff handles empty source and target', () => {
  assert.deepEqual(computeTextDiff('', ''), [])
  assert.deepEqual(computeTextDiff('', 'abc'), [{ text: 'abc', type: 'insert' }])
  assert.deepEqual(computeTextDiff('abc', ''), [{ text: 'abc', type: 'delete' }])
})

test('computeWordDiff currently delegates to computeTextDiff', () => {
  const source = 'dolce espressivo'
  const target = 'dolce molto espressivo'
  assert.deepEqual(computeWordDiff(source, target), computeTextDiff(source, target))
})
