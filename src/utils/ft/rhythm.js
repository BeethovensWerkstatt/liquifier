import { queryDirectChild, queryDirectChildren } from '../dom.js'
import {
  SVG_NS,
  getFadeStates,
  getTranslationShift,
  setPhaseEightOpacity
} from './phaseEight.js'
import {
  copyRegDefinitions,
  createChoice,
  findRhythmChoice,
  importRegElement,
  queueChoiceUnwrap,
  swapWholeEvent
} from './choices.js'
import { getContentContainer } from './regulation.js'

/**
 * Rhythm edits of notes, chords and rests, as they show up in the interventions phase.
 * A note or chord is not replaced as a whole: only the parts that depend on its rhythm
 * (flags, dots, a different notehead, a missing stem) are swapped, each in a choice group of
 * its own. Rests, and events whose parts cannot be paired, are replaced as a whole.
 */

/**
 * Regulates the rhythm of a rendered note, chord, rest or mRest in the interventions phase,
 * if its rhythm is edited in a `<choice>`. Must run once the animations of all elements exist.
 *
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @param {Element} element - Rendered note, chord, rest or mRest.
 * @param {Document} atMeiDom - Edited AT MEI DOM.
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
export function regulateRhythm (ftSvg, element, atMeiDom, tools) {
  const found = findRhythmChoice(element, atMeiDom, tools.atRegSvgDom, tools.logger)
  if (!found) return

  const className = (element.getAttribute('class') || '').split(/\s+/)
  const isChord = className.includes('chord')
  if (isChord || className.includes('note')) {
    const noteIds = []
    // With a pitch change, the whole note differs and keeps its choice markup.
    if (morphEventParts(element, found.regElement, isChord, !found.pitchChanged, noteIds, ftSvg, tools)) {
      if (!found.pitchChanged) queueChoiceUnwrap(tools, element, found.regId, noteIds)
      return
    }
  }

  swapWholeEvent(ftSvg, element, found, tools.atRegSvgDom, tools, tools.logger)
}

/**
 * Morphs a note or chord from its orig to its reg rhythm part by part, instead of
 * replacing it: glyphs that stay the same (typically noteheads) keep moving as before,
 * and only glyphs that actually differ (flags, dots, a different notehead, a missing
 * stem) are swapped. Each swap is a choice/orig/reg group of its own, so the
 * highlighting of choices reaches only what differs.
 *
 * @param {Element} element - Orig note or chord in the FT SVG.
 * @param {Element} regElement - Matching note or chord in the reg SVG.
 * @param {boolean} isChord - Whether the event is a chord.
 * @param {boolean} asChoice - Whether swapped parts get choice markup; false if the whole event is already in a choice.
 * @param {Array<Array<string>>} noteIds - Receives [orig id, reg id] pairs of the notes of a chord.
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @param {Object} tools - Animation helper bundle.
 * @returns {boolean} Whether the event could be morphed; if not, the caller replaces it.
 */
export function morphEventParts (element, regElement, isChord, asChoice, noteIds, ftSvg, tools) {
  const origParts = getEventParts(getContentContainer(element), isChord)
  const regParts = getEventParts(regElement, isChord)
  if (!origParts || !regParts || origParts.notes.length !== regParts.notes.length) return false

  const swap = (origPart, regPart, parent) => {
    if (origPart) setPhaseEightOpacity(origPart, false, tools)

    const choice = asChoice ? createChoice(ftSvg.ownerDocument, [], []) : null
    let variant = null
    if (regPart) {
      const copy = importRegElement(ftSvg, regPart)
      copyRegDefinitions(copy, ftSvg, tools.atRegSvgDom, tools.logger)

      // The copy is drawn at its reg position, so it has to make up for the shift its ancestors apply.
      const shift = getTranslationShift(parent, ftSvg)
      variant = choice ? queryDirectChild(choice, 'g.reg') : ftSvg.ownerDocument.createElementNS(SVG_NS, 'g')
      variant.setAttribute('transform', `translate(${-shift.x} ${-shift.y})`)
      variant.setAttribute('opacity', '0')
      variant.appendChild(copy)
      tools.setAnimation({ element: variant, states: getFadeStates(true) })
    }

    if (!choice) {
      if (variant) parent.insertBefore(variant, origPart ? origPart.nextSibling : null)
    } else if (origPart) {
      origPart.parentNode.insertBefore(choice, origPart)
      queryDirectChild(choice, 'g.orig').appendChild(origPart)
    } else {
      parent.appendChild(choice)
    }
  }

  origParts.notes.forEach((note, index) => {
    const regNote = regParts.notes[index]
    if (note.headGlyph !== regNote.headGlyph) swap(note.head, regNote.head, note.parent)
    if (note.id && regNote.id && note.id !== regNote.id) noteIds.push([note.id, regNote.id])
  })
  if (origParts.dotCount !== regParts.dotCount) swap(origParts.dots, regParts.dots, origParts.container)

  if (!origParts.stem || !regParts.stem) {
    swap(origParts.stem, regParts.stem, origParts.container)
  } else if (origParts.flagGlyph !== regParts.flagGlyph) {
    swap(origParts.flag, regParts.flag, origParts.stem)
  }

  return true
}

/**
 * Collects the parts of a note or chord that depend on its rhythm. A note is its own
 * single "note"; a chord has the noteheads of its notes, and one stem and dots group.
 *
 * @param {Element} container - Note or chord group (or its content wrapper).
 * @param {boolean} isChord - Whether the container is a chord.
 * @returns {Object|null} Parts, or null if the structure is not understood.
 */
function getEventParts (container, isChord) {
  const noteGroups = isChord ? queryDirectChildren(container, 'g.note') : [container]
  const notes = noteGroups.map(group => {
    const content = getContentContainer(group)
    const head = queryDirectChild(content, 'g.notehead')
    return { parent: content, id: isChord ? group.getAttribute('data-id') : null, head, headGlyph: getGlyphName(head) }
  })
  if (notes.length === 0 || notes.some(note => !note.head)) return null

  const dots = queryDirectChild(container, 'g.dots')
  const stem = queryDirectChild(container, 'g.stem')
  const flag = queryDirectChild(stem, 'g.flag')

  return {
    container,
    notes,
    dots,
    dotCount: dots ? dots.querySelectorAll('ellipse, circle, use').length : 0,
    stem,
    flag,
    flagGlyph: getGlyphName(flag)
  }
}

/**
 * Returns the SMuFL glyph of a part without the per-render suffix, e.g. "#E0A4-b1cpmcsz" -> "E0A4".
 *
 * @param {Element|null} part - Notehead, flag or other group that holds a glyph `<use>`.
 * @returns {string} Glyph name, or an empty string if the part has none.
 */
function getGlyphName (part) {
  const href = part?.querySelector('use')?.getAttribute('href') || ''
  return href.replace(/^#/, '').split('-')[0]
}
