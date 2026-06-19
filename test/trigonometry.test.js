import test from 'node:test'
import assert from 'node:assert/strict'

import { getOuterBoundingRect, getRectFromFragment } from '../src/utils/trigonometry.js'

test('getRectFromFragment keeps outer dimensions from xywh', () => {
  const rect = getRectFromFragment('#xywh=10,20,100,50&rotate=30')

  assert.equal(rect.outer.ul.x, 10)
  assert.equal(rect.outer.ul.y, 20)
  assert.equal(rect.outer.w, 100)
  assert.equal(rect.outer.h, 50)
})

test('getRectFromFragment computes smaller inner rectangle for non-zero rotation', () => {
  const outerRect = getOuterBoundingRect(10, 20, 100, 50, 30)
  const rect = getRectFromFragment(`#xywh=${outerRect.x},${outerRect.y},${outerRect.w},${outerRect.h}&rotate=30`)

  const dimensionsAreIdentical = Math.abs(rect.inner.w - rect.outer.w) < 1e-9 && Math.abs(rect.inner.h - rect.outer.h) < 1e-9

  assert.equal(dimensionsAreIdentical, false)

  const reconstructedOuter = getOuterBoundingRect(
    rect.center.x - rect.inner.w / 2,
    rect.center.y - rect.inner.h / 2,
    rect.inner.w,
    rect.inner.h,
    rect.rotate.deg
  )

  assert.equal(Math.abs(reconstructedOuter.w - rect.outer.w) < 1e-9, true)
  assert.equal(Math.abs(reconstructedOuter.h - rect.outer.h) < 1e-9, true)
})

test('getRectFromFragment keeps equal dimensions for zero rotation', () => {
  const rect = getRectFromFragment('#xywh=10,20,100,50&rotate=0')

  assert.equal(Math.abs(rect.inner.w - rect.outer.w) < 1e-9, true)
  assert.equal(Math.abs(rect.inner.h - rect.outer.h) < 1e-9, true)
})
