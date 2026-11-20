import { addClass } from '../dom.js'
import { alignPolygonWinding } from '../svgGeometry.js'

/**
 * Low-level helpers for the interventions phase (phase 8) of the fluid transcript animation.
 * Phase 8 is the last of the eight animation values, so it is addressed by index 7.
 */

export const SVG_NS = 'http://www.w3.org/2000/svg'
export const INTERVENTIONS_PHASE_INDEX = 7

/**
 * Returns the animation elements (`animate`, `animateTransform`, …) that are direct children of an element.
 *
 * @param {Element} element - Element that carries animations.
 * @returns {Element[]} Animation elements.
 */
export function getAnimations (element) {
  return Array.from(element.childNodes || []).filter(node => node.nodeType === 1 && /^animate/.test(node.localName))
}

/**
 * Returns the values that an animation has before and at the interventions phase.
 *
 * @param {Element} animation - Animation element with eight `values`.
 * @returns {{from: string, to: string}|null} Values of the supplements and interventions phase, or null if there are not enough values.
 */
export function getPhaseChange (animation) {
  const values = (animation.getAttribute('values') || '').split(';')
  if (values.length <= INTERVENTIONS_PHASE_INDEX) return null
  return { from: values[INTERVENTIONS_PHASE_INDEX - 1], to: values[INTERVENTIONS_PHASE_INDEX] }
}

/**
 * Reads the first coordinate pair of a path, points or translate value.
 *
 * @param {string} value - Animation value, such as `M10 20 L30 40` or `5 6`.
 * @returns {{x: number, y: number}|null} First coordinate pair, or null if there is none.
 */
export function getFirstPoint (value) {
  const numbers = (value || '').match(/-?\d*\.?\d+(?:e-?\d+)?/gi)
  if (!numbers || numbers.length < 2) return null
  return { x: parseFloat(numbers[0]), y: parseFloat(numbers[1]) }
}

/**
 * Sums the shift between the supplements and interventions phases that translate
 * animations apply to an element and its ancestors.
 *
 * @param {Element} start - Element where the walk up begins.
 * @param {Element} root - Fluid transcription root where the walk stops.
 * @returns {{x: number, y: number}} Shift applied at the interventions phase.
 */
export function getTranslationShift (start, root) {
  const shift = { x: 0, y: 0 }
  for (let node = start; node && node.nodeType === 1; node = node.parentNode) {
    getAnimations(node).filter(animation => animation.localName === 'animateTransform' && animation.getAttribute('type') === 'translate')
      .forEach(animation => {
        const change = getPhaseChange(animation)
        const from = change && getFirstPoint(change.from)
        const to = change && getFirstPoint(change.to)
        if (from && to) {
          shift.x += to.x - from.x
          shift.y += to.y - from.y
        }
      })
    if (node === root) break
  }

  return shift
}

/**
 * Returns the position of the first drawn shape of an element, which is used to compare
 * the same element in two renderings.
 *
 * @param {Element|null} element - SVG group.
 * @returns {{x: number, y: number}|null} Position, or null if the element has no recognisable shape.
 */
export function getElementPosition (element) {
  if (!element) return null

  const anchor = element.querySelector('use, text, path, polygon, polyline')
  if (!anchor) return null

  const translate = (anchor.getAttribute('transform') || '').match(/translate\(\s*([\d.-]+)[,\s]+([\d.-]+)\s*\)/)
  if (translate) return { x: parseFloat(translate[1]), y: parseFloat(translate[2]) }

  const x = parseFloat(anchor.getAttribute('x') || anchor.getAttribute('cx'))
  const y = parseFloat(anchor.getAttribute('y') || anchor.getAttribute('cy'))
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }

  const pathStart = (anchor.getAttribute('d') || '').match(/M\s*([\d.-]+)[,\s]+([\d.-]+)/)
  if (pathStart) return { x: parseFloat(pathStart[1]), y: parseFloat(pathStart[2]) }

  const polygonStart = (anchor.getAttribute('points') || '').match(/^\s*([\d.-]+),([\d.-]+)/)
  if (polygonStart) return { x: parseFloat(polygonStart[1]), y: parseFloat(polygonStart[2]) }

  return null
}

/**
 * Finds the element of the reg rendering that matches an element of the fluid transcript.
 *
 * @param {Document} atRegSvgDom - AT SVG rendered with choices resolved to reg.
 * @param {Element} element - Element of the fluid transcript; its classes have to occur on the match.
 * @param {string} id - Id of the element in the reg rendering.
 * @returns {Element|null} Matching reg element.
 */
export function findMatchingRegElement (atRegSvgDom, element, id) {
  if (!id) return null

  const classNames = new Set((element.getAttribute('class') || '').split(/\s+/).filter(Boolean))
  if (classNames.has('mRest')) classNames.add('rest')
  if (classNames.has('rest')) classNames.add('mRest')
  return Array.from(atRegSvgDom.querySelectorAll('g'))
    .filter(candidate => candidate.getAttribute('data-id') === id)
    .find(candidate => {
      const candidateClasses = (candidate.getAttribute('class') || '').split(/\s+/)
      return candidateClasses.some(className => classNames.has(className))
    }) || null
}

/**
 * Builds animation states that stay at one value until the supplements phase and
 * change to another one at the interventions phase.
 *
 * @param {string} type - Animation type, such as `points` or `d`.
 * @param {string} value - Value up to the supplements phase.
 * @param {string} regValue - Value at the interventions phase.
 * @returns {Object} States for `setAnimation`.
 */
export function getStaticThenRegStates (type, value, regValue) {
  return {
    finding: { type, val: value },
    normalization: { type, val: value },
    readingOrder: { type, val: value },
    regulation: { type, val: value },
    supplements: { type, val: value },
    interventions: { type, val: regValue }
  }
}

/**
 * Builds opacity states that fade an element in or out at the interventions phase.
 *
 * @param {boolean} visibleAtInterventions - True for an element that arrives, false for one that leaves.
 * @returns {Object} States for `setAnimation`.
 */
export function getFadeStates (visibleAtInterventions) {
  const baseOpacity = visibleAtInterventions ? '0' : '1'
  const regOpacity = visibleAtInterventions ? '1' : '0'
  return {
    finding: { type: 'opacity', val: baseOpacity },
    normalization: { type: 'opacity', val: baseOpacity },
    readingOrder: { type: 'opacity', val: baseOpacity },
    regulation: { type: 'opacity', val: baseOpacity },
    supplements: { type: 'opacity', val: baseOpacity },
    interventions: { type: 'opacity', val: regOpacity }
  }
}

/**
 * Makes an element visible or invisible at the interventions phase. An opacity animation
 * that already exists is adjusted, so that it keeps its values for the earlier phases.
 *
 * @param {Element} element - Element to fade.
 * @param {boolean} visible - Whether the element is visible at the interventions phase.
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
export function setPhaseEightOpacity (element, visible, tools) {
  const opacity = getAnimations(element).find(animation => animation.getAttribute('attributeName') === 'opacity')
  if (opacity) {
    const values = opacity.getAttribute('values').split(';')
    values[INTERVENTIONS_PHASE_INDEX] = visible ? '1' : '0'
    opacity.setAttribute('values', values.join(';'))
    return
  }

  element.setAttribute('opacity', visible ? '0' : '1')
  tools.setAnimation({ element, states: getFadeStates(visible) })
}

/**
 * Moves a polygon to other points at the interventions phase. An existing `points`
 * animation is adjusted, so that it keeps its values for the earlier phases.
 *
 * @param {Element} polygon - Polygon to animate.
 * @param {string} regPoints - Points of the polygon at the interventions phase.
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
export function setPhaseEightPoints (polygon, regPoints, tools) {
  const points = polygon.getAttribute('points')
  if (!points || !regPoints) return

  const target = alignPolygonWinding(regPoints, points)
  const animation = getAnimations(polygon).find(candidate => candidate.getAttribute('attributeName') === 'points')
  if (animation) {
    const values = animation.getAttribute('values').split(';')
    values[INTERVENTIONS_PHASE_INDEX] = target
    animation.setAttribute('values', values.join(';'))
    return
  }

  if (points === target) return
  tools.setAnimation({ element: polygon, states: getStaticThenRegStates('points', points, target) })
}

/**
 * Marks what comes in or goes out at the interventions phase, so that it can be styled:
 * elements that become visible get the classes `intervention suppl`, elements that disappear
 * get `intervention remove`.
 *
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @returns {void}
 */
export function markInterventions (ftSvg) {
  const mark = (element, kind) => {
    addClass(element, 'intervention')
    addClass(element, kind)
  }

  ftSvg.querySelectorAll('animate').forEach(animation => {
    if (animation.getAttribute('attributeName') !== 'opacity') return

    const values = (animation.getAttribute('values') || '').split(';').map(value => parseFloat(value))
    if (values.length !== INTERVENTIONS_PHASE_INDEX + 1) return

    const before = values[INTERVENTIONS_PHASE_INDEX - 1]
    const after = values[INTERVENTIONS_PHASE_INDEX]
    if (before === 0 && after > 0) mark(animation.parentNode, 'suppl')
    if (before > 0 && after === 0) mark(animation.parentNode, 'remove')
  })
}
