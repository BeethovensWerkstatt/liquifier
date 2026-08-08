import { appendNewElement, queryDirectChild, queryDirectChildren, removeElement } from '../../utils/dom.js'

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

function getRelatedIds (ledgerLine) {
  return String(ledgerLine.getAttribute('data-related') || '')
    .trim()
    .split(/\s+/)
    .map(token => token.replace(/^#/, ''))
    .filter(Boolean)
}

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

function findElementByDataId (svg, selector, dataId) {
  return Array.from(svg.querySelectorAll(selector))
    .find(element => element.getAttribute('data-id') === dataId) || null
}

function findDirectAnimation (element, localName, attributeName) {
  if (!element) return null
  return queryDirectChildren(element, localName)
    .find(animation => animation.getAttribute('attributeName') === attributeName) || null
}

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

function copyReferenceId (target, source) {
  const referenceId = source?.getAttribute('data-ref-id')
  if (referenceId) target.setAttribute('data-ref-id', referenceId)
}

function removeExistingAnimations (element) {
  Array.from(element.childNodes || [])
    .filter(child => child?.nodeType === 1 && (child.localName === 'animate' || child.localName === 'animateTransform'))
    .forEach(removeElement)
}

function cloneAnimationElement (target, source) {
  const clone = appendNewElement(target, source.localName, 'http://www.w3.org/2000/svg')

  Array.from(source.attributes || []).forEach(attribute => {
    if (attribute.name === 'id') return
    clone.setAttribute(attribute.name, attribute.value)
  })

  return clone
}

function reconcileRegulationLedgerLines (ftSvg, atMeiDom, tools) {
  const { atRegSvgDom, setAnimation } = tools
  if (!atRegSvgDom || !setAnimation) return

  const originalLinesByRegNoteId = new Map()
  ftSvg.querySelectorAll('.ledgerLines .lineDash').forEach(line => {
    if (line.getAttribute('data-bw-regulation-ledger') === 'true') return
    const relatedId = getRelatedIds(line)[0]
    const regNoteId = getRegNoteId(atMeiDom, relatedId)
    if (!regNoteId) return
    const key = getLedgerReconciliationKey(line, regNoteId)
    const entry = originalLinesByRegNoteId.get(key) || { lines: [], isOrigRegPair: false }
    entry.lines.push(line)
    entry.isOrigRegPair ||= relatedId !== regNoteId
    originalLinesByRegNoteId.set(key, entry)
  })

  atRegSvgDom.querySelectorAll('.ledgerLines .lineDash').forEach((regLine, index) => {
    const regNoteId = getRelatedIds(regLine)[0]
    if (!regNoteId) return

    const key = getLedgerReconciliationKey(regLine, regNoteId)
    const originalLines = originalLinesByRegNoteId.get(key)?.lines || []
    const isOrigRegPair = originalLinesByRegNoteId.get(key)?.isOrigRegPair
    if (!isOrigRegPair && originalLines[index]) return

    const targetContainer = findMatchingLedgerContainer(ftSvg, regLine.parentNode)
    if (!targetContainer) return

    const clone = regLine.cloneNode(true)
    clone.setAttribute('data-bw-regulation-ledger', 'true')
    targetContainer.appendChild(clone)
    setAnimation({
      element: clone,
      states: {
        finding: { type: 'opacity', val: '0' },
        normalization: { type: 'opacity', val: '0' },
        readingOrder: { type: 'opacity', val: '0' },
        regulation: { type: 'opacity', val: '0' },
        supplements: { type: 'opacity', val: '0' },
        interventions: { type: 'opacity', val: '1' }
      }
    })
  })

  originalLinesByRegNoteId.forEach(({ lines: originalLines, isOrigRegPair }, key) => {
    const regulationLineCount = Array.from(atRegSvgDom.querySelectorAll('.ledgerLines .lineDash'))
      .filter(line => getLedgerReconciliationKey(line, getRelatedIds(line)[0]) === key).length
    originalLines.slice(isOrigRegPair ? 0 : regulationLineCount).forEach(line => {
      setAnimation({
        element: line,
        states: {
          finding: { type: 'opacity', val: '1' },
          normalization: { type: 'opacity', val: '1' },
          readingOrder: { type: 'opacity', val: '1' },
          regulation: { type: 'opacity', val: '1' },
          supplements: { type: 'opacity', val: '1' },
          interventions: { type: 'opacity', val: '0' }
        }
      })
    })
  })
}

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

function findChoiceAncestor (element) {
  let current = element?.parentNode
  while (current?.nodeType === 1) {
    if (current.localName === 'choice') return current
    current = current.parentNode
  }
  return null
}

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

function getLedgerReconciliationKey (line, relatedId) {
  return [
    findAncestorDataId(line, 'measure'),
    findAncestorDataId(line, 'staff'),
    relatedId
  ].join('|')
}

function findAncestorDataId (element, className) {
  let current = element?.parentNode
  while (current?.nodeType === 1) {
    const classNames = String(current.getAttribute('class') || '').split(/\s+/)
    if (classNames.includes(className)) return current.getAttribute('data-id') || ''
    current = current.parentNode
  }
  return ''
}

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
