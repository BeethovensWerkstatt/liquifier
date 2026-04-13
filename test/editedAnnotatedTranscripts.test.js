import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { prepareEditedAtDom } from '../src/preparation/editedAnnotatedTranscripts.js'

const parser = new (new JSDOM().window.DOMParser)()

test('prepareEditedAtDom wraps elements without DT corresp in supplied', () => {
  const atXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <meiHead>
      <note xml:id="headNote"/>
    </meiHead>
    <music>
      <body>
        <mdiv>
          <score>
            <section>
              <measure xml:id="m1">
                <staff xml:id="s1">
                  <layer xml:id="l1">
                    <note xml:id="n1" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d1"/>
                    <note xml:id="n2"/>
                    <rest xml:id="r1" corresp="../annotatedTranscripts/SRC_p001_wz01_at.xml#a1"/>
                  </layer>
                </staff>
              </measure>
            </section>
          </score>
        </mdiv>
      </body>
    </music>
  </mei>`

  const atDom = parser.parseFromString(atXml, 'text/xml')
  const edited = prepareEditedAtDom(atDom)

  const supplieds = edited.querySelectorAll('supplied[resp="#bw"]')
  assert.equal(supplieds.length, 2)

  const n1 = edited.querySelector('*[xml\\:id="n1"]')
  assert.equal(n1.parentElement.localName, 'layer')

  const n2 = edited.querySelector('*[xml\\:id="n2"]')
  assert.equal(n2.parentElement.localName, 'supplied')

  const r1 = edited.querySelector('*[xml\\:id="r1"]')
  assert.equal(r1.parentElement.localName, 'supplied')

  const headNote = edited.querySelector('*[xml\\:id="headNote"]')
  assert.equal(headNote.parentElement.localName, 'meiHead')
})

test('prepareEditedAtDom updates MEI header metadata for editedAt output', () => {
  const atXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <meiHead>
      <fileDesc>
        <titleStmt>
          <title>Example source title</title>
        </titleStmt>
      </fileDesc>
      <encodingDesc>
        <appInfo>
          <application xml:id="some_existing_app" version="1.0">
            <name>Existing App</name>
          </application>
        </appInfo>
      </encodingDesc>
      <revisionDesc>
        <change n="2"/>
        <change n="7"/>
      </revisionDesc>
    </meiHead>
    <music>
      <body>
        <mdiv>
          <score>
            <section>
              <measure xml:id="m1">
                <staff xml:id="s1">
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

  const atDom = parser.parseFromString(atXml, 'text/xml')
  const edited = prepareEditedAtDom(atDom)

  const firstTitle = edited.querySelector('title')
  assert.match(firstTitle.textContent, /auto-generated Annotated Transcription with explicit editorial markup/)

  const app = edited.querySelector('appInfo > application[xml\\:id="bw_liquifier"]')
  assert.ok(app)
  assert.equal(app.querySelector('name').textContent, 'Liquifier')
  assert.equal(app.querySelector('ptr').getAttribute('target'), 'https://github.com/BeethovensWerkstatt/liquifier/')
  assert.ok((app.getAttribute('version') || '').length > 0)

  const changes = edited.querySelectorAll('revisionDesc > change')
  const lastChange = changes[changes.length - 1]
  assert.equal(lastChange.getAttribute('n'), '8')
  assert.equal(lastChange.getAttribute('resp'), '#bw')
  assert.match(lastChange.getAttribute('isodate'), /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(lastChange.querySelector('changeDesc > p > ptr').getAttribute('target'), '#bw_liquifier')
})

test('prepareEditedAtDom encodes pitch mismatches as choice/orig/reg', () => {
  const atXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <music>
      <body>
        <mdiv>
          <score>
            <scoreDef>
              <staffGrp>
                <staffDef n="1" clef.shape="G" clef.line="2"/>
              </staffGrp>
            </scoreDef>
            <section>
              <measure xml:id="m1">
                <staff n="1" xml:id="s1">
                  <layer xml:id="l1">
                    <note xml:id="a1" pname="e" oct="4" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d1"/>
                  </layer>
                </staff>
              </measure>
            </section>
          </score>
        </mdiv>
      </body>
    </music>
  </mei>`

  const dtXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <music>
      <body>
        <mdiv>
          <score>
            <scoreDef>
              <staffGrp>
                <staffDef n="1" clef.shape="G" clef.line="2"/>
              </staffGrp>
            </scoreDef>
            <section>
              <measure xml:id="m1">
                <staff n="1" xml:id="ds1">
                  <layer xml:id="dl1">
                    <note xml:id="d1" loc="-2"/>
                  </layer>
                </staff>
              </measure>
            </section>
          </score>
        </mdiv>
      </body>
    </music>
  </mei>`

  const atDom = parser.parseFromString(atXml, 'text/xml')
  const dtDom = parser.parseFromString(dtXml, 'text/xml')

  const edited = prepareEditedAtDom(atDom, dtDom)

  const choice = edited.querySelector('choice')
  assert.ok(choice)

  const origNote = edited.querySelector('choice > orig > note')
  const regNote = edited.querySelector('choice > reg[resp="#bw"] > note')

  assert.ok(origNote)
  assert.ok(regNote)
  assert.equal(regNote.getAttribute('xml:id'), 'a1')
  assert.equal(origNote.getAttribute('pname'), 'c')
  assert.equal(origNote.getAttribute('oct'), '4')
  assert.equal(origNote.hasAttribute('loc'), false)
})

test('prepareEditedAtDom uses last preceding AT clef when deriving AT loc', () => {
  const atXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <music>
      <body>
        <mdiv>
          <score>
            <scoreDef>
              <staffGrp>
                <staffDef n="1" clef.shape="G" clef.line="2"/>
              </staffGrp>
            </scoreDef>
            <section>
              <measure xml:id="m1">
                <staff n="1" xml:id="s1">
                  <layer xml:id="l1">
                    <clef xml:id="c1" shape="F" line="4"/>
                    <note xml:id="a1" pname="c" oct="4" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d1"/>
                    <clef xml:id="c2" shape="G" line="2"/>
                  </layer>
                </staff>
              </measure>
            </section>
          </score>
        </mdiv>
      </body>
    </music>
  </mei>`

  const dtXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <music>
      <body>
        <mdiv>
          <score>
            <section>
              <measure xml:id="m1">
                <staff n="1" xml:id="ds1">
                  <layer xml:id="dl1">
                    <note xml:id="d1" loc="10"/>
                  </layer>
                </staff>
              </measure>
            </section>
          </score>
        </mdiv>
      </body>
    </music>
  </mei>`

  const atDom = parser.parseFromString(atXml, 'text/xml')
  const dtDom = parser.parseFromString(dtXml, 'text/xml')

  const edited = prepareEditedAtDom(atDom, dtDom)
  const choice = edited.querySelector('choice')

  assert.equal(choice, null)
  const note = edited.querySelector('note[xml\\:id="a1"]')
  assert.ok(note)
  assert.equal(note.parentElement.localName, 'layer')
})

test('prepareEditedAtDom warns and uses first diplomatic corresp token', () => {
  const atXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <music>
      <body>
        <mdiv>
          <score>
            <scoreDef>
              <staffGrp>
                <staffDef n="1" clef.shape="G" clef.line="2"/>
              </staffGrp>
            </scoreDef>
            <section>
              <measure xml:id="m1">
                <staff n="1" xml:id="s1">
                  <layer xml:id="l1">
                    <note xml:id="a1" pname="e" oct="4" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d1 ../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d2"/>
                  </layer>
                </staff>
              </measure>
            </section>
          </score>
        </mdiv>
      </body>
    </music>
  </mei>`

  const dtXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <music>
      <body>
        <mdiv>
          <score>
            <scoreDef>
              <staffGrp>
                <staffDef n="1" clef.shape="G" clef.line="2"/>
              </staffGrp>
            </scoreDef>
            <section>
              <measure xml:id="m1">
                <staff n="1" xml:id="ds1">
                  <layer xml:id="dl1">
                    <note xml:id="d1" loc="-2"/>
                    <note xml:id="d2" loc="0"/>
                  </layer>
                </staff>
              </measure>
            </section>
          </score>
        </mdiv>
      </body>
    </music>
  </mei>`

  const atDom = parser.parseFromString(atXml, 'text/xml')
  const dtDom = parser.parseFromString(dtXml, 'text/xml')

  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => {
    warnings.push(args.join(' '))
  }

  try {
    const edited = prepareEditedAtDom(atDom, dtDom)
    const origNote = edited.querySelector('choice > orig > note')
    assert.equal(origNote.getAttribute('pname'), 'c')
    assert.equal(origNote.getAttribute('oct'), '4')
    assert.equal(origNote.hasAttribute('loc'), false)
    assert.ok(warnings.some(msg => msg.includes('Multiple DT correspondences found for note a1')))
  } finally {
    console.warn = originalWarn
  }
})
