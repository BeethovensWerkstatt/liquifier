import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'

import { renderAnnotatedTranscriptSvg } from '../src/rendering/renderers/at2svg.js'

const parser = new (new JSDOM().window.DOMParser)()

const atXml = `
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead/>
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef>
            <staffGrp>
              <staffDef n="1" xml:id="sd1"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure xml:id="m1">
              <staff xml:id="s1" n="1">
                <layer xml:id="l1">
                  <note xml:id="n1"/>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`

const renderedSvg = '<svg xmlns="http://www.w3.org/2000/svg"><g class="measure"><g class="staff"></g></g></svg>'

/**
 * Creates a mock Verovio toolkit instance that records calls made to it.
 *
 * @returns {Object} Mock Verovio instance with a `calls` array capturing invocations.
 */
const createMockVerovio = () => {
  const calls = []
  return {
    calls,
    resetOptions: () => calls.push({ method: 'resetOptions' }),
    setOptions: (options) => calls.push({ method: 'setOptions', options }),
    renderData: (domString) => {
      calls.push({ method: 'renderData', domString })
      return renderedSvg
    }
  }
}

test('renderAnnotatedTranscriptSvg renders the full AT from the edited AT using ./reg only', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'liquifier-test-'))
  const atSvgPath = path.join(tmpRoot, 'SRC_p001_wz01_at.svg')

  const atDom = parser.parseFromString(atXml, 'text/xml')
  const dtDom = parser.parseFromString('<mei xmlns="http://www.music-encoding.org/ns/mei"/>', 'text/xml')

  const verovio = createMockVerovio()
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} }

  await renderAnnotatedTranscriptSvg({
    data: { atDom, dtDom },
    triple: {
      atDate: new Date(),
      atSvgPath,
      atSvgDate: new Date(0)
    },
    verovio,
    pageDimensions: { width: 210, height: 297 },
    recreate: false,
    logger
  })

  // resetOptions must be called once, before setting the ./reg choice
  assert.equal(verovio.calls[0].method, 'resetOptions')

  const setOptionsCall = verovio.calls.find(call => call.method === 'setOptions')
  assert.equal(setOptionsCall.options.choiceXPathQuery, './reg')

  // no other choiceXPathQuery variant (e.g. ./orig) or per-system rendering happens
  assert.equal(verovio.calls.filter(call => call.method === 'setOptions').length, 1)
  assert.equal(verovio.calls.filter(call => call.method === 'renderData').length, 1)

  // the rendered AT is derived from the edited AT (note wrapped in <supplied> since it
  // has no DT corresp), not the plain AT
  const renderedDomString = verovio.calls.find(call => call.method === 'renderData').domString
  assert.ok(renderedDomString.includes('supplied'))

  // exactly one SVG file is written - no per-system AT files
  assert.equal(fs.readdirSync(tmpRoot).length, 1)
  assert.ok(fs.existsSync(atSvgPath))

  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('renderAnnotatedTranscriptSvg skips rendering when the AT SVG is up to date', async () => {
  const infoMessages = []
  const atDom = parser.parseFromString(atXml, 'text/xml')
  const dtDom = parser.parseFromString('<mei xmlns="http://www.music-encoding.org/ns/mei"/>', 'text/xml')

  const verovio = createMockVerovio()
  const logger = { info: (msg) => infoMessages.push(msg), debug: () => {}, warn: () => {}, error: () => {} }

  await renderAnnotatedTranscriptSvg({
    data: { atDom, dtDom },
    triple: {
      atDate: new Date(0),
      atSvgPath: '/tmp/does-not-matter_at.svg',
      atSvgDate: new Date()
    },
    verovio,
    pageDimensions: { width: 210, height: 297 },
    recreate: false,
    logger
  })

  assert.equal(verovio.calls.length, 0)
  assert.ok(infoMessages.some(msg => msg.includes('Skipping Annotated Transcript')))
})
