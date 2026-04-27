import { boundingboxDefaultControlpoints } from '../utils/geometry.js'
import { uuid } from '../utils/uuid.js'
import { getOsdRects } from '../utils/facsimileHelpers.js'
import { JSDOM } from 'jsdom'

const { DOMParser, Node } = (new JSDOM()).window
// import store from '@/store'
const parser = new DOMParser()

export const MEIversion = '5.0'

const rawSelectables = [
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
  'dots',
  'hairpin',
  'trill',
  'tempo',
  'pedal',
  'fing',
  'fermata',
  'octave'
  // 'staff',
  // 'measure'
]
const clsSelectables = []
rawSelectables.forEach(elem => {
  clsSelectables.push('.' + elem + ':not(.bounding-box)')
})
export const CSSselectables = clsSelectables.join(', ')

/**
 * generates a diplomatic transcription from a given annotated transcription and a list of shapes
 *
 * @returns the generated diplomatic transcription
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} shapes - Shape mapping used while generating diplomatic elements.
 * @param {number} bbox - Numeric input used by this function.
 * @param {string} svgPath - String input used by this function.
 * @param {string} correspPath - String input used by this function.
 * @param {Element} annotElemRef - Element processed by this function.
 * @param {string} specialModes - String input used by this function.
 * @returns {Object} Resulting object.
 */
export function generateDiplomaticElement (annotElem, shapes, bbox, svgPath, correspPath, annotElemRef, specialModes) {
  let name = annotElem.localName

  // console.log(881, annotElem, shapes, bbox, svgPath, correspPath, annotElemRef)

  if (name === 'beam') {
    name = 'beamSpan'
  } else if (name === 'measure') {
    name = 'barLine'
  } if (name === 'staff') {
    switch (annotElemRef.name) {
      case 'keyAccid':
        name = 'accid'
        break
      default:
        name = annotElemRef.name
    }
  } else if (name === 'note' && annotElem.parentNode.localName === 'chord' && annotElemRef.name !== 'dots') {
    name = 'chord'
    annotElemRef.id = annotElem.parentNode.getAttribute('xml:id')
  } else if ((name === 'note' || name === 'rest') && annotElemRef.name === 'dots') {
    name = 'dot'
  } else if (name === 'keyAccid') {
    name = 'accid'
  } else if (name === 'tie' || name === 'slur') {
    name = 'curve'
  } else if (specialModes && specialModes.pitchClarificationLetter) {
    name = 'metaMark'
  } else if (name === 'syl') {
    name = 'word'
  }

  const elem = document.createElementNS('http://www.music-encoding.org/ns/mei', name)
  elem.setAttribute('xml:id', 'd' + uuid())
  elem.setAttribute('x', bbox.mm.x)

  const facs = []
  shapes.forEach(shape => {
    if (shape.hasAttribute('id')) {
      facs.push(svgPath + '#' + shape.getAttribute('id'))
    } else {
      console.warn('WARNING: Spotted a shape without an ID:', shape)
    }
  })
  elem.setAttribute('facs', facs.join(' '))
  // elem.setAttribute('corresp', annotElem.getAttribute('xml:id'))

  const existingCorresp = annotElem.getAttribute('corresp')
  const newCorresp = correspPath + elem.getAttribute('xml:id')
  const corresp = existingCorresp ? existingCorresp + ' ' + newCorresp : newCorresp
  if (annotElem.hasAttribute('dots') && annotElemRef.name === 'dots' && (annotElem.localName === 'note' || annotElem.localName === 'rest')) {
    const count = +annotElem.getAttribute('dots')
    annotElem.removeAttribute('dots')
    for (let i = 0; i < count; i++) {
      const dot = document.createElementNS('http://www.music-encoding.org/ns/mei', 'dot')
      dot.setAttribute('xml:id', 'd' + uuid())
      if (i === 0) {
        dot.setAttribute('corresp', newCorresp)
      }
      annotElem.appendChild(dot)
    }
  } else if (specialModes && specialModes.pitchClarificationLetter) {
    // Pitch Clarification Letters actually need a @corresp on the note they are clarifying, or an InfoBox won't be able to inform about them properly…
    annotElem.setAttribute('corresp', corresp)
  } else {
    annotElem.setAttribute('corresp', corresp)
  }

  if (name === 'note') {
    getDiplomaticNote(annotElem, elem)
  } else if (name === 'rest') {
    getDiplomaticRest(annotElem, elem)
  } else if (name === 'beamSpan' || name === 'beam') {
    getDiplomaticBeam(annotElem, elem)
  } else if (name === 'accid') {
    console.log(279, 'getDiplomaticAccid', annotElem, elem)
    getDiplomaticAccid(annotElem, elem, annotElemRef)
  } else if (name === 'barLine') {
    getDiplomaticBarline(annotElem, elem, bbox)
  } else if (name === 'dot') {
    getDiplomaticDot(annotElem, elem)
  } else if (name === 'chord') {
    if (annotElem.localName === 'note') {
      annotElem = annotElem.parentNode
    }
    getDiplomaticChord(annotElem, elem)
  } else if (name === 'keyAccid') {
    getDiplomaticKeyAccid(annotElem, elem)
  } else if (name === 'meterSig') {
    getDiplomaticMetersig(annotElem, elem, annotElemRef.meter)
  } else if (name === 'clef') {
    getDiplomaticClef(annotElem, elem, annotElemRef.clef)
  } else if (name === 'curve') {
    getDiplomaticCurve(annotElem, elem, bbox)
  } else if (name === 'dynam') {
    getDiplomaticDynam(annotElem, elem, bbox)
  } else if (name === 'tempo') {
    getDiplomaticTempo(annotElem, elem, bbox)
  } else if (name === 'dir') {
    getDiplomaticDir(annotElem, elem, bbox)
  } else if (name === 'fing') {
    getDiplomaticFing(annotElem, elem, bbox)
  } else if (name === 'pedal') {
    getDiplomaticPedal(annotElem, elem, bbox)
  } else if (name === 'octave') {
    getDiplomaticOctave(annotElem, elem, bbox)
  } else if (name === 'fermata') {
    getDiplomaticFermata(annotElem, elem, bbox)
  } else if (name === 'hairpin') {
    getDiplomaticHairpin(annotElem, elem, bbox)
  } else if (name === 'trill') {
    getDiplomaticTrill(annotElem, elem, bbox)
  } else if (name === 'metaMark') {
    if (specialModes && specialModes.pitchClarificationLetter) {
      getPitchClarificationLetter(annotElem, elem, bbox)
    }
  } else if (name === 'word') {
    getDiplomaticWord(annotElem, elem, bbox)
  } else {
    console.warn('TODO: @/tools/mei.js:generateDiplomaticElement() does not yet support ' + name + ' elements')
  }

  return elem
}

/**
 * translates an annotated note to a diplomatic note
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Element} note - Element processed by this function.
 * @returns {void} No return value.
 */
function getDiplomaticNote (annotElem, note) {
  try {
    const loc = getLocAttribute(annotElem)

    note.setAttribute('loc', loc)

    // head shape
    let headshape
    const dur = annotElem.getAttribute('dur')
    if (dur === '1') {
      headshape = 'whole'
    } else if (dur === '2') {
      headshape = 'half'
    } else if (parseInt(dur) >= 4) {
      headshape = 'quarter'
    }
    if (annotElem.hasAttribute('head.shape')) {
      headshape = annotElem.getAttribute('head.shape')
    }
    note.setAttribute('head.shape', headshape)
    note.setAttribute('dur', dur)

    // stem direction
    if (annotElem.hasAttribute('stem.dir')) {
      note.setAttribute('stem.dir', annotElem.getAttribute('stem.dir'))
    } else if (dur !== '1') {
      note.setAttribute('stem.dir', loc < 4 ? 'up' : 'down')
    }

    const grace = annotElem.getAttribute('grace')
    if (grace) {
      note.setAttribute('grace', grace)
    }

    // log('diplomatic note:', note)
  } catch (err) {
    console.warn('WARNING: Could not properly generate diplomatic note for ' + annotElem, err)
  }
}

/**
 * translates an annotated rest to a diplomatic rest
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} rest - Input object used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticRest (annotElem, rest) {
  try {
    rest.setAttribute('loc', 5)

    let glyphName
    const dur = annotElem.getAttribute('dur')
    if (dur === '1') {
      glyphName = 'restWhole'
    } else if (dur === '2') {
      glyphName = 'restHalf'
    } else if (dur === '4') {
      glyphName = 'restQuarter'
    } else if (dur === '8') {
      glyphName = 'rest8th'
    } else if (dur === '16') {
      glyphName = 'rest16th'
    } else if (dur === '32') {
      glyphName = 'rest32nd'
    } else if (dur === '64') {
      glyphName = 'rest64th'
    }

    if (annotElem.hasAttribute('glyph.name')) {
      glyphName = annotElem.getAttribute('glyph.name')
    }
    rest.setAttribute('glyph.name', glyphName)
    rest.setAttribute('glyph.auth', 'smufl')
  } catch (err) {
    console.warn('WARNING: Could not properly generate diplomatic rest for ' + annotElem, err)
  }
}

/**
 * translates an annotated beam to a diplomatic beam
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Element} beam - Element processed by this function.
 * @returns {void} No return value.
 */
function getDiplomaticBeam (annotElem, beam) {
  // This function requires store which is not available in standalone mode
  /*
  const dtdoc = store.getters.diplomaticTranscriptForCurrentWz
  const targets = []
  annotElem.querySelectorAll('[corresp]').forEach(elem => {
    console.log('718: investigating ', elem)
    if (elem.localName === 'chord' || (elem.localName === 'note' && !elem.closest('chord'))) {
      // multiple associations are possible!
      for (const correspelem of elem.getAttribute('corresp').split(' ')) {
        // get uid for corresponding element
        const corresp = correspelem.split('#')[1]
        const dtelem = dtdoc.querySelector('*[*|id="' + corresp + '"]')
        console.log('718: found ', corresp, dtelem)
        // check target element
        if (corresp.trim().length > 0 && dtelem) {
          targets.push('#' + corresp)
        }
      }
    }
  })
  beam.setAttribute('plist', targets.join(' '))
  beam.setAttribute('startid', targets[0])
  beam.setAttribute('endid', targets.splice(-1)[0])
  beam.setAttribute('staff', annotElem.closest('staff').getAttribute('n'))
  console.log(718, '\n', beam, '\n', annotElem, '\n', targets)
  */
}

/**
 * translates an annotated accidental to a diplomatic accidental
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {string} accid - String input used by this function.
 * @param {Object} options3 - Structured options object.
 * @returns {void} No return value.
 */
function getDiplomaticAccid (annotElem, accid, { keySig, keyAccid, keyBase }) {
  // console.log(279, 'getDiplomaticAccid', annotElem, accid, keySig)
  if (keySig) {
    const sharp = keySig >= 0
    accid.setAttribute('accid', sharp ? 's' : 'f')
    // get location of accidental in the range of [3-9] TODO: G-clef ... what about F-Clef?
    const base = keySig < 0 ? 1 : 5
    const fact = keySig < 0 ? 3 : 4
    const loc = (keyBase + base + (keyAccid * fact) - 3) % 7 + 3
    accid.setAttribute('loc', loc)
    // console.log(279, accid)
  } else {
    accid.setAttribute('accid', annotElem.getAttribute('accid'))
    const note = annotElem.closest('note')
    accid.setAttribute('loc', getLocAttribute(note))
  }
}

/**
 * translates an annotated barLine to a diplomatic barLine
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Element} barLine - Element processed by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticBarline (annotElem, barLine, bbox) {
  barLine.setAttribute('form', 'single')
  barLine.setAttribute('x', (parseFloat(bbox.mm.x) + parseFloat(bbox.mm.w)).toFixed(1))
  barLine.setAttribute('y', bbox.mm.y)
  barLine.setAttribute('x2', (parseFloat(bbox.mm.x)).toFixed(1))
  barLine.setAttribute('y2', (parseFloat(bbox.mm.y) + parseFloat(bbox.mm.h)).toFixed(1))
  // console.log(364, '\n', barLine, '\n', annotElem)
}

/**
 * translates a dot from an annotated note to a diplomatic dot
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} dot - Input object used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticDot (annotElem, dot) {
  const loc = getLocAttribute(annotElem)

  dot.setAttribute('loc', loc)
}

/**
 * translates a dynamic from an annotated note to a diplomatic dynamic
 *
 * @returns the dt:dynam element
 * @param {Element} annotElem - Element processed by this function.
 * @param {number} dynam - Numeric input used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticDynam (annotElem, dynam, bbox) {
  dynam.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
  dynam.setAttribute('width', (parseFloat(bbox.mm.w)).toFixed(1))
  dynam.setAttribute('y', bbox.mm.y)
  dynam.setAttribute('staff', annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0])
  dynam.innerHTML = annotElem.innerHTML.replace(/\s+/g, ' ').trim()
}

/**
 * translates a tempo from an annotated note to a diplomatic tempo
 *
 * @returns the dt:tempo element
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} tempo - Input object used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticTempo (annotElem, tempo, bbox) {
  tempo.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
  tempo.setAttribute('width', (parseFloat(bbox.mm.w)).toFixed(1))
  tempo.setAttribute('y', bbox.mm.y)
  tempo.setAttribute('staff', annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0])
  tempo.innerHTML = annotElem.innerHTML.replace(/\s+/g, ' ').trim()
}

/**
 * translates a dir from an annotated note to a diplomatic dir
 *
 * @returns the dt:dir element
 * @param {Element} annotElem - Element processed by this function.
 * @param {string} dir - String input used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticDir (annotElem, dir, bbox) {
  dir.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
  dir.setAttribute('width', (parseFloat(bbox.mm.w)).toFixed(1))
  dir.setAttribute('y', bbox.mm.y)
  dir.setAttribute('staff', annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0])
  dir.innerHTML = annotElem.innerHTML.replace(/\s+/g, ' ').trim()
}

/**
 * translates a fing from an AT to a diplomatic fing(ering)
 *
 * @returns the dt:fing element
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} fing - Input object used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticFing (annotElem, fing, bbox) {
  fing.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
  fing.setAttribute('y', bbox.mm.y)
  fing.setAttribute('staff', annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0])
  fing.innerHTML = annotElem.innerHTML.replace(/\s+/g, ' ').trim()
}

/**
 * translates a pedal from an AT to a diplomatic pedal
 *
 * @returns the dt:pedal element
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} pedal - Input object used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticPedal (annotElem, pedal, bbox) {
  pedal.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
  pedal.setAttribute('y', bbox.mm.y)
  pedal.setAttribute('staff', annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0])
  pedal.setAttribute('dir', annotElem.getAttribute('dir'))
}

/**
 * translates an octave from an AT to a diplomatic octave
 *
 * @returns the dt:octave element
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} octave - Input object used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticOctave (annotElem, octave, bbox) {
  octave.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
  octave.setAttribute('y', bbox.mm.y)
  octave.setAttribute('width', (parseFloat(bbox.mm.w)).toFixed(1))
  octave.setAttribute('staff', annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0])
  octave.setAttribute('dis', annotElem.getAttribute('dis'))
  octave.setAttribute('dis.place', annotElem.getAttribute('dis.place'))
  if (octave.hasAttribute('extender')) {
    octave.setAttribute('extender', annotElem.getAttribute('extender'))
  }
}

/**
 * translates a fermata from an AT to a diplomatic fermata
 *
 * @returns the dt:fermata element
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} fermata - Input object used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticFermata (annotElem, fermata, bbox) {
  fermata.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
  fermata.setAttribute('y', bbox.mm.y)
  fermata.setAttribute('staff', annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0])
  fermata.setAttribute('form', annotElem.getAttribute('form'))
}

/**
 * translates a trill from an annotated note to a diplomatic trill
 *
 * @returns the dt:trill element
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} trill - Input object used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticTrill (annotElem, trill, bbox) {
  trill.setAttribute('x', +bbox.mm.x.toFixed(1))
  trill.setAttribute('y', +bbox.mm.y.toFixed(1))
  trill.setAttribute('staff', annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0])
}

/**
 * generates a diplomatic hairpin
 *
 * @returns the dt:dir element
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} hairpin - Input object used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticHairpin (annotElem, hairpin, bbox) {
  hairpin.setAttribute('form', annotElem.getAttribute('form') || 'cres')

  const centerY = (bbox.mm.y + bbox.mm.h / 2).toFixed(1)
  const opening = bbox.mm.h.toFixed(1)
  hairpin.setAttribute('staff', annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0])
  hairpin.removeAttribute('x')
  hairpin.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
  hairpin.setAttribute('y', centerY)
  hairpin.setAttribute('x2', (parseFloat(bbox.mm.x) + parseFloat(bbox.mm.w)).toFixed(1))
  hairpin.setAttribute('y2', centerY)
  hairpin.setAttribute('opening', opening)
  hairpin.setAttribute('bw:start.opening', 0)
}

/**
 * translates a chord to a diplomatic chord
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} chord - Input object used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticChord (annotElem, chord) {
  // console.log(472, ' entering ', annotElem, chord)

  // chords will probably incorrectly point from a note to the diplomatic chord
  const correspPrefix = annotElem.getAttribute('corresp') || annotElem.querySelector('*[corresp]').getAttribute('corresp')
  const correspPath = correspPrefix.split('#')[0] + '#'
  annotElem.setAttribute('corresp', correspPath + chord.getAttribute('xml:id'))

  let dur = annotElem.getAttribute('dur')
  const durs = annotElem.querySelectorAll('*[dur]')
  for (const d of durs) {
    console.log(563, 'getDiplomaticChord(): checking duration in chord', d, annotElem)
    if (!dur) {
      dur = d.getAttribute('dur')
    } else if (d.hasAttribute('dur') && d.getAttribute('dur') !== dur) {
      console.warn(563, 'getDiplomaticChord(): inconsistent duration in chord!', annotElem)
    }
  }
  chord.setAttribute('dur', dur)
  console.log(563, 'getDiplomaticChord(): setting duration', dur)
  // annotElem is the chord element. If stem.dir is not set here, stemdir will be null
  let stemdir = annotElem.getAttribute('stem.dir')
  const notes = annotElem.querySelectorAll('note')
  notes.forEach((note, i) => {
    const diploNote = document.createElementNS('http://www.music-encoding.org/ns/mei', 'note')
    diploNote.setAttribute('xml:id', 'd' + uuid())
    if (!note.hasAttribute('dur')) {
      // set duration if not set
      note.setAttribute('dur', dur)
    }
    getDiplomaticNote(note, diploNote)
    note.setAttribute('corresp', correspPath + diploNote.getAttribute('xml:id'))
    chord.append(diploNote)
    // if stem.dir is not set in chord element look into notes
    if (stemdir !== 'up' && stemdir !== 'down' && note.hasAttribute('stem.dir')) {
      stemdir = note.getAttribute('stem.dir')
    }
    /*
    if (i === 0 && !annotElem.hasAttribute('stem.dir')) {
      chord.setAttribute('stem.dir', note.getAttribute('stem.dir'))
    } else if (annotElem.hasAttribute('stem.dir')) {
      chord.setAttribute('stem.dir', annotElem.getAttribute('stem.dir'))
    }
    */
    diploNote.removeAttribute('stem.dir')
  })

  if (stemdir === 'up' || stemdir === 'down') {
    chord.setAttribute('stem.dir', stemdir)
  }
  // console.log(472, annotElem, chord)
}

/**
 * Maps annotated diplomatic key accid data to diplomatic transcription output.
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {string} keyAccid - Identifier for the target element.
 * @returns {void} No return value.
 */
function getDiplomaticKeyAccid (annotElem, keyAccid) {
  const loc = annotElem.getAttribute('loc')
  console.log('keyAccid:', loc)
  keyAccid.setAttribute('loc', loc)
  console.log('getDiplomaticKeysig', annotElem, keyAccid)
}

/**
 * Maps annotated diplomatic metersig data to diplomatic transcription output.
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} metersig - Input object used by this function.
 * @param {Object} options3 - Structured options object.
 * @returns {void} No return value.
 */
function getDiplomaticMetersig (annotElem, metersig, { count, unit }) {
  console.log('getDiplomaticMetersig', annotElem, metersig, count, unit)
  if (count && unit) {
    metersig.setAttribute('count', count)
    metersig.setAttribute('unit', unit)
  } else {
    console.warn('WARNING: Could not determine count or unit for metersig', annotElem, metersig)
  }
}

/**
 * Maps annotated diplomatic clef data to diplomatic transcription output.
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} clef - Input object used by this function.
 * @param {Element} annotElementClef - Element processed by this function.
 * @returns {void} No return value.
 */
function getDiplomaticClef (annotElem, clef, annotElementClef) {
  const { shape, line } = annotElementClef || { shape: annotElem.getAttribute('shape'), line: annotElem.getAttribute('line') }
  console.log('getDiplomaticClef', annotElem, clef, shape, line)
  clef.setAttribute('shape', shape)
  clef.setAttribute('line', line)
}

/**
 * Maps annotated diplomatic curve data to diplomatic transcription output.
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Element} curve - Element processed by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticCurve (annotElem, curve, bbox) {
  const bboxbezier = boundingboxDefaultControlpoints(bbox, annotElem.getAttribute('curvedir') === 'above')
  curve.removeAttribute('x')
  console.log('getDiplomaticCurve', annotElem, curve, bboxbezier, bbox)
  let staff
  if (annotElem.hasAttribute('staff')) {
    staff = annotElem.getAttribute('staff').replace(/\s+/g, ' ').trim().split(' ')[0]
  } else if (annotElem.closest('staff')) {
    staff = annotElem.closest('staff').getAttribute('n')
  } else if (annotElem.hasAttribute('startid')) {
    const startElem = annotElem.closest('mei').querySelector('*[*|id="' + annotElem.getAttribute('startid').substring(1) + '"]')
    if (startElem && startElem.closest('staff')) {
      staff = startElem.closest('staff').getAttribute('n')
    } else {
      console.warn('WARNING: Could not determine staff for curve', annotElem, startElem)
    }
  } else {
    staff = 1
  }
  curve.setAttribute('staff', staff)
  curve.setAttribute('bezier', bboxbezier.map(c => c.toFixed(2)).join(' '))
}

/**
 * generates a pitch clarification letter for the given annotated element
 *
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} metaMark - Input object used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getPitchClarificationLetter (annotElem, metaMark, bbox) {
  try {
    metaMark.setAttribute('function', 'clarification')
    metaMark.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
    metaMark.setAttribute('width', (parseFloat(bbox.mm.w)).toFixed(1))
    metaMark.setAttribute('y', bbox.mm.y)
    const staff = annotElem.closest('staff').getAttribute('n')
    metaMark.setAttribute('staff', staff)

    const pname = annotElem.getAttribute('pname')
    if (pname) {
      const label = pname === 'b' ? 'h' : pname
      metaMark.innerHTML = label
    }
  } catch (err) {
    console.warn('WARNING: Could not properly generate pitch clarification letter for ' + annotElem, err)
  }
}

/**
 * translates a syllable from an annotated transcript to a diplomatic word
 *
 * @returns the dt:word element
 * @param {Element} annotElem - Element processed by this function.
 * @param {Object} word - Input object used by this function.
 * @param {number} bbox - Numeric input used by this function.
 * @returns {void} No return value.
 */
function getDiplomaticWord (annotElem, word, bbox) {
  word.setAttribute('x', (parseFloat(bbox.mm.x)).toFixed(1))
  word.setAttribute('width', (parseFloat(bbox.mm.w)).toFixed(1))
  word.setAttribute('y', bbox.mm.y)
  word.setAttribute('staff', annotElem.closest('staff').getAttribute('n'))
  word.innerHTML = annotElem.innerHTML.replace(/\s+/g, ' ').trim()
}

/**
 * Returns loc attribute from the current data context.
 *
 * @param {Element} annotElem - Element processed by this function.
 * @returns {Object} Resulting object.
 */
function getLocAttribute (annotElem) {
  if (!annotElem) {
    console.warn('WARNING: no proper annotElem provided to calculate @loc', annotElem)
    return 5
  }
  if (annotElem.localName === 'rest') {
    return 5
  }
  try {
    let staffN = annotElem.closest('staff').getAttribute('n')
    // TODO do we need other?
    if (annotElem.hasAttribute('staff')) {
      staffN = annotElem.getAttribute('staff')
    }
    if (!staffN) {
      console.warn('WARNING: Could not determine staff number for ' + annotElem)
    }
    const clefs = [...annotElem.closest('music').querySelectorAll('staff[n="' + staffN + '"] clef, staffDef[n="' + staffN + '"] clef, staffDef[n="' + staffN + '"][clef\\.line], *[*|id="' + annotElem.getAttribute('xml:id') + '"]')]
    clefs.sort((a, b) => {
      if (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1
      } else {
        return 1
      }
    })

    const annotIndex = clefs.indexOf(annotElem)
    const lastClef = clefs[annotIndex - 1]

    if (!lastClef) {
      console.warn('WARNING: Could not determine last clef for ' + annotElem)
    }

    const clefShape = lastClef.hasAttribute('clef.shape') ? lastClef.getAttribute('clef.shape') : lastClef.getAttribute('shape')
    const clefLine = lastClef.hasAttribute('clef.line') ? lastClef.getAttribute('clef.line') : lastClef.getAttribute('line')
    // const clefDis = lastClef.hasAttribute('clef.dis') ? lastClef.getAttribute('clef.dis') : lastClef.getAttribute('dis')

    const pitches = ['c', 'd', 'e', 'f', 'g', 'a', 'b']
    const pitchValue = pitches.indexOf(annotElem.getAttribute('pname'))
    const octaveValue = parseInt(annotElem.getAttribute('oct'))

    let loc = 4

    if (clefShape === 'G' && clefLine === '2') {
      loc = (octaveValue - 4) * 7 + pitchValue - 2
    } else if (clefShape === 'F' && clefLine === '4') {
      loc = (octaveValue - 3) * 7 + pitchValue + 3
    } else if (clefShape === 'C' && clefLine === '3') {
      loc = (octaveValue - 4) * 7 + pitchValue
    }

    // F4 in treble should be 1: (4-4) * 7 + 3 - 2
    // C4 in treble should be -2: (4-4) * 7 + 0 - 2
    // B3 in treble should be -3: (3-4) * 7 + 6 - 2

    // B3 in bass clef should be 9: (3-3) * 7 + 6 + 3
    // C3 in bass clef should be 3: (3-3) * 7 + 0 + 3
    // G2 in bass clef should be 0: (2-3) * 7 + 4 + 3

    return loc
  } catch (err) {
    console.warn('WARNING: Could not properly retrieve the @loc attribute for ' + annotElem + ' ' + annotElem.getAttribute('xml:id'), err)
    return 5
  }
}

/**
 * takes a template for diplomatic transcriptions and initializes it by generating IDs
 *
 * @returns the initialized template
 * @param {string} filename - String input used by this function.
 * @param {Object} wzObj - Writing-zone metadata for the current page region.
 * @param {string} surfaceId - String input used by this function.
 * @param {string} appVersion - String input used by this function.
 * @param {Object} affectedStaves - List of affected staff identifiers.
 * @param {number} systemcount - Numeric input used by this function.
 * @returns {Promise<unknown>} Promise resolving to the computed result.
 */
export async function initializeDiploTrans (filename, wzObj, surfaceId, appVersion, affectedStaves, systemcount) {
  /*
  key words in the (former) template
  APP-VERSION
  CURRENT-DATE
  FILEPATH
  GENDESCWZ-ID
  NEW-ID
  SURFACE-ID
  */
  // console.log('881---------------------> ', affectedStaves, systemcount)
  const genDescWzId = wzObj.id
  const diploTemplate = await fetch('../assets/diplomaticTranscriptTemplate.xml')
    .then(response => response.text())
    .then(xmlString => parser.parseFromString(xmlString, 'application/xml'))

  diploTemplate.getElementsByTagNameNS('*', 'draft')[0].childNodes.forEach(node => {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove()
    }
  })

  diploTemplate.querySelectorAll('*[*|id]').forEach(elem => {
    if (elem.getAttribute('xml:id') === '%NEW-ID%') {
      const id = elem.localName.substring(0, 1) + uuid()
      elem.setAttribute('xml:id', id)
    }
  })

  const date = new Date().toISOString().split('T')[0]
  const datePlaceholder = '%CURRENT-DATE%'
  diploTemplate.querySelectorAll('change').forEach(change => {
    if (change.getAttribute('isodate') === datePlaceholder) {
      change.setAttribute('isodate', date)
    }
  })

  diploTemplate.querySelector('application').setAttribute('version', appVersion)

  diploTemplate.querySelector('source').setAttribute('target', '../' + filename + '#' + genDescWzId)
  const pb = diploTemplate.querySelector('pb')
  pb.setAttribute('target', '../' + filename + '#' + surfaceId)
  const draft = diploTemplate.getElementsByTagNameNS('*', 'draft')[0]

  let system = null
  let section = null
  affectedStaves.forEach((obj, i) => {
    // TODO: explicit mapping!
    if (i % systemcount === 0) {
      system = document.createElementNS('https://beethovens-werkstatt.de/ns/meiAdditions', 'system')
      draft.append(system)
      system.setAttribute('xml:id', 's' + uuid())

      const scoreDef = document.createElementNS('http://www.music-encoding.org/ns/mei', 'scoreDef')
      scoreDef.setAttribute('xml:id', 's' + uuid())
      system.append(scoreDef)

      const staffGrp = document.createElementNS('http://www.music-encoding.org/ns/mei', 'staffGrp')
      staffGrp.setAttribute('xml:id', 's' + uuid())
      staffGrp.setAttribute('symbol', 'none')
      staffGrp.setAttribute('bar.thru', 'false')
      scoreDef.append(staffGrp)

      section = document.createElementNS('http://www.music-encoding.org/ns/mei', 'section')
      system.append(section)
      section.setAttribute('xml:id', 's' + uuid())

      for (let j = 0; j < systemcount; j++) {
        const staffDef = document.createElementNS('http://www.music-encoding.org/ns/mei', 'staffDef')
        staffDef.setAttribute('xml:id', 's' + uuid())
        staffDef.setAttribute('n', (j + 1))
        staffDef.setAttribute('lines', 5)
        staffDef.setAttribute('decls', '../' + filename + '#' + affectedStaves[i + j].rastrum.id)
        staffGrp.append(staffDef)

        const staff = document.createElementNS('http://www.music-encoding.org/ns/mei', 'staff')
        staff.setAttribute('n', (j + 1))
        staff.setAttribute('xml:id', 's' + uuid())
        section.append(staff)

        const layer = document.createElementNS('http://www.music-encoding.org/ns/mei', 'layer')
        layer.setAttribute('n', 1)
        layer.setAttribute('xml:id', 'l' + uuid())
        staff.append(layer)
      }
    }
  })

  // add join attributes to connect multiple accolades
  const sections = diploTemplate.querySelectorAll('section')
  if (sections.length > 1) {
    sections.forEach((section, i) => {
      const otherSectionIds = Array.from(sections)
        .filter((s, j) => j !== i)
        .map(s => '#' + s.getAttribute('xml:id'))

      section.setAttribute('join', otherSectionIds.join(' '))
    })
  }

  return diploTemplate
}

/**
 * generates an MEI that will render empty rastrums for a given page
 *
 * @returns the MEI document containing the empty rastrums
 * @param {Object} mei - Input object used by this function.
 * @param {string} surfaceId - String input used by this function.
 * @returns {Promise<number>} Promise resolving to the computed result.
 */
export async function getEmptyPage (mei, surfaceId) {
  if (!mei || !surfaceId) {
    return null
  }

  const defaultFactor = 9

  const template = await fetch('../assets/emptyPageTemplate.xml')
    .then(response => response.text())
    .then(xmlString => parser.parseFromString(xmlString, 'application/xml'))

  const surface = [...mei.querySelectorAll('surface')].find(s => s.getAttribute('xml:id') === surfaceId)
  const layout = [...mei.querySelectorAll('layout')].find(l => '#' + l.getAttribute('xml:id') === surface.getAttribute('decls'))

  // retrieve correct folium / bifolium
  const folium = [...mei.querySelectorAll('foliaDesc *')].find(f => {
    if (f.getAttribute('outer.recto') === '#' + surfaceId) {
      return true
    }
    if (f.getAttribute('inner.verso') === '#' + surfaceId) {
      return true
    }
    if (f.getAttribute('inner.recto') === '#' + surfaceId) {
      return true
    }
    if (f.getAttribute('outer.verso') === '#' + surfaceId) {
      return true
    }
    if (f.getAttribute('recto') === '#' + surfaceId) {
      return true
    }
    if (f.getAttribute('verso') === '#' + surfaceId) {
      return true
    }
    return false
  })

  const outSurface = template.querySelector('surface')

  // properly set page dimensions
  outSurface.setAttribute('lry', parseFloat(folium.getAttribute('height') * defaultFactor))
  outSurface.setAttribute('lrx', parseFloat(folium.getAttribute('width') * defaultFactor))

  /**
   * Appends new element.
   *
   * @param {Element} parent - Element processed by this function.
   * @param {string} name - String input used by this function.
   * @param {string} ns - String input used by this function.
   * @returns {void} No return value.
   */
  const appendNewElement = (parent, name, ns = 'http://www.music-encoding.org/ns/mei') => {
    const elem = parent.appendChild(document.createElementNS(ns, name))
    if (ns === 'http://www.w3.org/2000/svg') {
      elem.setAttribute('id', 's' + uuid())
    } else {
      elem.setAttribute('xml:id', 'x' + uuid())
    }
    return elem
  }
  const staffGrp = template.querySelector('staffGrp')
  const section = template.querySelector('section')

  const pbZone = appendNewElement(outSurface, 'zone')
  pbZone.setAttribute('type', 'pb')
  pbZone.setAttribute('ulx', '0')
  pbZone.setAttribute('uly', '0')
  pbZone.setAttribute('lrx', parseFloat(folium.getAttribute('width') * defaultFactor))
  pbZone.setAttribute('lry', parseFloat(folium.getAttribute('height') * defaultFactor))

  const pb = appendNewElement(section, 'pb')
  pb.setAttribute('facs', '#' + pbZone.getAttribute('xml:id'))

  layout.querySelectorAll('rastrum').forEach((rastrum, i) => {
    const staffDef = appendNewElement(staffGrp, 'staffDef')
    staffDef.setAttribute('n', i + 1)
    staffDef.setAttribute('lines', 5)
    const scale = (100 / 72 * parseFloat(rastrum.getAttribute('system.height')) * defaultFactor).toFixed(1) + '%'
    staffDef.setAttribute('scale', scale)

    const sbZone = appendNewElement(outSurface, 'zone')
    sbZone.setAttribute('type', 'sb')
    sbZone.setAttribute('ulx', parseFloat(rastrum.getAttribute('system.leftmar') * defaultFactor))
    sbZone.setAttribute('uly', parseFloat(rastrum.getAttribute('system.topmar') * defaultFactor))

    const sb = appendNewElement(section, 'sb')
    sb.setAttribute('facs', '#' + sbZone.getAttribute('xml:id'))

    const measureZone = appendNewElement(outSurface, 'zone')
    measureZone.setAttribute('type', 'measure')
    measureZone.setAttribute('ulx', parseFloat(rastrum.getAttribute('system.leftmar') * defaultFactor))
    measureZone.setAttribute('lrx', (parseFloat(rastrum.getAttribute('system.leftmar')) + parseFloat(rastrum.getAttribute('width'))) * defaultFactor)

    const measure = appendNewElement(section, 'measure')
    measure.setAttribute('facs', '#' + measureZone.getAttribute('xml:id'))

    const staffZone = appendNewElement(outSurface, 'zone')
    staffZone.setAttribute('type', 'staff')
    staffZone.setAttribute('uly', parseFloat(rastrum.getAttribute('system.topmar')) * defaultFactor)

    const staff = appendNewElement(measure, 'staff')
    staff.setAttribute('facs', '#' + staffZone.getAttribute('xml:id'))
    staff.setAttribute('rotate', rastrum.getAttribute('rotate'))

    const layer = appendNewElement(staff, 'layer')
    layer.setAttribute('n', 1)
  })

  return template
}

/**
 * Initializes page if necessary.
 *
 * @param {Object} page - Input object used by this function.
 * @param {number} height - Numeric input used by this function.
 * @returns {void} No return value.
 */
export function initializePageIfNecessary (page, height) {
  const hasScoreDef = page.querySelector('score')
  if (hasScoreDef === null) {
    const scale = (100 / 80 * height).toFixed(1) + '%'

    const score = document.createElementNS('http://www.music-encoding.org/ns/mei', 'score')
    const scoreDef = document.createElementNS('http://www.music-encoding.org/ns/mei', 'scoreDef')
    const staffGrp = document.createElementNS('http://www.music-encoding.org/ns/mei', 'staffGrp')
    const staffDef = document.createElementNS('http://www.music-encoding.org/ns/mei', 'staffDef')
    score.append(document.createTextNode('\n    '))
    score.append(scoreDef)
    score.append(document.createTextNode('\n  '))
    scoreDef.append(document.createTextNode('\n      '))
    scoreDef.append(staffGrp)
    scoreDef.append(document.createTextNode('\n    '))
    staffGrp.append(document.createTextNode('\n        '))
    staffGrp.setAttribute('symbol', 'none')
    staffGrp.append(staffDef)
    staffGrp.append(document.createTextNode('\n      '))
    staffDef.setAttribute('xml:id', 'a' + uuid())
    staffDef.setAttribute('n', 1)
    staffDef.setAttribute('lines', 5)
    staffDef.setAttribute('scale', scale)
    page.prepend(score)
    page.prepend(document.createTextNode('\n  '))
  }

  const hasSecB = page.querySelector('secb')
  if (hasSecB === null) {
    const secb = document.createElementNS('http://www.music-encoding.org/ns/mei', 'secb')
    secb.setAttribute('xml:id', 's' + uuid())
    page.prepend(secb)
    page.prepend('\n  ')
  }

  const hasMdivB = page.querySelector('mdivb')
  if (hasMdivB === null) {
    const mdivb = document.createElementNS('http://www.music-encoding.org/ns/mei', 'mdivb')
    mdivb.setAttribute('xml:id', 'm' + uuid())
    page.prepend(mdivb)
    page.prepend('\n  ')
  }
}

/**
 * Generates system from rect.
 *
 * @param {number} uly - Numeric input used by this function.
 * @param {number} left - Numeric input used by this function.
 * @param {number} right - Numeric input used by this function.
 * @returns {number} Resulting numeric value.
 */
export function generateSystemFromRect (uly, left, right) {
  const system = document.createElementNS('http://www.music-encoding.org/ns/mei', 'system')
  const measure = document.createElementNS('http://www.music-encoding.org/ns/mei', 'measure')
  const staff = document.createElementNS('http://www.music-encoding.org/ns/mei', 'staff')
  const layer = document.createElementNS('http://www.music-encoding.org/ns/mei', 'layer')

  /* <system system.leftmar="0" system.rightmar="0" uly="2711">
                        <measure x="290" x2="3323" n="1">
                                  <staff n="1" coord.y1="2416">
  */
  system.setAttribute('system.leftmar', 0)
  system.setAttribute('system.rightmar', 0)
  system.append(document.createTextNode('\n    '))
  system.append(measure)
  system.append(document.createTextNode('\n  '))
  measure.setAttribute('x', left)
  measure.setAttribute('x2', right)
  measure.setAttribute('n', 1)
  measure.append(document.createTextNode('\n      '))
  measure.append(staff)
  measure.append(document.createTextNode('\n    '))
  staff.setAttribute('n', 1)
  staff.setAttribute('coord.y1', uly)
  staff.append(document.createTextNode('\n        '))
  staff.append(layer)
  staff.append(document.createTextNode('\n      '))
  layer.setAttribute('n', 1)

  return system
}

/**
 * Inserts system.
 *
 * @param {Object} page - Input object used by this function.
 * @param {number} system - Numeric input used by this function.
 * @param {number} followingSystem - Numeric input used by this function.
 * @returns {void} No return value.
 */
export function insertSystem (page, system, followingSystem) {
  const where = (followingSystem === null || followingSystem === undefined) ? null : followingSystem.previousSibling
  page.insertBefore(document.createTextNode('\n  '), where)
  page.insertBefore(system, where)
  page.insertBefore(document.createTextNode('\n'), where)
}

/**
 * checks if SVG has grouped unassigned shapes already. Used during import.
 *
 * @param {SVGElement|Document} svg - Source document used by this function.
 * @returns {Object} Result value.
 */
export function verifyUnassignedGroupInSvg (svg) {
  // JPV: svg is XMLDocument now
  const children = [...svg.documentElement.children]

  const unassignedShapes = []
  children.forEach(elem => {
    if (elem.localName === 'path') {
      unassignedShapes.push(elem)
    }
  })

  const outSvg = svg.cloneNode(true)

  if (unassignedShapes.length === 0) {
    // console.log('INFO no shapes to move')
    return outSvg
  }

  const existingGroup = svg.querySelector('g[class="unassigned"]')

  let g

  if (existingGroup) {
    g = existingGroup
  } else {
    g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', 'unassigned')
  }

  unassignedShapes.forEach(path => {
    g.append(path)
  })

  outSvg.append(g)

  return outSvg
}

/**
 * converts rectangles between mm and px units
 *
 * @param {Document} dom - Source document used by this function.
 * @param {string} surfaceId - String input used by this function.
 * @param {number} xywh - Numeric input used by this function.
 * @param {string} dir - String input used by this function.
 * @param {Function} getters - Callback invoked by this function.
 * @returns {Object} Result value.
 */
export function convertRectUnits (dom, surfaceId, xywh, dir, getters) {
  if (dir !== 'px2mm' && dir !== 'mm2px') {
    console.log('Failed to provide proper translation direction on ' + surfaceId + ' for dir "' + dir + '". Rect: ', xywh)
    return false
  }

  const surface = dom.querySelector('surface[*|id="' + surfaceId + '"]')
  const graphic = surface.querySelector('graphic[type="facsimile"]')

  const xywhParam = graphic.getAttribute('target').split('#xywh=')[1]

  if (!xywhParam) {
    console.error('Surface ' + surfaceId + ' has apparently no media fragment identifier for determining the size of the actual page in that scan. Unable to calculate a proper factor between pixel and mm dimensions.')
    return false
  }

  const pxOffsetX = parseFloat(xywhParam.split(',')[0])
  const pxOffsetY = parseFloat(xywhParam.split(',')[1])
  // const pageWidthPx = xywhParam.split(',')[2]
  // const pageHeightPx = xywhParam.split(',')[3]

  /* const folium = [...dom.querySelectorAll('foliaDesc *')].find(foliumLike => {
    if (foliumLike.getAttribute('outer.recto') === '#' + surfaceId) {
      return true
    }
    if (foliumLike.getAttribute('inner.verso') === '#' + surfaceId) {
      return true
    }
    if (foliumLike.getAttribute('inner.recto') === '#' + surfaceId) {
      return true
    }
    if (foliumLike.getAttribute('outer.verso') === '#' + surfaceId) {
      return true
    }
    if (foliumLike.getAttribute('recto') === '#' + surfaceId) {
      return true
    }
    if (foliumLike.getAttribute('verso') === '#' + surfaceId) {
      return true
    }
    return false
  })
  */

  // const pageWidthMm = folium.getAttribute('width')
  // const pageHeightMm = folium.getAttribute('height')

  // const scaleFactorHeight = pageHeightMm / pageHeightPx
  // const scaleFactorWidth = pageWidthMm / pageWidthPx

  const pageIndex = getters.currentPageZeroBased
  const path = getters.filepath
  const pages = getters.documentPagesForSidebars(path)
  const page = pages[pageIndex]

  if (!page) {
    return null
  }
  // console.log('page: ', page)
  const rects = getOsdRects(page)
  // console.log('rects: ', rects)

  const ratio = 1 / parseFloat(rects.ratio)

  /* // DEBUG
  console.log('pageHeightMm: ' + pageHeightMm)
  console.log('pageHeightPx: ' + pageHeightPx)
  console.log('pageWidthMm: ' + pageWidthMm)
  console.log('pageWidthPx: ' + pageWidthPx)
  console.log('pxOffsetX: ' + pxOffsetX)
  console.log('pxOffsetY: ' + pxOffsetY)
  console.log('scaleFactors width=' + scaleFactorWidth + ' | height=' + scaleFactorHeight)
  */

  if (dir === 'px2mm') {
    const rect = {}
    rect.x = parseFloat(((xywh.x - pxOffsetX) * ratio).toFixed(2))
    rect.y = parseFloat(((xywh.y - pxOffsetY) * ratio).toFixed(2))
    rect.w = parseFloat((xywh.w * ratio).toFixed(2))
    rect.h = parseFloat((xywh.h * ratio).toFixed(2))

    return rect
  } else {
    const rect = {}
    rect.x = Math.round((xywh.x / ratio) + pxOffsetX)
    rect.y = Math.round((xywh.y / ratio) + pxOffsetY)
    rect.w = Math.round(xywh.w / ratio)
    rect.h = Math.round(xywh.h / ratio)

    return rect
  }
}

/**
 * sorts the rastrum elements inside a given rastrumDesc
 *
 * @param {Element} rastrumDesc - Element processed by this function.
 * @returns {Object} Result value.
 */
export function sortRastrumsByVerticalPosition (rastrumDesc) {
  const rastrums = [...rastrumDesc.querySelectorAll('rastrum')]

  /**
   * Sorts func.
   *
   * @param {Object} a - Input object used by this function.
   * @param {Object} b - Input object used by this function.
   * @returns {void} No return value.
   */
  const sortFunc = (a, b) => {
    const aY = parseFloat(a.getAttribute('system.topmar'))
    const bY = parseFloat(b.getAttribute('system.topmar'))

    return aY - bY
  }

  const reordered = rastrums.sort(sortFunc)
  reordered.forEach(rastrum => rastrumDesc.append(rastrum))
}

/**
 * Processes new element for this operation.
 *
 * @param {Element} parent - Element processed by this function.
 * @param {string} name - String input used by this function.
 * @param {string} ns - String input used by this function.
 * @returns {void} No return value.
 */
export const appendNewElement = (parent, name, ns = 'http://www.music-encoding.org/ns/mei') => {
  // Get the document from the parent element's ownerDocument
  const doc = parent.ownerDocument || parent
  const elem = parent.appendChild(doc.createElementNS(ns, name))
  if (ns === 'http://www.w3.org/2000/svg') {
    elem.setAttribute('id', 's' + uuid())
  } else {
    elem.setAttribute('xml:id', 'x' + uuid())
  }
  return elem
}

/**
 * adds indicators for system begins to the MEI, using dir elements
 *
 * @param {string} meiDom - String input used by this function.
 * @returns {Object} Resulting object.
 */
export const addSbIndicators = (meiDom) => {
  const sbs = meiDom.querySelectorAll('sb')

  /**
   * Returns measure from the current data context.
   *
   * @param {Element} node - Element processed by this function.
   * @returns {Object} Resulting object.
   */
  const getMeasure = (node) => {
    let sibling = node.nextElementSibling
    while (sibling) {
      if (sibling.localName === 'measure') {
        return sibling
      }
      sibling = sibling.nextElementSibling
    }
    return null
  }

  sbs.forEach((sb, i) => {
    if (i > 0) {
      const measure = getMeasure(sb)
      if (measure) {
        const dir = document.createElementNS('http://www.music-encoding.org/ns/mei', 'dir')
        const pb = sb.previousElementSibling.localName === 'pb'
        dir.innerHTML = pb ? '⫪' : '⊤3'
        dir.setAttribute('staff', 1)
        dir.setAttribute('tstamp', 0)
        dir.setAttribute('place', 'above')
        const classes = pb ? 'pb sb unselectable' : 'sb unselectable'
        dir.setAttribute('type', classes)
        dir.setAttribute('xml:id', 'dir_' + sb.getAttribute('xml:id'))
        measure.append(dir)
      }
    }
  })

  return meiDom
}

/* export const appendNewElement = (parent, name, ns = 'http://www.music-encoding.org/ns/mei') => {
  const elem = parent.appendChild(document.createElementNS(ns, name))
  if (ns === 'http://www.w3.org/2000/svg') {
    elem.setAttribute('id', 's' + uuid())
  } else {
    elem.setAttribute('xml:id', 'x' + uuid())
  }
  return elem
} */

/*
function convertDiploTransEvent (event) {
  const name = event.localName

  if (name === 'note') {
    getRenderableDiplomaticNote(event)
  }

  return event
}
*/
/*
function getRenderableDiplomaticNote (note) {
  const headshape = note.getAttribute('head.shape')
  let dur = 4
  if (headshape === 'whole') {
    dur = 1
  } else if (headshape === 'half') {
    dur = 2
  }

  // TODO DIPLOTRANS: Wie mit kürzeren Notenwerten umgehen? überhaupt wichtig?
  note.setAttribute('dur', dur)
}
*/

/**
 * Converts a diplomatic transcription into a renderable MEI, tailored towards the Thulemeier library
 * This function merges information from the source MEI file into the diplomatic transcript to create
 * a complete document that includes facsimile data, physical description, and genetic order hierarchy.
 *
 * @param {Object} params - Parameters object
 * @param {Document} params.dtDom - The diplomatic transcript MEI document
 * @param {Document} params.sourceDom - The source MEI document (parent manuscript file)
 * @returns {Document|null} The prepared MEI document ready for Thulemeier rendering, or null if inputs are missing
 */
export function prepareDtForThulemeier ({ dtDom, sourceDom }) {
  if (!dtDom || !sourceDom) {
    console.warn('prepareDtForThulemeier: missing input - dtDom or sourceDom is null')
    return null
  }

  // Clone the diplomatic transcript to avoid modifying the original
  const outDom = dtDom.cloneNode(true)

  try {
    // Extract the writing zone reference from the DT's source element
    const sourceElem = dtDom.querySelector('source')
    if (!sourceElem) {
      console.error('prepareDtForThulemeier: No source element found in dtDom')
      return null
    }
    const targetAttr = sourceElem.getAttribute('target')
    if (!targetAttr) {
      console.error('prepareDtForThulemeier: source element has no target attribute')
      return null
    }
    const writingZoneGenDescId = targetAttr.split('#')[1]

    // Use getElementByIdNS or querySelector with proper namespace handling
    const writingZoneGenDesc = sourceDom.getElementById(writingZoneGenDescId) ||
      sourceDom.querySelector(`genDesc[xml\\:id="${writingZoneGenDescId}"]`) ||
      sourceDom.querySelector(`[*|id="${writingZoneGenDescId}"]`)

    if (!writingZoneGenDesc) {
      console.error(`prepareDtForThulemeier: No genDesc found with id="${writingZoneGenDescId}" in sourceDom`)
      return null
    }

    const surfaceGenDesc = writingZoneGenDesc.parentNode
    const surfaceId = surfaceGenDesc.getAttribute('corresp').substring(1)
    const surface = sourceDom.getElementById(surfaceId) ||
      sourceDom.querySelector(`surface[xml\\:id="${surfaceId}"]`) ||
      sourceDom.querySelector(`[*|id="${surfaceId}"]`)

    if (!surface) {
      console.error(`prepareDtForThulemeier: No surface found with id="${surfaceId}"`)
      return null
    }

    // Find the layout information for this surface
    const layoutId = surface.getAttribute('decls').substring(1)
    const layout = sourceDom.getElementById(layoutId) ||
      sourceDom.querySelector(`layout[xml\\:id="${layoutId}"]`) ||
      sourceDom.querySelector(`[*|id="${layoutId}"]`)

    if (!layout) {
      console.error(`prepareDtForThulemeier: No layout found with id="${layoutId}"`)
      return null
    }

    // Find the folium (page) information that references this surface
    const foliumLike = sourceDom.querySelectorAll('foliaDesc *').values().find(f => {
      const ref = '#' + surface.getAttribute('xml:id')
      return f.getAttribute('recto') === ref || f.getAttribute('verso') === ref || f.getAttribute('outer.recto') === ref || f.getAttribute('inner.verso') === ref || f.getAttribute('inner.recto') === ref || f.getAttribute('outer.verso') === ref
    })
    if (!foliumLike) {
      console.error(`prepareDtForThulemeier: no folium found for surface ${surface.getAttribute('xml:id')}`)
      return null
    }

    // Add facsimile element with surface data
    const facsimile = appendNewElement(outDom.querySelector('music'), 'facsimile', 'http://www.music-encoding.org/ns/mei')
    facsimile.appendChild(surface.cloneNode(true))

    // Add manifestationList with physical description
    const manifestationList = appendNewElement(outDom.querySelector('meiHead'), 'manifestationList', 'http://www.music-encoding.org/ns/mei')
    const manifestation = appendNewElement(manifestationList, 'manifestation', 'http://www.music-encoding.org/ns/mei')
    const physDesc = appendNewElement(manifestation, 'physDesc', 'http://www.music-encoding.org/ns/mei')
    const foliaDesc = appendNewElement(physDesc, 'foliaDesc', 'http://www.music-encoding.org/ns/mei')
    foliaDesc.appendChild(foliumLike.cloneNode(true))

    const layoutDesc = appendNewElement(physDesc, 'layoutDesc', 'http://www.music-encoding.org/ns/mei')
    layoutDesc.appendChild(layout.cloneNode(true))

    // Reconstruct genetic order hierarchy
    const docGenDesc = appendNewElement(outDom.querySelector('music'), 'genDesc', 'http://www.music-encoding.org/ns/mei')
    docGenDesc.setAttribute('class', '#geneticOrder_documentLevel')
    docGenDesc.setAttribute('ordered', 'false')

    const emptySurfaceGenDesc = appendNewElement(docGenDesc, 'genDesc', 'http://www.music-encoding.org/ns/mei')
    emptySurfaceGenDesc.setAttribute('class', '#geneticOrder_pageLevel')
    emptySurfaceGenDesc.setAttribute('ordered', 'false')
    emptySurfaceGenDesc.setAttribute('corresp', '#' + surface.getAttribute('xml:id'))
    docGenDesc.appendChild(emptySurfaceGenDesc)
    emptySurfaceGenDesc.appendChild(writingZoneGenDesc.cloneNode(true))

    // Link the draft element to the source
    const sourceId = outDom.querySelector('source').getAttribute('xml:id')
    const draft = outDom.querySelector('draft')
    draft.setAttribute('decls', '#' + sourceId)
  } catch (err) {
    console.error('Error in prepareDtForThulemeier:', err)
    return null
  }

  return outDom
}
