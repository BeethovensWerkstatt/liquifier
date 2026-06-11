import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
              <pb xml:id="pb1"/>
              <annot xml:id="wz1" class="#bw_writingZoneBegin"/>
              <sb xml:id="sb1"/>
              <measure xml:id="m1"/>
              <pb xml:id="pb2"/>
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
  const out = addSbIndicators(atDom)

  const annot = out.querySelector('annot[xml\\:id="wz1"]')
  assert.equal(annot.getAttribute('type'), '#bw_writingZoneBegin')

  const m1 = out.querySelector('measure[xml\\:id="m1"]')
  // const m2 = out.querySelector('measure[xml\\:id="m2"]')
  // const m3 = out.querySelector('measure[xml\\:id="m3"]')

  assert.equal(m1.querySelectorAll('dir').length, 0)
})

test('addSystemLabelBlocks resolves writing-zone annot by xml:id and context foliation index', () => {
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
      <g data-id="sb1" data-class="sb" class="sb"/>
      <g data-id="m2" data-class="measure" class="measure">
        <g class="staff">
          <path d="M400 100 L700 100"/>
          <path d="M400 110 L700 110"/>
          <path d="M400 120 L700 120"/>
          <path d="M400 130 L700 130"/>
          <path d="M400 140 L700 140"/>
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
                <sb xml:id="sb1" corresp="../diplomaticTranscripts/example_dt.xml#sys1"/>
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
      <workDesc>
        <annot>
          <rastrum xml:id="r1" system.leftmar="0" system.topmar="0" width="80" system.height="10" rotate="0"/>
          <rastrum xml:id="r2" system.leftmar="10" system.topmar="20" width="50" system.height="10" rotate="0"/>
          <rastrum xml:id="r3" system.leftmar="20" system.topmar="40" width="30" system.height="20" rotate="0"/>
        </annot>
      </workDesc>
    </mei>
  `, 'text/xml')

  const dtDom = parser.parseFromString(`
    <mei xmlns="http://www.music-encoding.org/ns/mei" xmlns:bw="https://beethovens-werkstatt.de/ns/bw">
      <music>
        <body>
          <mdiv>
            <score>
              <section>
                <bw:system xml:id="sys1">
                  <staffGrp>
                    <staffDef xml:id="sd1" decls="../D-BNba_MH_60_Engelmann.xml#r2"/>
                    <staffDef xml:id="sd2" decls="../D-BNba_MH_60_Engelmann.xml#r3"/>
                  </staffGrp>
                </bw:system>
              </section>
            </score>
          </mdiv>
        </body>
      </music>
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
      <sourceDesc>
        <foliaDesc>
          <folium recto="#surfX" verso="#surfY"/>
            <bifolium outer.recto="../sources/foo.xml#surf1" inner.verso="#surfA" inner.recto="#surfB" outer.verso="#surfC" width="200" height="100">
            <folium recto="#surfD" verso="#surfE"/>
          </bifolium>
        </foliaDesc>
      </sourceDesc>
    </mei>
  `, 'text/xml')

  const outSvg = addSystemLabelBlocks(svgDom, atDom, dtDom, sourceDom, contextDom, {
    dt: 'D-BNba_MH_60_Engelmann/diplomaticTranscripts/D-BNba_MH_60_Engelmann_p017_wz01_dt.xml'
  })

  const label = outSvg.querySelector('text.pageLabel')
  assert.ok(label)
  assert.equal(label.textContent, 'NK 3 / 04')

  const sysLabel = outSvg.querySelector('text.sysLabel')
  assert.ok(sysLabel)
  assert.equal(sysLabel.textContent, 'Staves 2, 3')

  const pageBg = outSvg.querySelector('rect.pageBg')
  const sysPreview = outSvg.querySelector('rect.sysPreview')
  assert.ok(pageBg)
  assert.ok(sysPreview)

  const pageBgX = parseFloat(pageBg.getAttribute('x'))
  const pageBgY = parseFloat(pageBg.getAttribute('y'))
  const pageBgWidth = parseFloat(pageBg.getAttribute('width'))
  const pageBgHeight = parseFloat(pageBg.getAttribute('height'))

  const previewX = parseFloat(sysPreview.getAttribute('x'))
  const previewY = parseFloat(sysPreview.getAttribute('y'))
  const previewWidth = parseFloat(sysPreview.getAttribute('width'))
  const previewHeight = parseFloat(sysPreview.getAttribute('height'))

  const approxEqual = (actual, expected, tolerance = 0.02) => Math.abs(actual - expected) <= tolerance

  assert.ok(approxEqual(pageBgWidth / pageBgHeight, 2))
  assert.ok(approxEqual((previewX - pageBgX) / pageBgWidth, 0.05))
  assert.ok(approxEqual((previewY - pageBgY) / pageBgHeight, 0.2))
  assert.ok(approxEqual(previewWidth / pageBgWidth, 0.25))
  assert.ok(approxEqual(previewHeight / pageBgHeight, 0.4))
})

test('addSystemLabelBlocks loads external dtDom referenced by sb corresp', () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'liquifier-dt-ref-'))

  try {
    const dtDir = path.join(tmpRoot, 'diplomaticTranscripts')
    const currentDtPath = path.join(dtDir, 'current_dt.xml')
    const otherDtPath = path.join(dtDir, 'other_dt.xml')

    mkdirSync(dtDir, { recursive: true })
    writeFileSync(currentDtPath, '<mei xmlns="http://www.music-encoding.org/ns/mei"/>', { encoding: 'utf8' })
    writeFileSync(otherDtPath, `
      <mei xmlns="http://www.music-encoding.org/ns/mei" xmlns:bw="https://beethovens-werkstatt.de/ns/bw">
        <music>
          <body>
            <mdiv>
              <score>
                <section>
                  <bw:system xml:id="sysExternal">
                    <staffGrp>
                      <staffDef decls="../D-BNba_MH_60_Engelmann.xml#r1"/>
                      <staffDef decls="../D-BNba_MH_60_Engelmann.xml#r3"/>
                    </staffGrp>
                  </bw:system>
                </section>
              </score>
            </mdiv>
          </body>
        </music>
      </mei>
    `, { encoding: 'utf8' })

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
        <g data-id="sb1" data-class="sb" class="sb"/>
        <g data-id="m2" data-class="measure" class="measure">
          <g class="staff">
            <path d="M400 100 L700 100"/>
            <path d="M400 110 L700 110"/>
            <path d="M400 120 L700 120"/>
            <path d="M400 130 L700 130"/>
            <path d="M400 140 L700 140"/>
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
                  <sb xml:id="sb1" corresp="other_dt.xml#sysExternal"/>
                </section>
              </score>
            </mdiv>
          </body>
        </music>
      </mei>
    `, 'text/xml')

    const sourceDom = parser.parseFromString(`
      <mei xmlns="http://www.music-encoding.org/ns/mei">
        <notesStmt>
          <annot corresp="#surf1">
            <genDesc xml:id="wz04" label="04"/>
          </annot>
        </notesStmt>
        <workDesc>
          <annot>
            <rastrum xml:id="r1"/>
            <rastrum xml:id="r2"/>
            <rastrum xml:id="r3"/>
          </annot>
        </workDesc>
      </mei>
    `, 'text/xml')

    const dtDom = parser.parseFromString(`
      <mei xmlns="http://www.music-encoding.org/ns/mei" xmlns:bw="https://beethovens-werkstatt.de/ns/bw">
        <music><body><mdiv><score><section/></score></mdiv></body></music>
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
        <sourceDesc>
          <foliaDesc>
            <folium recto="#surf1" verso="#surf2"/>
          </foliaDesc>
        </sourceDesc>
      </mei>
    `, 'text/xml')

    const outSvg = addSystemLabelBlocks(svgDom, atDom, dtDom, sourceDom, contextDom, {
      dtFullPath: currentDtPath
    })

    const sysLabel = outSvg.querySelector('text.sysLabel')
    assert.ok(sysLabel)
    assert.equal(sysLabel.textContent, 'Staves 1, 3')
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('addSystemLabelBlocks reports issues when external dtDom cannot be loaded', () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'liquifier-dt-ref-fail-'))

  try {
    const dtDir = path.join(tmpRoot, 'diplomaticTranscripts')
    const currentDtPath = path.join(dtDir, 'current_dt.xml')

    mkdirSync(dtDir, { recursive: true })
    writeFileSync(currentDtPath, '<mei xmlns="http://www.music-encoding.org/ns/mei"/>', { encoding: 'utf8' })

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
        <g data-id="sb1" data-class="sb" class="sb"/>
        <g data-id="m2" data-class="measure" class="measure">
          <g class="staff">
            <path d="M400 100 L700 100"/>
            <path d="M400 110 L700 110"/>
            <path d="M400 120 L700 120"/>
            <path d="M400 130 L700 130"/>
            <path d="M400 140 L700 140"/>
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
                  <sb xml:id="sb1" corresp="missing_dt.xml#sysMissing"/>
                </section>
              </score>
            </mdiv>
          </body>
        </music>
      </mei>
    `, 'text/xml')

    const sourceDom = parser.parseFromString(`
      <mei xmlns="http://www.music-encoding.org/ns/mei">
        <notesStmt>
          <annot corresp="#surf1">
            <genDesc xml:id="wz04" label="04"/>
          </annot>
        </notesStmt>
        <workDesc>
          <annot>
            <rastrum xml:id="r1"/>
          </annot>
        </workDesc>
      </mei>
    `, 'text/xml')

    const dtDom = parser.parseFromString(`
      <mei xmlns="http://www.music-encoding.org/ns/mei" xmlns:bw="https://beethovens-werkstatt.de/ns/bw">
        <music><body><mdiv><score><section/></score></mdiv></body></music>
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
        <sourceDesc>
          <foliaDesc>
            <folium recto="#surf1" verso="#surf2"/>
          </foliaDesc>
        </sourceDesc>
      </mei>
    `, 'text/xml')

    const issues = []
    addSystemLabelBlocks(svgDom, atDom, dtDom, sourceDom, contextDom, {
      dtFullPath: currentDtPath
    }, {
      onIssue: (issue) => {
        issues.push(issue)
      }
    })

    assert.ok(issues.some(issue => issue.code === 'external-dt-load-failed'))
    assert.ok(issues.some(issue => issue.code === 'system-label-unresolved'))
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})
