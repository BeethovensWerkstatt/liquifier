import { appendNewElement, queryDirectChild, queryDirectChildren, removeElement } from '../../utils/dom.js'
import { INTERVENTIONS_PHASE_INDEX, getFadeStates } from '../../utils/ft/phaseEight.js'

// Lines added from the reg rendering; tracked in memory instead of in an attribute.
const regulationLines = new WeakSet()

/**
 * Animate AT ledger lines by reusing the already-resolved animation of their owning note or chord notehead.
 *
 * The FT renderer starts from AT material, so ledger lines are only present where AT already has them.
 * This helper keeps all ledger lines belonging to one related note together and avoids trying to infer
 * DT-side ledger-line identities that are not exposed in the DT SVG.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT).
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG.
 * @param {Document} atMeiDom - AT MEI DOM.
 * @param {Object} tools - Shared animation helper bundle.
 * @returns {void}
 */
export const liquifyLedgerLines = (ftSvg, dtSvg, atMeiDom, tools) => {
  const ledgerLines = ftSvg.querySelectorAll('.ledgerLines .lineDash')

  ledgerLines.forEach(ledgerLine => {
    const relatedIds = getRelatedIds(ledgerLine)
    if (relatedIds.length === 0) return

    const animationSources = relatedIds
      .map(relatedId => findLedgerAnimationSources(ftSvg, relatedId))
      .find(source => source.transformElement || source.opacityElement)

    if (!animationSources) return

    syncLedgerAnimation(ledgerLine, animationSources)
  })

  reconcileRegulationLedgerLines(ftSvg, atMeiDom, tools)
}

/**
 * Returns the ids of the notes that a ledger line belongs to.
 *
 * @param {Element} ledgerLine - Ledger line (`data-related` holds `#id` references).
 * @returns {string[]} Ids of the related notes.
 */
function getRelatedIds (ledgerLine) {
  return String(ledgerLine.getAttribute('data-related') || '')
    .trim()
    .split(/\s+/)
    .map(token => token.replace(/^#/, ''))
    .filter(Boolean)
}

/**
 * Finds the animations of the note or chord that a ledger line belongs to.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {string} relatedId - Id of the related note or chord.
 * @returns {{transformElement: Element|null, opacityElement: Element|null}} The translate and opacity animations, if there are any.
 */
function findLedgerAnimationSources (ftSvg, relatedId) {
  const note = findElementByDataId(ftSvg, 'g.note', relatedId)
  if (note) {
    const notehead = queryDirectChild(note, 'g.notehead')
    const transformElement = findDirectAnimation(note, 'animateTransform', 'transform') || findDirectAnimation(notehead, 'animateTransform', 'transform')
    const opacityElement = findDirectAnimation(note, 'animate', 'opacity') || findDirectAnimation(notehead, 'animate', 'opacity')

    if (transformElement || opacityElement) {
      return { transformElement, opacityElement }
    }
  }

  const chord = findElementByDataId(ftSvg, 'g.chord', relatedId)
  if (chord) {
    const transformElement = findDirectAnimation(chord, 'animateTransform', 'transform')
    const opacityElement = findDirectAnimation(chord, 'animate', 'opacity')

    if (transformElement || opacityElement) {
      return { transformElement, opacityElement }
    }
  }

  return { transformElement: null, opacityElement: null }
}

/**
 * Finds an element by its class and `data-id`.
 *
 * @param {SVGElement} svg - SVG to search.
 * @param {string} selector - Selector for the element's class.
 * @param {string} dataId - Value of `data-id`.
 * @returns {Element|null} Matching element.
 */
function findElementByDataId (svg, selector, dataId) {
  return Array.from(svg.querySelectorAll(selector))
    .find(element => element.getAttribute('data-id') === dataId) || null
}

/**
 * Finds an animation that is a direct child of an element.
 *
 * @param {Element|null} element - Animated element.
 * @param {string} localName - Name of the animation element, e.g. `animate`.
 * @param {string} attributeName - Animated attribute.
 * @returns {Element|null} Matching animation.
 */
function findDirectAnimation (element, localName, attributeName) {
  if (!element) return null
  return queryDirectChildren(element, localName)
    .find(animation => animation.getAttribute('attributeName') === attributeName) || null
}

/**
 * Gives a ledger line copies of the animations of its note, so that it follows the note through all phases.
 *
 * @param {Element} ledgerLine - Ledger line.
 * @param {{transformElement: Element|null, opacityElement: Element|null}} sources - Animations of the note.
 * @returns {void}
 */
function syncLedgerAnimation (ledgerLine, { transformElement, opacityElement }) {
  removeExistingAnimations(ledgerLine)
  copyReferenceId(ledgerLine, transformElement?.parentNode || opacityElement?.parentNode)

  if (opacityElement) {
    cloneAnimationElement(ledgerLine, opacityElement)
  }

  if (transformElement) {
    cloneAnimationElement(ledgerLine, transformElement)
  }
}

/**
 * Copies the reference to the DT element from one element to another.
 *
 * @param {Element} target - Element that receives `data-ref-id`.
 * @param {Element|undefined} source - Element that holds `data-ref-id`.
 * @returns {void}
 */
function copyReferenceId (target, source) {
  const referenceId = source?.getAttribute('data-ref-id')
  if (referenceId) target.setAttribute('data-ref-id', referenceId)
}

/**
 * Removes all animations from an element.
 *
 * @param {Element} element - Animated element.
 * @returns {void}
 */
function removeExistingAnimations (element) {
  Array.from(element.childNodes || [])
    .filter(child => child?.nodeType === 1 && (child.localName === 'animate' || child.localName === 'animateTransform'))
    .forEach(removeElement)
}

/**
 * Appends a copy of an animation, with a new id, to an element.
 *
 * @param {Element} target - Element to animate.
 * @param {Element} source - Animation to copy.
 * @returns {Element} The copy.
 */
function cloneAnimationElement (target, source) {
  const clone = appendNewElement(target, source.localName, 'http://www.w3.org/2000/svg')

  Array.from(source.attributes || []).forEach(attribute => {
    if (attribute.name === 'id') return
    clone.setAttribute(attribute.name, attribute.value)
  })

  return clone
}

/**
 * Pair the ledger lines of each note in the orig and reg renderings, in document order.
 * Paired lines move to their reg position together with the note; surplus orig lines
 * fade out and surplus reg lines fade in.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {Document} atMeiDom - Edited AT MEI DOM.
 * @param {Object} tools - Shared animation helper bundle.
 * @returns {void}
 */
function reconcileRegulationLedgerLines (ftSvg, atMeiDom, tools) {
  const { atRegSvgDom, setAnimation } = tools
  if (!atRegSvgDom || !setAnimation) return

  const originalLinesByKey = new Map()
  ftSvg.querySelectorAll('.ledgerLines .lineDash').forEach(line => {
    if (regulationLines.has(line)) return
    const regNoteId = getRegNoteId(atMeiDom, getRelatedIds(line)[0])
    if (!regNoteId) return
    addToGroup(originalLinesByKey, getLedgerReconciliationKey(line, regNoteId), line)
  })

  const regulationLinesByKey = new Map()
  atRegSvgDom.querySelectorAll('.ledgerLines .lineDash').forEach(regLine => {
    const regNoteId = getRelatedIds(regLine)[0]
    if (!regNoteId) return
    addToGroup(regulationLinesByKey, getLedgerReconciliationKey(regLine, regNoteId), regLine)
  })

  regulationLinesByKey.forEach((regLines, key) => {
    const originalLines = originalLinesByKey.get(key) || []

    regLines.forEach((regLine, index) => {
      if (originalLines[index]) {
        moveLedgerLineToRegulation(originalLines[index], regLine, setAnimation)
        return
      }

      const targetContainer = findMatchingLedgerContainer(ftSvg, regLine.parentNode)
      if (!targetContainer) return

      const clone = regLine.cloneNode(true)
      regulationLines.add(clone)
      targetContainer.appendChild(clone)
      setAnimation({ element: clone, states: getFadeStates(true) })
    })
  })

  originalLinesByKey.forEach((originalLines, key) => {
    const regulationLineCount = (regulationLinesByKey.get(key) || []).length
    originalLines.slice(regulationLineCount).forEach(line => {
      const opacity = findDirectAnimation(line, 'animate', 'opacity')
      if (opacity) {
        const values = opacity.getAttribute('values').split(';')
        values[INTERVENTIONS_PHASE_INDEX] = '0'
        opacity.setAttribute('values', values.join(';'))
      } else {
        setAnimation({ element: line, states: getFadeStates(false) })
      }
    })
  })
}

/**
 * Adds a ledger line to the group under a key.
 *
 * @param {Map<string, Element[]>} groups - Ledger lines by key.
 * @param {string} key - Key of the group.
 * @param {Element} line - Ledger line.
 * @returns {void}
 */
function addToGroup (groups, key, line) {
  const lines = groups.get(key) || []
  lines.push(line)
  groups.set(key, lines)
}

/**
 * A ledger line follows its note, whose animation ends at the reg position of the notehead.
 * Whatever is still missing to the reg line (another pitch, another length) is animated on its path.
 *
 * @param {Element} line - Ledger line in the FT SVG.
 * @param {Element} regLine - Matching ledger line in the reg SVG.
 * @param {Function} setAnimation - Phase-aware animation descriptor writer.
 * @returns {void}
 */
function moveLedgerLineToRegulation (line, regLine, setAnimation) {
  const path = line.querySelector('path')
  const regPath = regLine.querySelector('path')
  const d = path?.getAttribute('d')
  const regD = regPath?.getAttribute('d')
  if (!d || !regD) return

  const shift = getFinalTranslation(line)
  const targetD = shiftPathData(regD, -shift.x, -shift.y)
  if (targetD === d) return

  setAnimation({
    element: path,
    states: {
      finding: { type: 'd', val: d },
      normalization: { type: 'd', val: d },
      readingOrder: { type: 'd', val: d },
      regulation: { type: 'd', val: d },
      supplements: { type: 'd', val: d },
      interventions: { type: 'd', val: targetD }
    }
  })
}

/**
 * Returns the translation that the animation of an element has at the interventions phase.
 *
 * @param {Element} element - Animated element.
 * @returns {{x: number, y: number}} Translation, or zero if there is no translate animation.
 */
function getFinalTranslation (element) {
  const translation = findDirectAnimation(element, 'animateTransform', 'transform')
  const values = (translation?.getAttribute('values') || '').split(';')
  const numbers = (values[INTERVENTIONS_PHASE_INDEX] || '').match(/-?\d*\.?\d+/g) || []
  return { x: parseFloat(numbers[0]) || 0, y: parseFloat(numbers[1]) || 0 }
}

/**
 * Moves all coordinate pairs of simple path data.
 *
 * @param {string} d - Path data such as `M10 20 L30 40`.
 * @param {number} dx - Horizontal shift.
 * @param {number} dy - Vertical shift.
 * @returns {string} Shifted path data.
 */
function shiftPathData (d, dx, dy) {
  return d.replace(/(-?\d*\.?\d+)[\s,]+(-?\d*\.?\d+)/g, (match, x, y) => `${parseFloat(x) + dx} ${parseFloat(y) + dy}`)
}

/**
 * Returns the id that a note has in the reg rendering: the same one, unless it is the orig of an editorial choice.
 *
 * @param {Document} atMeiDom - Edited AT MEI DOM.
 * @param {string} originalNoteId - Id of the note in the fluid transcript.
 * @returns {string|null} Id of the note in the reg rendering.
 */
function getRegNoteId (atMeiDom, originalNoteId) {
  if (!atMeiDom || !originalNoteId) return null
  const originalNote = Array.from(atMeiDom.querySelectorAll('note'))
    .find(note => note.getAttribute('xml:id') === originalNoteId)
  const choice = findChoiceAncestor(originalNote)
  if (choice) {
    const regulationNote = findDescendantByLocalName(queryDirectChild(choice, 'reg'), 'note')
    return regulationNote?.getAttribute('xml:id') || originalNoteId
  }
  return originalNoteId
}

/**
 * Finds the `<choice>` that holds an MEI element.
 *
 * @param {Element|undefined} element - MEI element.
 * @returns {Element|null} Choice element.
 */
function findChoiceAncestor (element) {
  let current = element?.parentNode
  while (current?.nodeType === 1) {
    if (current.localName === 'choice') return current
    current = current.parentNode
  }
  return null
}

/**
 * Finds the first descendant, or the element itself, with a given name.
 *
 * @param {Element|null} element - Element to search.
 * @param {string} localName - Name to look for.
 * @returns {Element|null} First match.
 */
function findDescendantByLocalName (element, localName) {
  if (!element) return null
  if (element.localName === localName) return element

  for (const child of Array.from(element.childNodes || [])) {
    if (child.nodeType !== 1) continue
    const descendant = findDescendantByLocalName(child, localName)
    if (descendant) return descendant
  }

  return null
}

/**
 * Returns the key under which ledger lines of one note are paired between the renderings.
 *
 * @param {Element} line - Ledger line.
 * @param {string} relatedId - Id of the note in the reg rendering.
 * @returns {string} Key of measure, staff and note.
 */
function getLedgerReconciliationKey (line, relatedId) {
  return [
    findAncestorDataId(line, 'measure'),
    findAncestorDataId(line, 'staff'),
    relatedId
  ].join('|')
}

/**
 * Returns the `data-id` of the closest ancestor with a class.
 *
 * @param {Element} element - Element where the walk up begins.
 * @param {string} className - Class of the ancestor.
 * @returns {string} Id, or an empty string if there is no such ancestor.
 */
function findAncestorDataId (element, className) {
  let current = element?.parentNode
  while (current?.nodeType === 1) {
    const classNames = String(current.getAttribute('class') || '').split(/\s+/)
    if (classNames.includes(className)) return current.getAttribute('data-id') || ''
    current = current.parentNode
  }
  return ''
}

/**
 * Finds the container of ledger lines in the fluid transcript that matches one of the reg rendering.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {Element} regContainer - Container of ledger lines in the reg rendering.
 * @returns {Element|null} Matching container.
 */
function findMatchingLedgerContainer (ftSvg, regContainer) {
  const measureId = findAncestorDataId(regContainer, 'measure')
  const staffId = findAncestorDataId(regContainer, 'staff')
  const classNames = (regContainer?.getAttribute('class') || '').split(/\s+/).filter(Boolean)
  return Array.from(ftSvg.querySelectorAll('.ledgerLines')).find(container => {
    const candidateClassNames = (container.getAttribute('class') || '').split(/\s+/)
    return classNames.every(className => candidateClassNames.includes(className)) &&
      findAncestorDataId(container, 'measure') === measureId &&
      findAncestorDataId(container, 'staff') === staffId
  }) || null
}
