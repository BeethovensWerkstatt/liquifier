import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { resolveMatchedStaffLineContextForCurrentDt } from '../src/rendering/renderers.js'

const parser = new (new JSDOM().window.DOMParser)()

test('resolveMatchedStaffLineContextForCurrentDt returns strict block-to-system mapping from sb@corresp', () => {
  const atDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <pb corresp="../D-BNba_MH_60_Engelmann.xml#p001"/>
        <sb corresp="../diplomaticTranscripts/src_dt.xml#sBottom"/>
        <measure xml:id="m1"/>
        <sb corresp="../diplomaticTranscripts/src_dt.xml#sTop"/>
        <measure xml:id="m2"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const dtDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <pb target="../D-BNba_MH_60_Engelmann.xml#p001"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const warnings = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: msg => warnings.push(String(msg)),
    error: () => {}
  }

  const context = resolveMatchedStaffLineContextForCurrentDt(atDom, dtDom, logger)
  assert.equal(context.errorMessage, null)
  assert.ok(context.matchedStaffLineBlocks instanceof Set)
  assert.ok(context.blockToDtSystemId instanceof Map)
  assert.deepEqual(Array.from(context.matchedStaffLineBlocks).sort((a, b) => a - b), [0, 1])
  assert.equal(context.blockToDtSystemId.get(0), 'sBottom')
  assert.equal(context.blockToDtSystemId.get(1), 'sTop')
  assert.deepEqual(warnings, [])
})

test('resolveMatchedStaffLineContextForCurrentDt fails when matched block lacks sb system mapping', () => {
  const atDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <pb corresp="../D-BNba_MH_60_Engelmann.xml#p001"/>
        <sb corresp="../diplomaticTranscripts/src_dt.xml#sBottom"/>
        <measure xml:id="m1"/>
        <sb/>
        <measure xml:id="m2"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const dtDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music><body><mdiv><score><section>
        <pb target="../D-BNba_MH_60_Engelmann.xml#p001"/>
      </section></score></mdiv></body></music>
    </mei>
  `, 'text/xml')

  const warnings = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: msg => warnings.push(String(msg)),
    error: () => {}
  }

  const context = resolveMatchedStaffLineContextForCurrentDt(atDom, dtDom, logger)
  assert.equal(context.matchedStaffLineBlocks, null)
  assert.equal(context.blockToDtSystemId, null)
  assert.ok(context.errorMessage)
  assert.ok(context.errorMessage.includes('Missing AT sb@corresp DT system mapping'))
  assert.ok(warnings.some(msg => msg.includes('Missing AT sb@corresp DT system mapping')))
})
