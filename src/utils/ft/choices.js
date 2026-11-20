import { closestElement, queryDirectChild, removeElement } from '../dom.js'
import { alignPolygonWinding } from '../svgGeometry.js'
import {
  SVG_NS,
  findMatchingRegElement,
  getElementPosition,
  getFadeStates,
  getStaticThenRegStates,
  setPhaseEightOpacity,
  setPhaseEightPoints
} from './phaseEight.js'

/**
 * Helpers for editorial markup in the fluid transcript. Verovio renders a `<choice>` of the
 * edited AT as a group `choice` that holds the `orig` branch (the reg branch stays empty,
 * as only orig is rendered). These helpers keep that markup where an editorial intervention
 * is visible, and bring in what the reg rendering adds. They know nothing about notation:
 * what differs between orig and reg is decided by the liquify module of the element.
 */

const RHYTHM_ATTRIBUTES = ['dur', 'dots']
const RHYTHM_EVENT_NAMES = ['note', 'chord', 'rest', 'mRest']

// Unwrapping a choice changes ids that other modules look up, so it is done once all of them have run.
const pendingUnwraps = new WeakMap()

/**
 * Creates a choice group with the same markup that Verovio uses, so that structural
 * selectors like `.choice > .orig` also apply to groups created here.
 *
 * @param {Document} doc - Owner document.
 * @param {Element[]} origChildren - Elements for the orig branch.
 * @param {Element[]} regChildren - Elements for the reg branch.
 * @returns {Element} Choice group.
 */
export function createChoice (doc, origChildren, regChildren) {
  const create = className => {
    const group = doc.createElementNS(SVG_NS, 'g')
    group.setAttribute('data-class', className)
    group.setAttribute('class', className)
    return group
  }
  const choice = create('choice')
  const orig = create('orig')
  const reg = create('reg')
  origChildren.forEach(child => orig.appendChild(child))
  regChildren.forEach(child => reg.appendChild(child))
  choice.appendChild(orig)
  choice.appendChild(reg)
  return choice
}

/**
 * Puts an element into the reg branch of the choice group that holds another element.
 *
 * @param {Element} element - Element in the orig branch of a choice group.
 * @param {Element} regContent - Element to add to the reg branch.
 * @returns {boolean} Whether there was a reg branch to add it to.
 */
export function placeInRegBranch (element, regContent) {
  const choice = closestElement(element, 'g.choice')
  const reg = queryDirectChild(choice, 'g.reg')
  if (!reg) return false

  reg.appendChild(regContent)
  return true
}

/**
 * Copies an element of the reg rendering, without the ids that would clash with the original.
 *
 * @param {Element} ftSvg - Fluid transcription SVG, whose document receives the copy.
 * @param {Element} regElement - Element in the reg rendering.
 * @returns {Element} Copy that is not yet part of a document tree.
 */
export function importRegElement (ftSvg, regElement) {
  const copy = ftSvg.ownerDocument.importNode(regElement, true)
  if (copy.hasAttribute('id')) copy.removeAttribute('id')
  copy.querySelectorAll('[id]').forEach(descendant => descendant.removeAttribute('id'))
  return copy
}

/**
 * Copies the definitions (glyphs and the like) that a copied reg element refers to into
 * the fluid transcript, if they are not there yet.
 *
 * @param {Element} copy - Copy of a reg element.
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @param {Document} atRegSvgDom - AT SVG rendered with choices resolved to reg.
 * @param {Object} logger - Logger instance.
 * @returns {void}
 */
export function copyRegDefinitions (copy, ftSvg, atRegSvgDom, logger) {
  const pendingIds = getReferencedIds(copy)
  const regDefs = atRegSvgDom.querySelector('defs')
  let ftDefs = ftSvg.querySelector('defs')
  if (!regDefs) {
    if (pendingIds.length > 0) logger?.warn('[Rhythm Intervention] Could not find reg SVG definitions')
    return
  }
  if (!ftDefs) {
    ftDefs = ftSvg.ownerDocument.createElementNS(SVG_NS, 'defs')
    ftSvg.insertBefore(ftDefs, ftSvg.firstChild)
  }

  const copiedIds = new Set()
  while (pendingIds.length > 0) {
    const id = pendingIds.pop()
    if (copiedIds.has(id) || findElementById(ftDefs, id)) continue
    copiedIds.add(id)

    const definition = findElementById(regDefs, id)
    if (!definition) {
      logger?.warn(`[Rhythm Intervention] Could not find SVG definition ${id}`)
      continue
    }

    const definitionCopy = ftSvg.ownerDocument.importNode(definition, true)
    ftDefs.appendChild(definitionCopy)
    pendingIds.push(...getReferencedIds(definitionCopy))
  }
}

/**
 * Lists the ids that an element and its descendants refer to by `href` or `url(#…)`.
 *
 * @param {Element} element - Element to inspect.
 * @returns {string[]} Referenced ids.
 */
function getReferencedIds (element) {
  const ids = []
  const elements = [element, ...Array.from(element.querySelectorAll('*'))]
  elements.forEach(current => {
    Array.from(current.attributes || []).forEach(attribute => {
      if (attribute.name === 'href' || attribute.name === 'xlink:href') {
        if (attribute.value.startsWith('#')) ids.push(attribute.value.slice(1))
      }
      const urls = attribute.value.matchAll(/url\(#([^)]+)\)/g)
      for (const match of urls) ids.push(match[1])
    })
  })
  return ids
}

/**
 * Finds an element with an id inside a subtree.
 *
 * @param {Element} root - Root of the subtree.
 * @param {string} id - Id to look for.
 * @returns {Element|null} Element with that id.
 */
function findElementById (root, id) {
  if (root.getAttribute?.('id') === id) return root
  return Array.from(root.querySelectorAll('[id]'))
    .find(element => element.getAttribute('id') === id) || null
}

/**
 * Returns the first direct child element with a given name.
 *
 * @param {Element|null} element - Parent element.
 * @param {string} localName - Name of the child.
 * @returns {Element|null} Child element.
 */
function getDirectChild (element, localName) {
  if (!element) return null
  return Array.from(element.childNodes || []).find(child =>
    child.nodeType === 1 && child.localName === localName
  ) || null
}

/**
 * Returns whether two MEI events differ in duration or dots.
 *
 * @param {Element} orig - Event in the orig branch.
 * @param {Element} reg - Event in the reg branch.
 * @returns {boolean} Whether their rhythm differs.
 */
function rhythmDiffers (orig, reg) {
  return RHYTHM_ATTRIBUTES.some(attribute => orig.getAttribute(attribute) !== reg.getAttribute(attribute))
}

/**
 * Returns whether two MEI notes differ in pitch.
 *
 * @param {Element} orig - Note in the orig branch.
 * @param {Element} reg - Note in the reg branch.
 * @returns {boolean} Whether their pitch differs.
 */
function pitchDiffers (orig, reg) {
  return ['pname', 'oct'].some(attribute => orig.getAttribute(attribute) !== reg.getAttribute(attribute))
}

/**
 * Looks up the editorial choice behind a rendered note, chord, rest or mRest, if
 * its rhythm differs between the orig and reg branch.
 *
 * @param {Element} element - Rendered event in the fluid transcript.
 * @param {Document} atMeiDom - Edited AT MEI DOM.
 * @param {Document} atRegSvgDom - AT SVG rendered with choices resolved to reg.
 * @param {Object} [logger] - Logger instance.
 * @returns {{regId: string, regElement: Element, pitchChanged: boolean}|null} The reg id and rendering of the event, and whether its pitch changes as well.
 */
export function findRhythmChoice (element, atMeiDom, atRegSvgDom, logger) {
  const id = element.getAttribute('data-id')
  if (!id || !atMeiDom || !atRegSvgDom) return null

  const meiElement = Array.from(atMeiDom.querySelectorAll(RHYTHM_EVENT_NAMES.join(', ')))
    .find(candidate => candidate.getAttribute('xml:id') === id)
  const choice = closestElement(meiElement, 'choice')
  if (!choice) return null

  const origEvent = getDirectChild(getDirectChild(choice, 'orig'), meiElement.localName)
  const regEvent = getDirectChild(getDirectChild(choice, 'reg'), meiElement.localName)
  if (!origEvent || !regEvent || !rhythmDiffers(origEvent, regEvent)) return null

  const regId = regEvent.getAttribute('xml:id')
  const regElement = findMatchingRegElement(atRegSvgDom, element, regId)
  if (!regElement) {
    logger?.warn(`[Rhythm Intervention] Could not find reg SVG for ${meiElement.localName} ${regId}`)
    return null
  }

  return { regId, regElement, pitchChanged: pitchDiffers(origEvent, regEvent) }
}

/**
 * Replaces an event as a whole: the orig stays where it is and fades out, the reg rendering
 * is added to the reg branch of its choice group and fades in, travelling from the orig position.
 *
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @param {Element} element - Rendered event in the fluid transcript.
 * @param {{regId: string, regElement: Element}} found - Result of `findRhythmChoice`.
 * @param {Document} atRegSvgDom - AT SVG rendered with choices resolved to reg.
 * @param {Object} tools - Animation helper bundle.
 * @param {Object} logger - Logger instance.
 * @returns {void}
 */
export function swapWholeEvent (ftSvg, element, found, atRegSvgDom, tools, logger) {
  const { regId, regElement } = found
  const overlay = importRegElement(ftSvg, regElement)
  if (!placeInRegBranch(element, overlay)) {
    logger?.warn(`[Rhythm Intervention] Could not place reg SVG for ${regId}`)
    return
  }
  copyRegDefinitions(overlay, ftSvg, atRegSvgDom, logger)

  const referenceId = tools.correspMappings?.get(element.getAttribute('data-id'))?.[0]
  element.setAttribute('opacity', '1')
  overlay.setAttribute('opacity', '0')
  tools.setAnimation({
    element,
    referenceId,
    states: getFadeStates(false)
  })
  tools.setAnimation({
    element: overlay,
    referenceId,
    states: getFadeStates(true)
  })

  // The overlay is drawn at its reg position, so it has to travel with the orig element.
  const origPosition = getElementPosition(element)
  const regPosition = getElementPosition(regElement)
  if (origPosition && regPosition && (origPosition.x !== regPosition.x || origPosition.y !== regPosition.y)) {
    const start = { type: 'translate', val: `${origPosition.x - regPosition.x} ${origPosition.y - regPosition.y}` }
    tools.setAnimation({
      element: overlay,
      states: {
        finding: start,
        normalization: start,
        readingOrder: start,
        regulation: start,
        supplements: start,
        interventions: { type: 'translate', val: '0 0' }
      }
    })
  }
}

/**
 * Remembers that the choice group around a rendered event is to be replaced by the
 * event itself, because nothing but details of its rhythm differs.
 *
 * @param {Object} tools - Animation helper bundle.
 * @param {Element} element - Rendered event in the orig branch of a choice group.
 * @param {string} regId - AT id that the event carries once it is no longer an alternative.
 * @param {Array<Array<string>>} [noteIds] - [orig id, reg id] pairs of the notes in a chord.
 * @returns {void}
 */
export function queueChoiceUnwrap (tools, element, regId, noteIds = []) {
  const queue = pendingUnwraps.get(tools) || []
  queue.push({ element, regId, noteIds })
  pendingUnwraps.set(tools, queue)
}

/**
 * Replaces the choice groups that were queued by their orig content. The events then carry
 * their AT ids again, and ledger lines that refer to the old ids follow.
 *
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
export function finishChoices (ftSvg, tools) {
  const renamedIds = new Map()

  ;(pendingUnwraps.get(tools) || []).forEach(({ element, regId, noteIds }) => {
    const origId = element.getAttribute('data-id')
    if (!unwrapChoice(element, regId)) return

    renamedIds.set(origId, regId)
    noteIds.forEach(([from, to]) => renamedIds.set(from, to))
    const toByFrom = new Map(noteIds)
    Array.from(element.querySelectorAll('g.note')).forEach(note => {
      const to = toByFrom.get(note.getAttribute('data-id'))
      if (to) note.setAttribute('data-id', to)
    })
  })
  pendingUnwraps.delete(tools)

  renameLedgerReferences(ftSvg, renamedIds)
}

/**
 * Replaces a choice group by its orig content. The element then carries its AT id again.
 *
 * @param {Element} element - Orig event inside the choice group.
 * @param {string} regId - AT id of the event.
 * @returns {boolean} Whether the choice group was replaced.
 */
function unwrapChoice (element, regId) {
  const orig = element.parentNode
  const choice = orig?.parentNode
  if (!orig || !choice || !hasClassName(orig, 'orig') || !hasClassName(choice, 'choice')) return false

  Array.from(orig.childNodes).forEach(child => choice.parentNode.insertBefore(child, choice))
  removeElement(choice)
  element.setAttribute('data-id', regId)
  return true
}

/**
 * Returns whether an element has a class.
 *
 * @param {Element} element - Element to inspect.
 * @param {string} className - Class to look for.
 * @returns {boolean} Whether the class is present.
 */
function hasClassName (element, className) {
  return (element.getAttribute('class') || '').split(/\s+/).includes(className)
}

/**
 * Points ledger lines at the new ids of the notes that they belong to.
 *
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @param {Map<string, string>} renamedIds - New ids by old id.
 * @returns {void}
 */
function renameLedgerReferences (ftSvg, renamedIds) {
  if (renamedIds.size === 0) return

  ftSvg.querySelectorAll('[data-related]').forEach(line => {
    const related = line.getAttribute('data-related').split(/\s+/).map(token => {
      const renamed = renamedIds.get(token.replace(/^#/, ''))
      return renamed ? `#${renamed}` : token
    })
    line.setAttribute('data-related', related.join(' '))
  })
}

/**
 * Reshapes the lines of a beam or tremolo to their reg rendering. Lines that exist in both
 * renderings are recycled and move to their reg shape. Lines that exist only in reg fade in out
 * of their neighbour, and lines that exist only in orig fade out into it. Only those lines are
 * wrapped in choice/orig/reg, as only they differ.
 *
 * @param {Element[]} polygons - Orig lines, primary line first.
 * @param {string[]} regPointsList - `points` of the reg lines, primary line first.
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
export function regulatePolygonLines (polygons, regPointsList, tools) {
  if (polygons.length === 0 || regPointsList.length === 0) return

  const sharedCount = Math.min(polygons.length, regPointsList.length)
  polygons.slice(0, sharedCount).forEach((polygon, index) => {
    setPhaseEightPoints(polygon, regPointsList[index], tools)
  })

  const added = regPointsList.slice(sharedCount)
  const removed = polygons.slice(sharedCount)
  if (added.length > 0) addChoicePolygons(polygons[sharedCount - 1], added, tools)
  if (removed.length > 0) removeChoicePolygons(removed, regPointsList[sharedCount - 1], tools)
}

/**
 * Adds lines that only exist in reg. They start as a copy of a neighbouring line and
 * grow out of it while fading in.
 *
 * @param {Element} source - Line that the new ones grow out of.
 * @param {string[]} regPointsList - `points` of the lines to add.
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
function addChoicePolygons (source, regPointsList, tools) {
  const copies = regPointsList.map(regPoints => {
    const copy = source.cloneNode(false)
    copy.removeAttribute('id')
    copy.setAttribute('opacity', '0')
    const startPoints = source.getAttribute('points')
    copy.setAttribute('points', startPoints)

    tools.setAnimation({ element: copy, states: getFadeStates(true) })
    tools.setAnimation({
      element: copy,
      states: getStaticThenRegStates('points', startPoints, alignPolygonWinding(regPoints, startPoints))
    })
    return copy
  })

  const choice = createChoice(source.ownerDocument, [], copies)
  source.parentNode.insertBefore(choice, source.nextSibling)
}

/**
 * Removes lines that only exist in orig. They move onto a neighbouring line while fading out.
 *
 * @param {Element[]} polygons - Lines to remove.
 * @param {string} targetPoints - `points` of the line that they merge into.
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
function removeChoicePolygons (polygons, targetPoints, tools) {
  polygons.forEach(polygon => {
    setPhaseEightPoints(polygon, targetPoints, tools)
    setPhaseEightOpacity(polygon, false, tools)
  })

  const choice = createChoice(polygons[0].ownerDocument, [], [])
  polygons[0].parentNode.insertBefore(choice, polygons[0])
  const orig = queryDirectChild(choice, 'g.orig')
  polygons.forEach(polygon => orig.appendChild(polygon))
}
