import { appendNewElement } from '../dom.js'
import {
  getAnimations,
  getElementPosition,
  getFirstPoint,
  getPhaseChange,
  getTranslationShift
} from './phaseEight.js'

/**
 * Layout regulation: in the interventions phase (phase 8), notation moves from the layout of
 * the orig rendering to the layout of the reg rendering. Rhythm edits change Verovio's
 * horizontal spacing, so every element after the first edit sits elsewhere in the reg rendering.
 *
 * Each liquify module animates its own elements for all eight phases. For phase 8 it registers a
 * deferred step with `deferRegulation`, which calls `regulateLayout` for its elements (and does
 * whatever else its elements need, e.g. swapping rhythm glyphs). The steps are deferred because
 * they change the structure of the SVG and read the animations of all other elements, so they
 * have to run once every module has finished. `runDeferredRegulation` runs them.
 */

const SHIFT_TOLERANCE = 0.5

// Containers are never shifted themselves; their contents are adjusted individually.
const LAYOUT_CONTAINER_CLASSES = new Set([
  'page-margin', 'system', 'measure', 'staff', 'layer', 'section', 'mdiv', 'score', 'pb',
  'writingZone', 'systemBegin', 'systemMilestone', 'systemMilestoneEnd', 'pageMilestone', 'pageMilestoneEnd',
  'annot', 'supplied', 'choice', 'orig', 'reg', 'del', 'sb', 'space', 'mSpace', 'tuplet',
  'beam', 'beamSpan', 'bTrem', 'fTrem'
])

// Bookkeeping is kept in memory, so that the generated SVG does not carry attributes for it.
const layoutWrappers = new WeakMap()
const states = new WeakMap()

/**
 * Returns the bookkeeping that belongs to one animation helper bundle.
 *
 * @param {Object} tools - Animation helper bundle.
 * @returns {{deferred: Function[], keys: Object|null, handled: WeakSet<Element>, visited: WeakSet<Element>}} State.
 */
function getState (tools) {
  if (!states.has(tools)) {
    states.set(tools, { deferred: [], keys: null, handled: new WeakSet(), visited: new WeakSet() })
  }
  return states.get(tools)
}

/**
 * Registers work for the interventions phase of an element type. It runs, in the order of
 * registration, once all liquify modules have finished.
 *
 * @param {Object} tools - Animation helper bundle.
 * @param {Function} work - Step to run later.
 * @returns {void}
 */
export function deferRegulation (tools, work) {
  getState(tools).deferred.push(work)
}

/**
 * Remembers that an element already moves to its reg layout by its own animation,
 * so that `regulateLayout` leaves it alone.
 *
 * @param {Object} tools - Animation helper bundle.
 * @param {Element} element - Element in the fluid transcription SVG.
 * @returns {void}
 */
export function markRegulationHandled (tools, element) {
  getState(tools).handled.add(element)
}

/**
 * Returns whether an element was marked as moving to its reg layout by its own animation.
 *
 * @param {Object} tools - Animation helper bundle.
 * @param {Element} element - Element in the fluid transcription SVG.
 * @returns {boolean} Whether the element was marked.
 */
export function isRegulationHandled (tools, element) {
  return getState(tools).handled.has(element)
}

/**
 * Returns the element that holds the contents of another element. This is the element
 * itself, unless `regulateLayout` had to wrap its contents.
 *
 * @param {Element} element - Element in the fluid transcription SVG.
 * @returns {Element} Content container.
 */
export function getContentContainer (element) {
  return layoutWrappers.get(element) || element
}

/**
 * Runs everything that the liquify modules deferred for the interventions phase, then
 * regulates the layout of all elements that no module took care of.
 *
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @param {Document} atMeiDom - Edited AT MEI DOM.
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
export function runDeferredRegulation (ftSvg, atMeiDom, tools) {
  const state = getState(tools)
  state.deferred.forEach(work => work())
  state.deferred = []

  const remaining = Array.from(ftSvg.querySelectorAll('g[data-id]')).filter(element => !state.visited.has(element))
  const classes = new Set(regulateLayout(ftSvg, remaining, atMeiDom, tools).map(getLayoutClass))
  classes.forEach(className => {
    tools.logger?.warn(`[Regulation] Elements of class '${className}' had to be moved generically; their liquify module should regulate them.`)
  })
}

/**
 * Moves elements from their orig layout to their reg layout in the interventions phase.
 * Each element is shifted by whatever is still missing after the animations that were
 * already written to it or its ancestors. Elements that carry only a generated Verovio
 * id are paired with the reg rendering through their nearest ancestor with an MEI id.
 *
 * A nested wrapper keeps this layout animation separate from the element's
 * existing DT-to-AT animation, which may already animate the outer element.
 *
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @param {Iterable<Element>} elements - Elements to regulate, in document order.
 * @param {Document} atMeiDom - Edited AT MEI DOM, used to tell MEI ids from generated ones.
 * @param {Object} tools - Animation helper bundle.
 * @param {Document} tools.atRegSvgDom - AT SVG rendered with choices resolved to reg.
 * @param {Function} tools.setAnimation - Writes phase-aware animation descriptors.
 * @returns {Element[]} The elements that had to be moved.
 */
export function regulateLayout (ftSvg, elements, atMeiDom, tools) {
  if (!tools.atRegSvgDom) return []

  const state = getState(tools)
  const keys = getLayoutKeys(ftSvg, atMeiDom, tools, state)
  const moved = []

  Array.from(elements).forEach(element => {
    const className = getLayoutClass(element)
    if (!className || LAYOUT_CONTAINER_CLASSES.has(className) || className.startsWith('bw-')) return
    state.visited.add(element)
    if (state.handled.has(element) || isInsideBoundingBox(element)) return

    const key = keys.ft.keys.get(element)
    const regElement = key && keys.ft.counts.get(keys.ft.groups.get(element)) === keys.reg.counts.get(keys.ft.groups.get(element))
      ? keys.regByKey.get(key)
      : null
    const origPosition = getElementPosition(element)
    const regPosition = getElementPosition(regElement)
    if (!origPosition || !regPosition) return

    const applied = getInterventionShift(element, ftSvg)
    const dx = regPosition.x - origPosition.x - applied.x
    const dy = regPosition.y - origPosition.y - applied.y
    if (Math.abs(dx) < SHIFT_TOLERANCE && Math.abs(dy) < SHIFT_TOLERANCE) return

    const wrapper = wrapContents(element)
    layoutWrappers.set(element, wrapper)
    moved.push(element)

    tools.setAnimation({
      element: wrapper,
      states: {
        finding: { type: 'translate', val: '0 0' },
        normalization: { type: 'translate', val: '0 0' },
        readingOrder: { type: 'translate', val: '0 0' },
        regulation: { type: 'translate', val: '0 0' },
        supplements: { type: 'translate', val: '0 0' },
        interventions: { type: 'translate', val: `${dx} ${dy}` }
      }
    })
  })

  return moved
}

/**
 * Returns the layout keys of the fluid transcript and the reg rendering. They are built once,
 * the first time they are needed, which is after all liquify modules have finished.
 *
 * @param {Element} ftSvg - Fluid transcription SVG.
 * @param {Document} atMeiDom - Edited AT MEI DOM.
 * @param {Object} tools - Animation helper bundle.
 * @param {Object} state - Bookkeeping of the helper bundle.
 * @returns {{ft: Object, reg: Object, regByKey: Map<string, Element>}} Layout keys.
 */
function getLayoutKeys (ftSvg, atMeiDom, tools, state) {
  if (state.keys) return state.keys

  const meiIds = atMeiDom
    ? new Set(Array.from(atMeiDom.querySelectorAll('*[xml\\:id]')).map(element => element.getAttribute('xml:id')))
    : null
  const normalizeId = id => (meiIds && id.startsWith('o') && meiIds.has(id) && meiIds.has(id.slice(1))) ? id.slice(1) : id
  const isMeiId = id => !meiIds || meiIds.has(id)

  const ft = buildLayoutKeys(ftSvg, normalizeId, isMeiId)
  const reg = buildLayoutKeys(tools.atRegSvgDom.documentElement, normalizeId, isMeiId)
  const regByKey = new Map()
  reg.keys.forEach((key, element) => regByKey.set(key, element))

  state.keys = { ft, reg, regByKey }
  return state.keys
}

/**
 * Returns the notation class of an SVG group.
 *
 * @param {Element} element - SVG group.
 * @returns {string} Value of `data-class`, or the first CSS class.
 */
function getLayoutClass (element) {
  return element.getAttribute('data-class') || (element.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0] || ''
}

/**
 * Returns whether an element is part of a bounding box, which is not drawn.
 *
 * @param {Element} element - SVG element.
 * @returns {boolean} Whether the element or one of its ancestors is a bounding box.
 */
function isInsideBoundingBox (element) {
  for (let node = element; node && node.nodeType === 1; node = node.parentNode) {
    if ((node.getAttribute('class') || '').split(/\s+/).includes('bounding-box')) return true
  }
  return false
}

/**
 * Keys elements so that the same element can be found in two renders. Elements with an
 * MEI id are keyed by that id; others by their nearest MEI-id ancestor, class and index.
 *
 * @param {Element} root - Root of the rendered SVG.
 * @param {Function} normalizeId - Maps orig-branch ids to their reg counterparts.
 * @param {Function} isMeiId - Tells MEI ids from ids generated by Verovio.
 * @returns {{keys: Map<Element, string>, groups: Map<Element, string>, counts: Map<string, number>}} Layout keys.
 */
function buildLayoutKeys (root, normalizeId, isMeiId) {
  const keys = new Map()
  const groups = new Map()
  const counts = new Map()
  const owners = new Map()

  root.querySelectorAll('g[data-id]').forEach(element => {
    const className = getLayoutClass(element)
    const id = element.getAttribute('data-id')
    if (!className || !id) return

    if (isMeiId(id)) {
      const key = `${normalizeId(id)}|${className}`
      keys.set(element, key)
      groups.set(element, key)
      counts.set(key, 1)
      owners.set(element, key)
      return
    }

    let ancestor = element.parentNode
    while (ancestor && !owners.has(ancestor)) ancestor = ancestor.parentNode
    if (!ancestor) return

    const group = `${owners.get(ancestor)}>${className}`
    const index = counts.get(group) || 0
    counts.set(group, index + 1)
    keys.set(element, `${group}#${index}`)
    groups.set(element, group)
  })

  return { keys, groups, counts }
}

/**
 * Sums the shift that existing animations already apply between the supplements and
 * interventions phases to an element's anchor and its ancestors.
 *
 * @param {Element} element - Element whose anchor is inspected.
 * @param {Element} root - Fluid transcription root where the ancestor walk stops.
 * @returns {{x: number, y: number}} Shift already applied.
 */
function getInterventionShift (element, root) {
  const shift = { x: 0, y: 0 }
  const anchor = element.querySelector('use, text, path, polygon, polyline')
  if (!anchor) return shift

  getAnimations(anchor).forEach(animation => {
    const attribute = animation.getAttribute('attributeName')
    const change = getPhaseChange(animation)
    if (!change) return

    if (attribute === 'd' || attribute === 'points') {
      const from = getFirstPoint(change.from)
      const to = getFirstPoint(change.to)
      if (from && to) {
        shift.x += to.x - from.x
        shift.y += to.y - from.y
      }
    } else if (attribute === 'x' || attribute === 'cx') {
      shift.x += (parseFloat(change.to) || 0) - (parseFloat(change.from) || 0)
    } else if (attribute === 'y' || attribute === 'cy') {
      shift.y += (parseFloat(change.to) || 0) - (parseFloat(change.from) || 0)
    }
  })

  const ancestors = getTranslationShift(anchor, root)
  return { x: shift.x + ancestors.x, y: shift.y + ancestors.y }
}

/**
 * Moves the contents of an element into a new group, which can then be animated on its own.
 *
 * @param {Element} element - Element whose contents are wrapped.
 * @returns {Element} The new group.
 */
function wrapContents (element) {
  const wrapper = appendNewElement(element, 'g', 'http://www.w3.org/2000/svg')
  const children = Array.from(element.childNodes || [])
  children.forEach(child => {
    if (child !== wrapper && !(child.nodeType === 1 && (child.localName === 'animate' || child.localName === 'animateTransform'))) {
      wrapper.appendChild(child)
    }
  })
  return wrapper
}
