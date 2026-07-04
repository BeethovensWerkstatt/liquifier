import { uuid } from './uuid.js'

/**
 * Append a new element to a parent node with automatic ID generation
 * Works in both browser and Node.js environments by using parent.ownerDocument
 * Common values:
 * - 'http://www.w3.org/2000/svg' for SVG elements
 * - 'http://www.music-encoding.org/ns/mei' for MEI elements
 *
 * @param {Element|Document} parent - The parent element or document to append to
 * @param {string} name - The tag name of the element to create (e.g., 'animate', 'animateTransform', 'path')
 * @param {string} ns - String input used by this function.
 * @returns {Element} The newly created and appended element with auto-generated ID
 */
export const appendNewElement = (parent, name, ns = 'http://www.w3.org/2000/svg') => {
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
 * Find the closest ancestor-or-self matching a selector without relying on Element.closest.
 *
 * @param {Element|null|undefined} element - Starting element.
 * @param {string} selector - Selector to match against.
 * @returns {Element|null} Matching ancestor or null when none is found.
 */
export const closestElement = (element, selector) => {
  if (!element || !selector) return null

  let current = element
  while (current && current.nodeType === 1) {
    if (matchesSelector(current, selector)) return current
    current = current.parentNode
  }

  return null
}

/**
 * Remove a node without relying on Element.remove.
 *
 * @param {Node|null|undefined} element - Node to remove.
 * @returns {void}
 */
export const removeElement = (element) => {
  if (!element?.parentNode) return
  element.parentNode.removeChild(element)
}

/**
 * Returns whether an element has a CSS class without relying on classList.
 *
 * @param {Element|null|undefined} element - Element to inspect.
 * @param {string} className - Class name to look up.
 * @returns {boolean} Whether the class is present.
 */
export const hasClass = (element, className) => {
  if (!element || !className) return false
  return getClassTokens(element).includes(className)
}

/**
 * Add a CSS class without relying on classList.
 *
 * @param {Element|null|undefined} element - Element to mutate.
 * @param {string} className - Class name to add.
 * @returns {void}
 */
export const addClass = (element, className) => {
  if (!element || !className) return
  const tokens = getClassTokens(element)
  if (tokens.includes(className)) return
  tokens.push(className)
  element.setAttribute('class', tokens.join(' '))
}

/**
 * Return all direct child elements that match a selector without relying on `:scope`.
 *
 * @param {Element|null|undefined} element - Parent element whose direct children are inspected.
 * @param {string} selector - Selector applied to each direct child.
 * @returns {Element[]} Matching direct child elements.
 */
export const queryDirectChildren = (element, selector) => {
  if (!element || !selector) return []

  return Array.from(element.childNodes || []).filter(child => {
    return child?.nodeType === 1 && matchesDirectChildSelector(child, selector)
  })
}

/**
 * Return the first direct child element that matches a selector without relying on `:scope`.
 *
 * @param {Element|null|undefined} element - Parent element whose direct children are inspected.
 * @param {string} selector - Selector applied to each direct child.
 * @returns {Element|null} First matching direct child or null.
 */
export const queryDirectChild = (element, selector) => {
  return queryDirectChildren(element, selector)[0] || null
}

/**
 * Match a direct child against the subset of selectors used by xmldom-qsa-sensitive call sites.
 * Supports comma-separated selectors, tag names, classes, `:not(.class)`, and
 * exact/presence attribute selectors.
 *
 * @param {Element} element - Child element to test.
 * @param {string} selector - Selector string.
 * @returns {boolean} Whether the child matches at least one selector branch.
 */
function matchesDirectChildSelector (element, selector) {
  return selector
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .some(part => matchesSimpleDirectSelector(element, part))
}

/**
 * Match one simple selector branch without relying on querySelectorAll.
 *
 * @param {Element} element - Child element to test.
 * @param {string} selector - Selector branch.
 * @returns {boolean} Whether the element matches the selector branch.
 */
function matchesSimpleDirectSelector (element, selector) {
  if (!element || !selector) return false

  const negativeClasses = Array.from(selector.matchAll(/:not\(\.([A-Za-z0-9_-]+)\)/g)).map(match => match[1])
  if (negativeClasses.some(className => hasClass(element, className))) return false

  const attributeMatchers = Array.from(selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)).map(match => {
    return {
      name: match[1],
      value: match[2]
    }
  })

  const positiveClasses = Array.from(selector.matchAll(/\.([A-Za-z0-9_-]+)/g)).map(match => match[1])
  if (positiveClasses.some(className => !hasClass(element, className))) return false

  for (const attributeMatcher of attributeMatchers) {
    if (!element.hasAttribute?.(attributeMatcher.name)) return false
    if (attributeMatcher.value !== undefined && element.getAttribute(attributeMatcher.name) !== attributeMatcher.value) {
      return false
    }
  }

  const cleanedSelector = selector
    .replace(/:not\(\.([A-Za-z0-9_-]+)\)/g, '')
    .replace(/\[([^\]=]+)(?:="([^"]*)")?\]/g, '')
    .replace(/\.([A-Za-z0-9_-]+)/g, '')
    .trim()

  if (!cleanedSelector || cleanedSelector === '*') return true

  return element.localName === cleanedSelector
}

/**
 * Test whether an element matches a selector in DOM implementations without Element.matches.
 *
 * @param {Element} element - Element to test.
 * @param {string} selector - Selector to match against.
 * @returns {boolean} Whether the element matches the selector.
 */
function matchesSelector (element, selector) {
  if (!element || !selector) return false

  const root = element.ownerDocument?.querySelectorAll
    ? element.ownerDocument
    : getTopAncestor(element)

  if (!root?.querySelectorAll) return false

  return Array.from(root.querySelectorAll(selector)).includes(element)
}

/**
 * Return the highest reachable ancestor node.
 *
 * @param {Element} element - Starting element.
 * @returns {Element|Document} Topmost ancestor.
 */
function getTopAncestor (element) {
  let current = element
  while (current?.parentNode) {
    current = current.parentNode
  }
  return current
}

function getClassTokens (element) {
  return String(element.getAttribute?.('class') || '')
    .split(/\s+/)
    .filter(Boolean)
}
