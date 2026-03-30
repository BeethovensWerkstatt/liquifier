import { execSync } from 'node:child_process'

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

function getLiquifierCommitHash () {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function getCurrentLocalIsoDate () {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function appendTitlePostfix (clone) {
  const firstTitle = clone.querySelector('title')
  if (!firstTitle) return

  const currentText = firstTitle.textContent || ''
  if (currentText.includes(TITLE_POSTFIX)) return

  firstTitle.textContent = `${currentText.trim()}${TITLE_POSTFIX}`
}

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

function hasDiplomaticCorresp (element) {
  if (!element.hasAttribute('corresp')) return false

  const correspTokens = element.getAttribute('corresp').trim().split(/\s+/)

  return correspTokens.some(token => {
    if (!token.includes('#')) return false

    const [filePart] = token.split('#')

    return filePart.includes('/diplomaticTranscripts/') || filePart.endsWith('_dt.xml')
  })
}

function canBeWrappedAsSupplied (element) {
  if (!wrappableElementNames.has(element.localName)) return false
  if (!element.hasAttribute('xml:id')) return false
  if (element.closest('supplied')) return false
  if (element.localName === 'supplied') return false

  return !hasDiplomaticCorresp(element)
}

/**
 * Create a clone of AT DOM where AT elements without DT correspondence are wrapped
 * in <supplied resp="#bw"> ... </supplied>.
 * @param {Document} atDom - Annotated transcript MEI document
 * @returns {Document}
 */
export function prepareEditedAtDom (atDom) {
  const clone = atDom.cloneNode(true)

  appendTitlePostfix(clone)
  ensureLiquifierApplicationEntry(clone)
  ensureRevisionChangeEntry(clone)

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
