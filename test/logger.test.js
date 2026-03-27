import test from 'node:test'
import assert from 'node:assert/strict'

import { createLogger } from '../src/core/logger.js'

test('createLogger respects quiet and verbose flags', () => {
  const calls = {
    log: 0,
    warn: 0,
    error: 0
  }

  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error

  console.log = () => { calls.log++ }
  console.warn = () => { calls.warn++ }
  console.error = () => { calls.error++ }

  try {
    const quietLogger = createLogger(true, true)
    quietLogger.info('info')
    quietLogger.debug('debug')
    quietLogger.warn('warn')
    quietLogger.error('error')

    assert.equal(calls.log, 0)
    assert.equal(calls.warn, 1)
    assert.equal(calls.error, 1)

    const normalLogger = createLogger(false, true)
    normalLogger.info('info')
    normalLogger.debug('debug')
    normalLogger.warn('warn')
    normalLogger.error('error')

    assert.equal(calls.log, 2)
    assert.equal(calls.warn, 2)
    assert.equal(calls.error, 2)
  } finally {
    console.log = originalLog
    console.warn = originalWarn
    console.error = originalError
  }
})
