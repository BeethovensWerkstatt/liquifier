import { appendNewElement, queryDirectChild, removeElement } from '../../utils/dom.js'

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
}

function getRelatedIds (ledgerLine) {
  return String(ledgerLine.getAttribute('data-related') || '')
    .trim()
    .split(/\s+/)
    .map(token => token.replace(/^#/, ''))
    .filter(Boolean)
}

function findLedgerAnimationSources (ftSvg, relatedId) {
  const note = ftSvg.querySelector(`g.note[data-id="${relatedId}"]`)
  if (note) {
    const notehead = queryDirectChild(note, 'g.notehead')
    const transformElement =
      queryDirectChild(note, 'animateTransform[attributeName="transform"]') ||
      queryDirectChild(notehead, 'animateTransform[attributeName="transform"]')

    const opacityElement =
      queryDirectChild(note, 'animate[attributeName="opacity"]') ||
      queryDirectChild(notehead, 'animate[attributeName="opacity"]')

    if (transformElement || opacityElement) {
      return { transformElement, opacityElement }
    }
  }

  const chord = ftSvg.querySelector(`g.chord[data-id="${relatedId}"]`)
  if (chord) {
    const transformElement = queryDirectChild(chord, 'animateTransform[attributeName="transform"]')
    const opacityElement = queryDirectChild(chord, 'animate[attributeName="opacity"]')

    if (transformElement || opacityElement) {
      return { transformElement, opacityElement }
    }
  }

  return { transformElement: null, opacityElement: null }
}

function syncLedgerAnimation (ledgerLine, { transformElement, opacityElement }) {
  removeExistingAnimations(ledgerLine)

  if (opacityElement) {
    cloneAnimationElement(ledgerLine, opacityElement)
  }

  if (transformElement) {
    cloneAnimationElement(ledgerLine, transformElement)
  }
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
