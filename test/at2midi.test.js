import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'

import { renderAnnotatedTranscriptMidi } from '../src/rendering/renderers/at2midi.js'

const parser = new (new JSDOM().window.DOMParser)()

const atXml = `
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead/>
  <music>
    <body>
      <mdiv>
        <score>
          <section>
            <measure xml:id="m1">
              <staff xml:id="s1">
                <layer xml:id="l1">
                  <note xml:id="n1" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d1"/>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`

/**
 * Creates a mock Verovio toolkit instance that records calls made to it.
 *
 * @returns {Object} Mock Verovio instance with a `calls` array capturing invocations.
 */
const createMockVerovio = () => {
  const calls = []
  let renderCount = 0
  return {
    calls,
    resetOptions: () => calls.push({ method: 'resetOptions' }),
    setOptions: (options) => calls.push({ method: 'setOptions', options }),
    loadData: (data) => calls.push({ method: 'loadData', data }),
    renderToMIDI: () => {
      renderCount++
      calls.push({ method: 'renderToMIDI' })
      return Buffer.from('midi-' + renderCount).toString('base64')
    }
  }
}

test('renderAnnotatedTranscriptMidi renders orig (Phase 7) and reg (Phase 8) MIDI from the edited AT', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))
  const atMidOrigPath = path.join(tmpRoot, 'out', 'annotatedMidi', 'p001', 'SRC_p001_wz01_at_orig.mid')
  const atMidRegPath = path.join(tmpRoot, 'out', 'annotatedMidi', 'p001', 'SRC_p001_wz01_at_reg.mid')

  const atDom = parser.parseFromString(atXml, 'text/xml')
  const dtDom = parser.parseFromString('<mei xmlns="http://www.music-encoding.org/ns/mei"/>', 'text/xml')

  const verovio = createMockVerovio()
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }

  await renderAnnotatedTranscriptMidi({
    data: { atDom, dtDom },
    triple: {
      atDate: new Date(),
      atMidOrigPath,
      atMidOrigDate: new Date(0),
      atMidRegPath,
      atMidRegDate: new Date(0)
    },
    verovio,
    pageDimensions: { width: 210, height: 297 },
    recreate: false,
    logger
  })

  // resetOptions must be called before each of the two renders, and choiceXPathQuery
  // must resolve to ./orig (Phase 7) then ./reg (Phase 8)
  const resetIndexes = verovio.calls
    .map((call, i) => (call.method === 'resetOptions' ? i : -1))
    .filter(i => i >= 0)
  assert.equal(resetIndexes.length, 2)

  const setOptionsCalls = verovio.calls.filter(call => call.method === 'setOptions')
  assert.deepEqual(setOptionsCalls.map(call => call.options.choiceXPathQuery), ['./orig', './reg'])

  // resetOptions for the second render must happen after the first render's setOptions call
  assert.ok(resetIndexes[1] > verovio.calls.indexOf(setOptionsCalls[0]))

  assert.equal(verovio.calls.filter(call => call.method === 'renderToMIDI').length, 2)

  assert.equal(fs.readFileSync(atMidOrigPath, 'utf8'), 'midi-1')
  assert.equal(fs.readFileSync(atMidRegPath, 'utf8'), 'midi-2')

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('renderAnnotatedTranscriptMidi resolves genetic add/del states before rendering', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))
  const atMidOrigPath = path.join(tmpRoot, 'out', 'annotatedMidi', 'p001', 'SRC_p001_wz01_at_orig.mid')
  const atMidRegPath = path.join(tmpRoot, 'out', 'annotatedMidi', 'p001', 'SRC_p001_wz01_at_reg.mid')

  const geneticAtXml = `
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead/>
  <music>
    <body>
      <mdiv>
        <score>
          <section>
            <annot class="#bw_writingZoneBegin" corresp="#wz1"/>
            <measure xml:id="m1">
              <staff xml:id="s1">
                <layer xml:id="l1">
                  <add state="#state-a"><note xml:id="n-added" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d1"/></add>
                  <del state="#state-a"><note xml:id="n-deleted" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d2"/></del>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`

  const sourceXml = `
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <genDesc xml:id="wz1">
    <genState xml:id="state-a" class="#geneticOrder_writingLayerLevel"/>
  </genDesc>
</mei>`

  const atDom = parser.parseFromString(geneticAtXml, 'text/xml')
  const dtDom = parser.parseFromString('<mei xmlns="http://www.music-encoding.org/ns/mei"/>', 'text/xml')
  const sourceDom = parser.parseFromString(sourceXml, 'text/xml')

  const verovio = createMockVerovio()
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }

  await renderAnnotatedTranscriptMidi({
    data: { atDom, dtDom, sourceDom },
    triple: {
      atDate: new Date(),
      atMidOrigPath,
      atMidOrigDate: new Date(0),
      atMidRegPath,
      atMidRegDate: new Date(0)
    },
    verovio,
    pageDimensions: { width: 210, height: 297 },
    recreate: false,
    logger
  })

  const loadedData = verovio.calls.filter(call => call.method === 'loadData').map(call => call.data)
  assert.equal(loadedData.length, 2)
  loadedData.forEach(data => {
    // the "add" state is active (it belongs to the writing zone's genetic states), so its
    // content must be unwrapped, while the "del" content must be removed entirely
    assert.ok(data.includes('n-added'))
    assert.ok(!data.includes('n-deleted'))
    assert.ok(!data.includes('<add'))
    assert.ok(!data.includes('<del'))
  })

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('renderAnnotatedTranscriptMidi skips rendering when neither MIDI variant is outdated', async () => {
  const infoMessages = []
  const atDom = parser.parseFromString(atXml, 'text/xml')
  const dtDom = parser.parseFromString('<mei xmlns="http://www.music-encoding.org/ns/mei"/>', 'text/xml')

  const verovio = createMockVerovio()
  const logger = { info: (msg) => infoMessages.push(msg), debug: () => {}, warn: () => {}, error: () => {} }

  await renderAnnotatedTranscriptMidi({
    data: { atDom, dtDom },
    triple: {
      atDate: new Date(0),
      atMidOrigPath: '/tmp/does-not-matter-orig.mid',
      atMidOrigDate: new Date(),
      atMidRegPath: '/tmp/does-not-matter-reg.mid',
      atMidRegDate: new Date()
    },
    verovio,
    pageDimensions: { width: 210, height: 297 },
    recreate: false,
    logger
  })

  assert.equal(verovio.calls.length, 0)
  assert.ok(infoMessages.some(msg => msg.includes('Skipping Annotated MIDI')))
})
