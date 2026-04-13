import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { addSbIndicators } from '../src/preparation/annotatedTranscripts.js'

const parser = new (new JSDOM().window.DOMParser)()

test('addSbIndicators appends sb indicator dir elements to following measures', () => {
  const atXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <music>
      <body>
        <mdiv>
          <score>
            <section>
              <annot xml:id="wz1" class="#bw_writingZoneBegin"/>
              <sb xml:id="sb1"/>
              <measure xml:id="m1"/>
              <pb xml:id="pb1"/>
              <sb xml:id="sb2"/>
              <measure xml:id="m2"/>
              <sb xml:id="sb3"/>
              <measure xml:id="m3"/>
            </section>
          </score>
        </mdiv>
      </body>
    </music>
  </mei>`

  const atDom = parser.parseFromString(atXml, 'text/xml')
  const out = addSbIndicators(null, atDom)

  const annot = out.querySelector('annot[xml\\:id="wz1"]')
  assert.equal(annot.getAttribute('type'), '#bw_writingZoneBegin')

  const m1 = out.querySelector('measure[xml\\:id="m1"]')
  const m2 = out.querySelector('measure[xml\\:id="m2"]')
  const m3 = out.querySelector('measure[xml\\:id="m3"]')

  assert.equal(m1.querySelectorAll('dir').length, 0)

  const m2Dir = m2.querySelector('dir')
  assert.ok(m2Dir)
  assert.equal(m2Dir.getAttribute('type'), 'pb sb unselectable')
  assert.equal(m2Dir.getAttribute('xml:id'), 'dir_sb2')
  assert.equal(m2Dir.textContent, '⫪')

  const m3Dir = m3.querySelector('dir')
  assert.ok(m3Dir)
  assert.equal(m3Dir.getAttribute('type'), 'sb unselectable')
  assert.equal(m3Dir.getAttribute('xml:id'), 'dir_sb3')
  assert.equal(m3Dir.textContent, '⊤')
})
