import { execSync } from 'node:child_process'
import { closestElement } from '../utils/dom.js'

const MEI_NS = 'http://www.music-encoding.org/ns/mei'
const HEAD_SHAPE_DURATIONS = new Map([['whole', 1], ['half', 2], ['quarter', 4]])
const REST_GLYPH_DURATIONS = new Map([
  ['restWhole', '1'],
  ['restHalf', '2'],
  ['restQuarter', '4'],
  ['rest8th', '8'],
  ['rest16th', '16'],
  ['rest32nd', '32'],
  ['rest64th', '64']
])
// Beam lines only roughly span their stems, so an event is attached if it lies this close.
const BEAM_STEM_TOLERANCE = 5

const TITLE_POSTFIX = ' – auto-generated Annotated Transcription with explicit editorial markup'
const LIQUIFIER_APP_ID = 'bw_liquifier'
const LIQUIFIER_URL = 'https://github.com/BeethovensWerkstatt/liquifier/'

export const WRAPPABLE_EDITED_AT_ELEMENTS = [
  'note',
  'chord',
  'syl',
  'rest',
  'mRest',
  'beam',
  'beamSpan',
  'artic',
  'accid',
  'clef',
  'slur',
  'tie',
  'curve',
  'dynam',
  'dir',
  'keyAccid',
  'meterSig',
  'barLine',
  'dot',
  'hairpin',
  'trill',
  'tempo',
  'pedal',
  'fing',
  'fermata',
  'octave'
]

const wrappableElementNames = new Set(WRAPPABLE_EDITED_AT_ELEMENTS)

/**
 * Returns liquifier commit hash from the current data context.
 *
 * @returns {Object} Resulting object.
 */
function getLiquifierCommitHash () {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Returns current local iso date from the current data context.
 *
 * @returns {string} Resulting string.
 */
function getCurrentLocalIsoDate () {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Appends title postfix.
 *
 * @param {Object} clone - Working cloned document that is modified in place.
 * @returns {void} No return value.
 */
function appendTitlePostfix (clone) {
  const firstTitle = clone.querySelector('title')
  if (!firstTitle) return

  const currentText = firstTitle.textContent || ''
  if (currentText.includes(TITLE_POSTFIX)) return

  firstTitle.textContent = `${currentText.trim()}${TITLE_POSTFIX}`
}

/**
 * Ensures liquifier application entry.
 *
 * @param {Object} clone - Working cloned document that is modified in place.
 * @returns {void} No return value.
 */
function ensureLiquifierApplicationEntry (clone) {
  const encodingDesc = clone.querySelector('meiHead > encodingDesc')
  if (!encodingDesc) return

  let appInfo = encodingDesc.querySelector('appInfo')
  if (!appInfo) {
    appInfo = clone.createElementNS(MEI_NS, 'appInfo')
    encodingDesc.insertBefore(appInfo, encodingDesc.firstChild)
  }

  let application = appInfo.querySelector(`application[xml\\:id="${LIQUIFIER_APP_ID}"]`)
  if (!application) {
    application = clone.createElementNS(MEI_NS, 'application')
    appInfo.appendChild(application)
  }

  application.setAttribute('xml:id', LIQUIFIER_APP_ID)
  application.setAttribute('version', getLiquifierCommitHash())

  let name = application.querySelector('name')
  if (!name) {
    name = clone.createElementNS(MEI_NS, 'name')
    application.appendChild(name)
  }
  name.textContent = 'Liquifier'

  let ptr = application.querySelector('ptr')
  if (!ptr) {
    ptr = clone.createElementNS(MEI_NS, 'ptr')
    application.appendChild(ptr)
  }
  ptr.setAttribute('target', LIQUIFIER_URL)
}

/**
 * Ensures revision change entry.
 *
 * @param {Object} clone - Working cloned document that is modified in place.
 * @returns {Element|null} Resulting object.
 */
function ensureRevisionChangeEntry (clone) {
  const meiHead = clone.querySelector('meiHead')
  if (!meiHead) return

  let revisionDesc = meiHead.querySelector('revisionDesc')
  if (!revisionDesc) {
    revisionDesc = clone.createElementNS(MEI_NS, 'revisionDesc')
    meiHead.appendChild(revisionDesc)
  }

  const existingChanges = Array.from(revisionDesc.querySelectorAll('change'))
  const maxN = existingChanges.reduce((max, change) => {
    const raw = change.getAttribute('n')
    const parsed = raw ? parseInt(raw, 10) : NaN
    return Number.isNaN(parsed) ? max : Math.max(max, parsed)
  }, 0)

  const nextN = String(maxN + 1)

  const change = clone.createElementNS(MEI_NS, 'change')
  change.setAttribute('n', nextN)
  change.setAttribute('resp', '#bw')
  change.setAttribute('isodate', getCurrentLocalIsoDate())

  const changeDesc = clone.createElementNS(MEI_NS, 'changeDesc')
  const p = clone.createElementNS(MEI_NS, 'p')
  p.append('File auto-generated using ')

  const ptr = clone.createElementNS(MEI_NS, 'ptr')
  ptr.setAttribute('target', '#bw_liquifier')
  p.appendChild(ptr)

  changeDesc.appendChild(p)
  change.appendChild(changeDesc)
  revisionDesc.appendChild(change)
}

/**
 * Returns whether diplomatic corresp.
 *
 * @param {Element} element - Element processed by this function.
 * @returns {boolean} Whether the condition is satisfied.
 */
function hasDiplomaticCorresp (element) {
  if (!element.hasAttribute('corresp')) return false

  const correspTokens = element.getAttribute('corresp').trim().split(/\s+/)

  return correspTokens.some(token => {
    if (!token.includes('#')) return false

    const [filePart] = token.split('#')

    return filePart.includes('/diplomaticTranscripts/') || filePart.endsWith('_dt.xml')
  })
}

/**
 * Returns whether be wrapped as supplied.
 *
 * @param {Element} element - Element processed by this function.
 * @returns {boolean} Whether the condition is satisfied.
 */
function canBeWrappedAsSupplied (element) {
  if (!wrappableElementNames.has(element.localName)) return false
  if (!element.hasAttribute('xml:id')) return false
  if (closestElement(element, 'supplied')) return false
  if (element.localName === 'supplied') return false

  return !hasDiplomaticCorresp(element)
}

/**
 * Returns first diplomatic corresp id from the current data context.
 *
 * @param {Element} element - Element processed by this function.
 * @returns {string|null} First diplomatic target id.
 */
function getFirstDiplomaticCorrespId (element) {
  return getDiplomaticCorrespIds(element)[0] || null
}

/**
 * Returns diplomatic corresp ids from the current data context.
 *
 * @param {Element} element - Element processed by this function.
 * @returns {string[]} Diplomatic target ids.
 */
function getDiplomaticCorrespIds (element) {
  if (!element || !element.hasAttribute('corresp')) return []

  const correspTokens = element.getAttribute('corresp').trim().split(/\s+/)

  return correspTokens.filter(token => {
    if (!token.includes('#')) return false
    const [filePart] = token.split('#')
    return filePart.includes('/diplomaticTranscripts/') || filePart.endsWith('_dt.xml')
  }).map(token => token.split('#')[1]).filter(Boolean)
}

function getDiplomaticElement (element, dtDom, expectedName) {
  const dtId = getFirstDiplomaticCorrespId(element) ||
    (element.localName === 'note' ? getFirstDiplomaticCorrespId(element.parentElement) : null)
  if (!dtId) return null

  const dtElement = dtDom.querySelector(`${expectedName}[xml\\:id="${dtId}"]`)
  return dtElement || null
}

function getChildElements (element, name) {
  return Array.from(element.childNodes).filter(node => node.nodeType === 1 && node.localName === name)
}

function getDiplomaticTargetElements (element, dtDom) {
  return getDiplomaticCorrespIds(element)
    .map(id => dtDom.querySelector(`*[xml\\:id="${id}"]`))
    .filter(Boolean)
}

function hasDiplomaticDotCorresp (dot, dtDom) {
  return getDiplomaticTargetElements(dot, dtDom).some(target => target.localName === 'dot')
}

function getAncestorBeams (element) {
  const beams = []
  for (let node = element.parentNode; node && node.nodeType === 1; node = node.parentNode) {
    if (node.localName === 'beam') beams.push(node)
  }
  return beams
}

/**
 * Counts the DT beam lines, referenced by the enclosing (possibly nested) AT beams,
 * that cover the DT event horizontally. DT beams are plain lines without a reference
 * to the notes they connect.
 *
 * @param {Element} atEvent - AT event, used to find the enclosing beams.
 * @param {Element} dtEvent - DT event whose x position is tested.
 * @param {Document} dtDom - Diplomatic transcript.
 * @returns {number} Number of beam lines attached to the event.
 */
function countDiplomaticBeamLines (atEvent, dtEvent, dtDom) {
  const x = parseFloat(dtEvent.getAttribute('x'))
  if (!Number.isFinite(x)) return 0

  return getAncestorBeams(atEvent)
    .flatMap(beam => getDiplomaticTargetElements(beam, dtDom))
    .filter(line => {
      if (line.localName !== 'line' || line.getAttribute('func') !== 'beam') return false
      const x1 = parseFloat(line.getAttribute('x'))
      const x2 = parseFloat(line.getAttribute('x2'))
      if (!Number.isFinite(x1) || !Number.isFinite(x2)) return false
      return x >= Math.min(x1, x2) - BEAM_STEM_TOLERANCE && x <= Math.max(x1, x2) + BEAM_STEM_TOLERANCE
    }).length
}

/**
 * Derives the duration shown in the DT, which never carries @dur: from @head.shape
 * and @bw:stem.flags (or attached beam lines) for notes and chords, and from the
 * glyph for rests.
 *
 * @param {Element} atEvent - Corresponding AT event.
 * @param {Element} dtEvent - DT note, chord or rest.
 * @param {Document} dtDom - Diplomatic transcript.
 * @returns {string|null} MEI @dur value, or null if the DT does not determine it.
 */
function getDiplomaticDuration (atEvent, dtEvent, dtDom) {
  if (dtEvent.localName === 'rest') {
    return REST_GLYPH_DURATIONS.get(dtEvent.getAttribute('glyph.name')) || null
  }

  const heads = dtEvent.localName === 'chord' ? getChildElements(dtEvent, 'note') : [dtEvent]
  const base = HEAD_SHAPE_DURATIONS.get(heads.map(head => head.getAttribute('head.shape')).find(Boolean))
  if (!base) return null
  if (base < 4) return String(base)

  const flags = Math.max(0, ...[dtEvent, ...heads].map(head => parseInt(head.getAttribute('bw:stem.flags'), 10) || 0))
  const levels = flags > 0 ? flags : countDiplomaticBeamLines(atEvent, dtEvent, dtDom)

  return String(base * 2 ** levels)
}

/**
 * Compares AT and DT rhythm. DT dots are standalone elements, so only AT dots that
 * correspond to a DT <dot> count as diplomatic; all others are editorial additions.
 *
 * @param {Element} atEvent - AT note, chord or rest.
 * @param {Element} dtEvent - Corresponding DT element.
 * @param {Document} dtDom - Diplomatic transcript.
 * @returns {{dur: string|null, differs: boolean}} DT duration and whether rhythm differs.
 */
function getDiplomaticRhythm (atEvent, dtEvent, dtDom) {
  const dtDur = getDiplomaticDuration(atEvent, dtEvent, dtDom)
  const atDur = atEvent.getAttribute('dur')
  const durDiffers = dtDur !== null && atDur !== null && dtDur !== atDur

  const dotChildren = getChildElements(atEvent, 'dot')
  const atDots = dotChildren.length + (Number.parseInt(atEvent.getAttribute('dots'), 10) || 0)
  const dtDots = dotChildren.filter(dot => hasDiplomaticDotCorresp(dot, dtDom)).length

  return { dur: dtDur, differs: durDiffers || atDots !== dtDots }
}

function applyDiplomaticRhythm (origEvent, rhythm, dtDom) {
  if (rhythm.dur !== null && origEvent.hasAttribute('dur')) {
    origEvent.setAttribute('dur', rhythm.dur)
  }

  origEvent.removeAttribute('dots')
  getChildElements(origEvent, 'dot')
    .filter(dot => !hasDiplomaticDotCorresp(dot, dtDom))
    .forEach(dot => origEvent.removeChild(dot))
}

// Orig ids derive deterministically from the reg ids, so both renders can be paired later.
function assignOrigIds (element) {
  const elements = [element, ...Array.from(element.querySelectorAll('*[xml\\:id]'))]
  elements.forEach(descendant => {
    if (descendant.hasAttribute('xml:id')) {
      descendant.setAttribute('xml:id', 'o' + descendant.getAttribute('xml:id'))
    }
  })
}

function replaceWithEditorialChoice (clone, element, origElement) {
  const choice = clone.createElementNS(MEI_NS, 'choice')
  const orig = clone.createElementNS(MEI_NS, 'orig')
  const reg = clone.createElementNS(MEI_NS, 'reg')
  reg.setAttribute('resp', '#bw')

  const regElement = element.cloneNode(true)
  assignOrigIds(origElement)

  orig.appendChild(origElement)
  reg.appendChild(regElement)
  choice.appendChild(orig)
  choice.appendChild(reg)
  element.parentNode.replaceChild(choice, element)
}

const NODE_POSITION_FOLLOWING = 4
const PITCH_INDEX = new Map([
  ['c', 0],
  ['d', 1],
  ['e', 2],
  ['f', 3],
  ['g', 4],
  ['a', 5],
  ['b', 6]
])
const PITCHES = ['c', 'd', 'e', 'f', 'g', 'a', 'b']

/**
 * Returns clef shape and line from the current data context.
 *
 * @param {Element} element - Element processed by this function.
 * @returns {Object} Resulting object.
 */
function getClefShapeAndLine (element) {
  if (!element) return null

  const nestedClef = element.localName === 'clef' ? element : element.querySelector('clef')
  const shape = nestedClef?.getAttribute('shape') || nestedClef?.getAttribute('clef.shape') || element.getAttribute('clef.shape')
  const line = nestedClef?.getAttribute('line') || nestedClef?.getAttribute('clef.line') || element.getAttribute('clef.line')
  if (!shape || !line) return null

  return { shape, line }
}

/**
 * Processes precedes for this operation.
 *
 * @param {number} left - Numeric input used by this function.
 * @param {number} right - Numeric input used by this function.
 * @returns {boolean} Whether the condition is satisfied.
 */
function nodePrecedes (left, right) {
  return !!(left.compareDocumentPosition(right) & NODE_POSITION_FOLLOWING)
}

/**
 * Returns at clef for note from the current data context.
 *
 * @param {Element} note - Element processed by this function.
 * @param {Document} atDom - DOM document used by this function.
 * @returns {Object} Resulting object.
 */
function getAtClefForNote (note, atDom) {
  if (!note || !atDom) return null

  const staff = closestElement(note, 'staff')
  const staffN = note.getAttribute('staff') || staff?.getAttribute('n')

  let clef = null
  if (staffN) {
    const staffDefs = Array.from(atDom.querySelectorAll(`staffDef[n="${staffN}"]`))
    staffDefs.forEach(staffDef => {
      if (nodePrecedes(staffDef, note)) {
        const fromStaffDef = getClefShapeAndLine(staffDef)
        if (fromStaffDef) clef = fromStaffDef
      }
    })

    if (!clef) {
      for (const staffDef of staffDefs) {
        const fromStaffDef = getClefShapeAndLine(staffDef)
        if (fromStaffDef) {
          clef = fromStaffDef
          break
        }
      }
    }
  }

  if (staffN) {
    const precedingStaffClefs = Array.from(atDom.querySelectorAll('clef')).filter(clefNode => {
      const clefStaffN = clefNode.getAttribute('staff') || closestElement(clefNode, 'staff')?.getAttribute('n')
      return clefStaffN === staffN && nodePrecedes(clefNode, note)
    })
    precedingStaffClefs.forEach(clefNode => {
      const fromStaffClef = getClefShapeAndLine(clefNode)
      if (fromStaffClef) clef = fromStaffClef
    })
  }

  return clef
}

/**
 * Returns loc from pitch from the current data context.
 *
 * @param {Object} params - Destructured parameter bundle for pitch/clef conversion.
 * @param {string} params.pname - Pitch name (c, d, e, f, g, a, b).
 * @param {string|number} params.oct - Octave value for the pitch.
 * @param {string} params.clefShape - Clef shape used for conversion.
 * @param {string|number} params.clefLine - Clef line used for conversion.
 * @returns {number|null} Staff location value, or null when conversion is not possible.
 */
function getLocFromPitch ({ pname, oct, clefShape, clefLine }) {
  const pitchIndex = PITCH_INDEX.get(String(pname).toLowerCase())
  const octave = parseInt(oct, 10)
  if (pitchIndex === undefined || !Number.isFinite(octave)) return null

  if (clefShape === 'G' && clefLine === '2') {
    return ((octave - 4) * 7) + pitchIndex - 2
  }

  if (clefShape === 'F' && clefLine === '4') {
    return ((octave - 3) * 7) + pitchIndex + 3
  }

  if (clefShape === 'C' && clefLine === '3') {
    return ((octave - 3) * 7) + pitchIndex - 3
  }

  return null
}

/**
 * Processes data for this operation.
 *
 * @param {Object} n - Input object used by this function.
 * @param {Object} m - Input object used by this function.
 * @returns {Object} Resulting object.
 */
function mod (n, m) {
  return ((n % m) + m) % m
}

/**
 * Returns pitch from loc from the current data context.
 *
 * @param {Object} params - Destructured parameter bundle for loc-to-pitch conversion.
 * @param {number} params.loc - Staff location value to convert.
 * @param {string} params.clefShape - Clef shape used for conversion.
 * @param {string|number} params.clefLine - Clef line used for conversion.
 * @returns {{pname: string, oct: string}|null} Converted pitch data, or null when conversion is not possible.
 */
function getPitchFromLoc ({ loc, clefShape, clefLine }) {
  if (!Number.isFinite(loc)) return null

  let pitchIndex
  let octave

  if (clefShape === 'G' && clefLine === '2') {
    const n = loc + 2
    pitchIndex = mod(n, 7)
    octave = Math.floor(n / 7) + 4
  } else if (clefShape === 'F' && clefLine === '4') {
    const n = loc - 3
    pitchIndex = mod(n, 7)
    octave = Math.floor(n / 7) + 3
  } else if (clefShape === 'C' && clefLine === '3') {
    const n = loc + 3
    pitchIndex = mod(n, 7)
    octave = Math.floor(n / 7) + 3
  } else {
    return null
  }

  return {
    pname: PITCHES[pitchIndex],
    oct: String(octave)
  }
}

/**
 * Compare corresponding note pitch and rhythm. When either differs, wrap the note
 * in <choice><orig/><reg/></choice>, with DT values in orig and AT values in reg.
 *
 * @param {Object} clone - Working cloned document that is modified in place.
 * @param {Document} dtDom - Source document used by this function.
 * @returns {void} No return value.
 */
function normalizeNoteMismatches (clone, dtDom) {
  if (!dtDom) return

  const notes = Array.from(clone.querySelectorAll('music note[corresp]'))

  notes.forEach(note => {
    if (getDiplomaticCorrespIds(note).length > 1) {
      console.warn(`Multiple DT correspondences found for note ${note.getAttribute('xml:id')}; using first token`)
    }

    const dtNote = getDiplomaticElement(note, dtDom, 'note')
    if (!dtNote) return

    let dtPitch = null
    let pitchDiffers = false
    const atPname = note.getAttribute('pname')
    const atOct = note.getAttribute('oct')
    const dtLoc = parseInt(dtNote.getAttribute('loc'), 10)

    if (atPname && atOct && !Number.isFinite(dtLoc)) {
      console.warn(`Invalid DT @loc on note ${dtNote.getAttribute('xml:id')}`)
    } else if (atPname && atOct) {
      const clef = getAtClefForNote(note, clone)
      if (!clef) {
        console.warn(`Could not determine AT clef for note ${note.getAttribute('xml:id')}`)
      } else {
        const atLoc = getLocFromPitch({
          pname: atPname,
          oct: atOct,
          clefShape: clef.shape,
          clefLine: clef.line
        })
        if (!Number.isFinite(atLoc)) {
          console.warn(`Unsupported clef for AT loc mapping (${clef.shape}${clef.line}) on note ${note.getAttribute('xml:id')}`)
        } else if (atLoc !== dtLoc) {
          dtPitch = getPitchFromLoc({
            loc: dtLoc,
            clefShape: clef.shape,
            clefLine: clef.line
          })
          if (!dtPitch) {
            console.warn(`Unsupported clef for DT loc-to-pitch mapping (${clef.shape}${clef.line}) on note ${dtNote.getAttribute('xml:id')}`)
          } else {
            pitchDiffers = true
          }
        }
      }
    }

    const rhythm = closestElement(note, 'chord') ? null : getDiplomaticRhythm(note, dtNote, dtDom)
    const rhythmDiffersForNote = Boolean(rhythm?.differs)
    if (!pitchDiffers && !rhythmDiffersForNote) return

    const origNote = note.cloneNode(true)
    if (pitchDiffers) {
      origNote.setAttribute('pname', dtPitch.pname)
      origNote.setAttribute('oct', dtPitch.oct)
      origNote.removeAttribute('loc')
    }
    if (rhythmDiffersForNote) applyDiplomaticRhythm(origNote, rhythm, dtDom)

    replaceWithEditorialChoice(clone, note, origNote)
  })
}

function normalizeChordAndRestRhythmMismatches (clone, dtDom) {
  if (!dtDom) return

  const events = Array.from(clone.querySelectorAll('music chord[corresp], music rest[corresp], music mRest[corresp]'))
  events.forEach(event => {
    const expectedName = event.localName === 'mRest' ? 'mRest, rest' : event.localName
    const dtEvent = getDiplomaticElement(event, dtDom, expectedName)
    if (!dtEvent) return

    const rhythm = getDiplomaticRhythm(event, dtEvent, dtDom)
    if (!rhythm.differs) return

    const origEvent = event.cloneNode(true)
    applyDiplomaticRhythm(origEvent, rhythm, dtDom)
    replaceWithEditorialChoice(clone, event, origEvent)
  })
}

/**
 * Create a clone of AT DOM where AT elements without DT correspondence are wrapped
 * in <supplied resp="#bw"> ... </supplied>.
 *
 * @param {Document} atDom - Annotated transcript MEI document
 * @param {Document} dtDom - DOM document used by this function.
 * @returns {Document} Resulting object.
 */
export function prepareEditedAtDom (atDom, dtDom) {
  const clone = atDom.cloneNode(true)

  appendTitlePostfix(clone)
  ensureLiquifierApplicationEntry(clone)
  ensureRevisionChangeEntry(clone)

  normalizeNoteMismatches(clone, dtDom)
  normalizeChordAndRestRhythmMismatches(clone, dtDom)

  const music = clone.querySelector('music')
  if (!music) return clone

  const candidates = Array.from(music.querySelectorAll('*[xml\\:id]'))

  candidates.forEach((element) => {
    if (!canBeWrappedAsSupplied(element)) return

    const parent = element.parentNode
    if (!parent || parent.nodeType !== 1) return

    const supplied = clone.createElementNS(MEI_NS, 'supplied')
    supplied.setAttribute('resp', '#bw')

    parent.insertBefore(supplied, element)
    supplied.appendChild(element)
  })

  return clone
}
