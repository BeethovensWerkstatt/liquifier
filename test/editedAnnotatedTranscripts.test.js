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

test('prepareEditedAtDom combines pitch and rhythm mismatches in one choice', () => {
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
                    <note xml:id="a1" pname="e" oct="4" dur="4" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d1"/>
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
  <mei xmlns="http://www.music-encoding.org/ns/mei" xmlns:bw="http://example.org/bw">
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
                    <note xml:id="d1" loc="-2" head.shape="quarter" bw:stem.flags="1"/>
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
  assert.equal(origNote.getAttribute('dur'), '8')
  assert.equal(regNote.getAttribute('dur'), '4')
  assert.equal(origNote.hasAttribute('loc'), false)
})

const DT_NS = 'xmlns="http://www.music-encoding.org/ns/mei" xmlns:bw="http://example.org/bw"'
const AT_NS = 'xmlns="http://www.music-encoding.org/ns/mei"'
const DT_REF = '../diplomaticTranscripts/SRC_p001_wz01_dt.xml'

const editWith = (atBody, dtBody) => prepareEditedAtDom(
  parser.parseFromString(`<mei ${AT_NS}><music><body><mdiv><score>
    <scoreDef><staffGrp><staffDef n="1" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
    <section><measure><staff n="1"><layer>${atBody}</layer></staff></measure></section>
  </score></mdiv></body></music></mei>`, 'text/xml'),
  parser.parseFromString(`<mei ${DT_NS}><music><body><mdiv><score><section><measure><staff n="1"><layer>
    ${dtBody}
  </layer></staff></measure></section></score></mdiv></body></music></mei>`, 'text/xml')
)

test('prepareEditedAtDom derives DT duration from head shape and stem flags', () => {
  const edited = editWith(
    `<note xml:id="a1" pname="g" oct="4" dur="4" corresp="${DT_REF}#d1"/>
     <note xml:id="a2" pname="g" oct="4" dur="8" corresp="${DT_REF}#d2"/>
     <note xml:id="a3" pname="g" oct="4" dur="2" corresp="${DT_REF}#d3"/>
     <note xml:id="a4" pname="g" oct="4" dur="4" corresp="${DT_REF}#d4"/>`,
    `<note xml:id="d1" loc="2" head.shape="quarter" bw:stem.flags="2"/>
     <note xml:id="d2" loc="2" head.shape="quarter" bw:stem.flags="1"/>
     <note xml:id="d3" loc="2" head.shape="half"/>
     <note xml:id="d4" loc="2" head.shape="quarter" bw:stem.flags="0"/>`
  )
  const choices = Array.from(edited.querySelectorAll('choice'))

  // only the first note differs (DT: 16th, AT: quarter); the others match
  assert.equal(choices.length, 1)
  assert.equal(choices[0].querySelector('orig > note').getAttribute('dur'), '16')
  assert.equal(choices[0].querySelector('reg > note').getAttribute('dur'), '4')
  assert.equal(choices[0].querySelector('reg > note').getAttribute('xml:id'), 'a1')
  assert.equal(choices[0].querySelector('orig > note').getAttribute('xml:id'), 'oa1')
})

test('prepareEditedAtDom keeps AT duration in a pitch choice when it matches the DT', () => {
  const edited = editWith(
    `<note xml:id="a1" pname="g" oct="4" dur="8" corresp="${DT_REF}#d1"/>`,
    '<note xml:id="d1" loc="0" head.shape="quarter" bw:stem.flags="1"/>'
  )

  assert.equal(edited.querySelector('choice > orig > note').getAttribute('pname'), 'e')
  assert.equal(edited.querySelector('choice > orig > note').getAttribute('dur'), '8')
  assert.equal(edited.querySelector('choice > reg > note').getAttribute('dur'), '8')
})

test('prepareEditedAtDom derives DT duration from the beam lines of enclosing beams', () => {
  const edited = editWith(
    `<beam xml:id="ab1" corresp="${DT_REF}#dl1 ${DT_REF}#dl2">
       <note xml:id="a1" pname="g" oct="4" dur="16" corresp="${DT_REF}#d1"/>
       <note xml:id="a2" pname="g" oct="4" dur="16" corresp="${DT_REF}#d2"/>
       <note xml:id="a3" pname="g" oct="4" dur="16" corresp="${DT_REF}#d3"/>
     </beam>`,
    `<note xml:id="d1" x="10" loc="2" head.shape="quarter" bw:stem.flags="0"/>
     <note xml:id="d2" x="14" loc="2" head.shape="quarter" bw:stem.flags="0"/>
     <note xml:id="d3" x="40" loc="2" head.shape="quarter" bw:stem.flags="0"/>
     <line xml:id="dl1" func="beam" x="10" x2="42" y="0" y2="0"/>
     <line xml:id="dl2" func="beam" x="10" x2="16" y="2" y2="2"/>`
  )

  // the third note is only reached by the long beam, so the DT shows an 8th
  const choice = edited.querySelector('choice')
  assert.equal(edited.querySelectorAll('choice').length, 1)
  assert.equal(choice.querySelector('orig > note').getAttribute('dur'), '8')
  assert.equal(choice.querySelector('reg > note').getAttribute('xml:id'), 'a3')
})

test('prepareEditedAtDom treats AT dots without DT dot correspondence as editorial', () => {
  const edited = editWith(
    `<note xml:id="a1" pname="e" oct="4" dur="4" corresp="${DT_REF}#d1">
       <dot xml:id="ad1" corresp="${DT_REF}#dd1"/>
     </note>
     <note xml:id="a2" pname="e" oct="4" dur="4" corresp="${DT_REF}#d2">
       <dot xml:id="ad2" corresp="${DT_REF}#dd2"/>
       <dot xml:id="ad3"/>
     </note>`,
    `<note xml:id="d1" loc="0" head.shape="quarter"/>
     <dot xml:id="dd1" loc="-1"/>
     <note xml:id="d2" loc="0" head.shape="quarter"/>
     <dot xml:id="dd2" loc="-1"/>`
  )
  const choices = Array.from(edited.querySelectorAll('choice'))

  assert.equal(choices.length, 1)
  assert.equal(choices[0].querySelectorAll('reg > note dot').length, 2)
  assert.equal(choices[0].querySelectorAll('orig > note > dot').length, 1)
  assert.equal(choices[0].querySelector('orig > note > dot').getAttribute('corresp'), `${DT_REF}#dd2`)
  assert.equal(choices[0].querySelector('orig > note').hasAttribute('dots'), false)
})

test('prepareEditedAtDom derives DT rhythm for chords and rests', () => {
  const edited = editWith(
    `<chord xml:id="ac1" dur="4" corresp="${DT_REF}#dc1">
       <note xml:id="an1" pname="c" oct="4"/><note xml:id="an2" pname="e" oct="4"/>
     </chord>
     <rest xml:id="ar1" dur="4" corresp="${DT_REF}#dr1"/>
     <rest xml:id="ar2" dur="8" corresp="${DT_REF}#dr2"/>
     <mRest xml:id="amr1" dur="1" corresp="${DT_REF}#dmr1"/>`,
    `<chord xml:id="dc1" x="5"><note xml:id="dn1" loc="1" head.shape="half"/><note xml:id="dn2" loc="3" head.shape="half"/></chord>
     <rest xml:id="dr1" loc="5" glyph.name="rest8th"/>
     <rest xml:id="dr2" loc="5" glyph.name="rest8th"/>
     <rest xml:id="dmr1" loc="5" glyph.name="restWhole"/>`
  )

  const origChord = edited.querySelector('choice > orig > chord')
  const regChord = edited.querySelector('choice > reg > chord')
  const origRest = edited.querySelector('choice > orig > rest')

  // chord and the quarter rest differ; the matching 8th rest and the whole-measure rest do not
  assert.equal(edited.querySelectorAll('choice').length, 2)
  assert.equal(origChord.getAttribute('dur'), '2')
  assert.equal(regChord.getAttribute('dur'), '4')
  assert.notEqual(origChord.querySelector('note').getAttribute('xml:id'), regChord.querySelector('note').getAttribute('xml:id'))
  assert.equal(origRest.getAttribute('dur'), '8')
  assert.equal(edited.querySelector('choice > reg > rest').getAttribute('dur'), '4')
})

test('prepareEditedAtDom derives an orig pitch from a cross-staff note assignment', () => {
  const atXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei"><music><body><mdiv><score>
    <scoreDef><staffGrp>
      <staffDef n="1" clef.shape="G" clef.line="2"/>
      <staffDef n="2" clef.shape="F" clef.line="4"/>
    </staffGrp></scoreDef>
    <section><measure xml:id="m1"><staff n="2"><layer>
      <beam xml:id="b1"><note xml:id="a1" pname="e" oct="4" staff="1" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d1"/></beam>
    </layer></staff></measure></section>
  </score></mdiv></body></music></mei>`
  const dtXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei"><music><body><mdiv><score><section>
    <measure xml:id="m1"><staff n="1"><layer><note xml:id="d1" loc="5"/></layer></staff></measure>
  </section></score></mdiv></body></music></mei>`

  const edited = prepareEditedAtDom(parser.parseFromString(atXml, 'text/xml'), parser.parseFromString(dtXml, 'text/xml'))
  const origNote = edited.querySelector('choice > orig > note')

  assert.ok(origNote)
  assert.equal(origNote.getAttribute('pname'), 'c')
  assert.equal(origNote.getAttribute('oct'), '5')
  assert.equal(origNote.getAttribute('staff'), '1')
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

test('prepareEditedAtDom uses a preceding clef from the same staff in an earlier measure', () => {
  const atXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <music><body><mdiv><score>
      <scoreDef><staffGrp><staffDef n="2" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
      <section>
        <measure xml:id="m1"><staff n="2"><layer><del><clef xml:id="c1" shape="F" line="4" staff="2"/></del></layer></staff></measure>
        <measure xml:id="m2"><staff n="2"><layer><note xml:id="a1" pname="c" oct="4" corresp="../diplomaticTranscripts/SRC_p001_wz01_dt.xml#d1"/></layer></staff></measure>
      </section>
    </score></mdiv></body></music>
  </mei>`

  const dtXml = `
  <mei xmlns="http://www.music-encoding.org/ns/mei">
    <music><body><mdiv><score><section><measure><staff n="2"><layer><note xml:id="d1" loc="10"/></layer></staff></measure></section></score></mdiv></body></music>
  </mei>`

  const edited = prepareEditedAtDom(parser.parseFromString(atXml, 'text/xml'), parser.parseFromString(dtXml, 'text/xml'))

  assert.equal(edited.querySelector('choice'), null)
  assert.ok(edited.querySelector('note[xml\\:id="a1"]'))
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
