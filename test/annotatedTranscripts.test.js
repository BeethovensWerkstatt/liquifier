import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { addSbIndicators, addSystemLabelBlocks } from '../src/preparation/annotatedTranscripts.js'

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

test('addSystemLabelBlocks resolves writing-zone annot by xml:id robustly', () => {
  const svgDom = parser.parseFromString(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400">
      <g data-id="wz1" data-class="annot" class="annot"/>
      <g data-id="m1" data-class="measure" class="measure">
        <g class="staff">
          <path d="M0 100 L300 100"/>
          <path d="M0 110 L300 110"/>
          <path d="M0 120 L300 120"/>
          <path d="M0 130 L300 130"/>
          <path d="M0 140 L300 140"/>
        </g>
      </g>
    </svg>
  `, 'image/svg+xml')

  const atDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <annot xml:id="wz1" class="#bw_writingZoneBegin" corresp="../sources/foo.xml#wz04"/>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
    </mei>
  `, 'text/xml')

  const sourceDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <facsimile>
        <surface xml:id="surf1" label="11r"/>
      </facsimile>
      <notesStmt>
        <annot corresp="#surf1">
          <genDesc xml:id="wz04" label="04"/>
        </annot>
      </notesStmt>
    </mei>
  `, 'text/xml')

  const contextDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei">
      <meiHead>
        <fileDesc>
          <titleStmt>
            <title type="abbreviated">NK</title>
          </titleStmt>
        </fileDesc>
      </meiHead>
    </mei>
  `, 'text/xml')

  const outSvg = addSystemLabelBlocks(svgDom, atDom, sourceDom, contextDom, {
    dt: 'D-BNba_MH_60_Engelmann/diplomaticTranscripts/D-BNba_MH_60_Engelmann_p017_wz01_dt.xml'
  })

  const label = outSvg.querySelector('text.pageLabel')
  assert.ok(label)
  assert.equal(label.textContent, 'NK 11r / 04')
})
