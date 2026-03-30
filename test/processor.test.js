import test from 'node:test'
import assert from 'node:assert/strict'

import { processFiles } from '../src/core/processor.js'

test('processFiles returns early when no files are provided', async () => {
  const infoMessages = []
  const logger = {
    info: (msg) => infoMessages.push(msg),
    debug: () => {},
    warn: () => {},
    error: () => {}
  }

  await processFiles({
    fileNames: [],
    config: {
      types: ['at', 'dt', 'ft', 'editedAt'],
      media: ['svg', 'midi', 'html'],
      inputDir: './',
      outputDir: './cache',
      recreate: false,
      verbose: false
    },
    verovio: {},
    logger
  })

  assert.deepEqual(infoMessages, ['No files to process'])
})
