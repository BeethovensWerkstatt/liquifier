import test from 'node:test'
import assert from 'node:assert/strict'

import { parseCliArguments } from '../src/core/cli.js'

test('parseCliArguments uses defaults when no args are provided', () => {
  const prev = process.env.fileNames
  delete process.env.fileNames

  const parsed = parseCliArguments([])

  assert.equal(parsed.quiet, false)
  assert.equal(parsed.verbose, false)
  assert.deepEqual(parsed.types, ['at', 'dt', 'ft', 'editedAt'])
  assert.deepEqual(parsed.media, ['svg', 'midi', 'html'])
  assert.equal(parsed.inputDir, './')
  assert.equal(parsed.outputDir, './cache')
  assert.equal(parsed.recreate, false)
  assert.deepEqual(parsed.fileNames, [])

  if (prev === undefined) {
    delete process.env.fileNames
  } else {
    process.env.fileNames = prev
  }
})

test('parseCliArguments parses explicit options and positional file names', () => {
  const parsed = parseCliArguments([
    '--types=at,dt',
    '--media=svg,html',
    '--input-dir=/in',
    '--output-dir=/out',
    '--recreate',
    '-v',
    'sources/a.xml',
    'sources/b.xml'
  ])

  assert.equal(parsed.quiet, false)
  assert.equal(parsed.verbose, true)
  assert.deepEqual(parsed.types, ['at', 'dt'])
  assert.deepEqual(parsed.media, ['svg', 'html'])
  assert.equal(parsed.inputDir, '/in')
  assert.equal(parsed.outputDir, '/out')
  assert.equal(parsed.recreate, true)
  assert.deepEqual(parsed.fileNames, ['sources/a.xml', 'sources/b.xml'])
})

test('parseCliArguments lets quiet override verbose', () => {
  const parsed = parseCliArguments(['-q', '-v'])
  assert.equal(parsed.quiet, true)
  assert.equal(parsed.verbose, false)
})

test('parseCliArguments falls back to environment fileNames', () => {
  const prev = process.env.fileNames
  process.env.fileNames = 'x.xml,y.xml'

  const parsed = parseCliArguments([])
  assert.deepEqual(parsed.fileNames, ['x.xml', 'y.xml'])

  if (prev === undefined) {
    delete process.env.fileNames
  } else {
    process.env.fileNames = prev
  }
})

test('parseCliArguments supports short directory aliases', () => {
  const parsed = parseCliArguments(['-i', '/input-short', '-o', '/output-short'])
  assert.equal(parsed.inputDir, '/input-short')
  assert.equal(parsed.outputDir, '/output-short')
})

test('parseCliArguments normalizes legacy eat type to editedAt', () => {
  const parsed = parseCliArguments(['--types=at,eat'])
  assert.deepEqual(parsed.types, ['at', 'editedAt'])
})
