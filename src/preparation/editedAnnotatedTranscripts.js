import { execSync } from 'node:child_process'
import { closestElement } from '../utils/dom.js'
import { uuid } from '../utils/uuid.js'

const MEI_NS = 'http://www.music-encoding.org/ns/mei'

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
 * @returns {string} Resulting string.
 */
function getFirstDiplomaticCorrespId (element) {
  if (!element || !element.hasAttribute('corresp')) return null

  const correspTokens = element.getAttribute('corresp').trim().split(/\s+/)
  const token = correspTokens.find(token => {
    if (!token.includes('#')) return false
    const [filePart] = token.split('#')
    return filePart.includes('/diplomaticTranscripts/') || filePart.endsWith('_dt.xml')
  })

  if (!token) return null

  const [, id] = token.split('#')
  return id || null
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
  const staffN = staff?.getAttribute('n')

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

  if (staff) {
    const precedingStaffClefs = Array.from(staff.querySelectorAll('clef')).filter(clefNode => nodePrecedes(clefNode, note))
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
    return ((octave - 4) * 7) + pitchIndex
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
    pitchIndex = mod(loc, 7)
    octave = Math.floor(loc / 7) + 4
  } else {
    return null
  }

  return {
    pname: PITCHES[pitchIndex],
    oct: String(octave)
  }
}

/**
 * This function looks for notes in the AT that have a DT correspondence and compares
 * staff location values (@loc): DT @loc is read directly, while AT @loc is derived
 * from AT pname/oct and the currently effective clef (staffDef, then last preceding
 * clef change in the same staff). If they differ, the note is wrapped in
 * <choice><orig/><reg/></choice> where orig carries DT-derived pname/oct and reg
 * keeps the AT pitch.
 *
 * @param {Object} clone - Working cloned document that is modified in place.
 * @param {Document} dtDom - Source document used by this function.
 * @returns {void} No return value.
 */
function normalizePitchMismatches (clone, dtDom) {
  if (!dtDom) return

  const notes = Array.from(clone.querySelectorAll('music note[corresp]'))

  notes.forEach(note => {
    const atPname = note.getAttribute('pname')
    const atOct = note.getAttribute('oct')
    if (!atPname || !atOct) return

    const correspRaw = note.getAttribute('corresp') || ''
    const diplomaticTokens = correspRaw.trim().split(/\s+/).filter(token => {
      if (!token.includes('#')) return false
      const [filePart] = token.split('#')
      return filePart.includes('/diplomaticTranscripts/') || filePart.endsWith('_dt.xml')
    })

    if (diplomaticTokens.length > 1) {
      console.warn(`Multiple DT correspondences found for note ${note.getAttribute('xml:id')}; using first token`)
    }

    const dtNoteId = diplomaticTokens.length > 0
      ? diplomaticTokens[0].split('#')[1]
      : getFirstDiplomaticCorrespId(note.parentElement)
    if (!dtNoteId) return

    const dtNote = dtDom.querySelector(`note[xml\\:id="${dtNoteId}"]`)
    if (!dtNote || !dtNote.hasAttribute('loc')) return

    const clef = getAtClefForNote(note, clone)
    if (!clef) {
      console.warn(`Could not determine AT clef for note ${note.getAttribute('xml:id')}`)
      return
    }

    const atLoc = getLocFromPitch({
      pname: atPname,
      oct: atOct,
      clefShape: clef.shape,
      clefLine: clef.line
    })
    if (!Number.isFinite(atLoc)) {
      console.warn(`Unsupported clef for AT loc mapping (${clef.shape}${clef.line}) on note ${note.getAttribute('xml:id')}`)
      return
    }

    const dtLoc = parseInt(dtNote.getAttribute('loc'), 10)
    if (!Number.isFinite(dtLoc)) {
      console.warn(`Invalid DT @loc on note ${dtNoteId}`)
      return
    }

    if (atLoc === dtLoc) return

    const dtPitch = getPitchFromLoc({
      loc: dtLoc,
      clefShape: clef.shape,
      clefLine: clef.line
    })
    if (!dtPitch) {
      console.warn(`Unsupported clef for DT loc-to-pitch mapping (${clef.shape}${clef.line}) on note ${dtNoteId}`)
      return
    }

    const choice = clone.createElementNS(MEI_NS, 'choice')
    const orig = clone.createElementNS(MEI_NS, 'orig')
    const reg = clone.createElementNS(MEI_NS, 'reg')
    reg.setAttribute('resp', '#bw')

    const origNote = note.cloneNode(true)
    origNote.setAttribute('xml:id', 'o' + uuid())
    origNote.setAttribute('pname', dtPitch.pname)
    origNote.setAttribute('oct', dtPitch.oct)
    origNote.removeAttribute('loc')

    const regNote = note.cloneNode(true)

    orig.appendChild(origNote)
    reg.appendChild(regNote)
    choice.appendChild(orig)
    choice.appendChild(reg)

    note.parentNode.replaceChild(choice, note)
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

  normalizePitchMismatches(clone, dtDom)

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
