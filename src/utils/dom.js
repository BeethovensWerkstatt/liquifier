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
