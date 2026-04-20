import { JSDOM } from 'jsdom'
const { document } = (new JSDOM('<!DOCTYPE html><html><body></body></html>')).window

/**
 * Provides utility logic for new element.
 *
 * @param {Element} parent - Element processed by this function.
 * @param {string} name - String input used by this function.
 * @param {string} ns - String input used by this function.
 * @returns {void} No return value.
 */
export const appendNewElement = (parent, name, ns = 'http://www.music-encoding.org/ns/mei') => {
  const elem = parent.appendChild(document.createElementNS(ns, name))
  if (ns === 'http://www.w3.org/2000/svg') {
    elem.setAttribute('id', 's' + uuid())
  } else {
    elem.setAttribute('xml:id', 'x' + uuid())
  }
  return elem
}

/**
 * determines the center of a rendered system
 *
 * @param {Element} measures - Element processed by this function.
 * @returns {Object} Resulting object.
 */
export const getSystemCenter = (measures) => {
  const firstMeasure = measures[0]
  const lastMeasure = measures[measures.length - 1]

  const firstStaffLine = firstMeasure.querySelector('.staff:not(.bounding-box) > path')
  const lastStaffLine = lastMeasure.querySelectorAll('.staff:not(.bounding-box) > path')[4]

  /**
   * Parses dattribute from serialized input values.
   *
   * @param {Object} d - Input object used by this function.
   * @returns {Object} Resulting object.
   */
  const parseDAttribute = (d) => {
    const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g)
    return commands.map(command => {
      const type = command[0]
      const coords = command.slice(1).trim().split(/[\s,]+/).map(Number)
      return { type, coords }
    })
  }
  const firstPathData = parseDAttribute(firstStaffLine.getAttribute('d'))
  const lastPathData = parseDAttribute(lastStaffLine.getAttribute('d'))

  const firstStart = firstPathData[0].coords
  const firstEnd = firstPathData[firstPathData.length - 1].coords
  const lastStart = lastPathData[0].coords
  const lastEnd = lastPathData[lastPathData.length - 1].coords

  const allX = [firstStart[0], firstEnd[0], lastStart[0], lastEnd[0]]
  const allY = [firstStart[1], firstEnd[1], lastStart[1], lastEnd[1]]

  const topLeftX = Math.min(...allX)
  const topLeftY = Math.min(...allY)
  const bottomRightX = Math.max(...allX)
  const bottomRightY = Math.max(...allY)

  const centerX = (topLeftX + bottomRightX) / 2
  const centerY = (topLeftY + bottomRightY) / 2

  return { x: centerX, y: centerY, left: topLeftX, right: bottomRightX, top: topLeftY, bottom: bottomRightY }
}

/**
 * Generates a UUID value.
 *
 * @returns {string} Resulting string.
 */
const uuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Returns page dimensions from the current data context.
 *
 * @param {Object} sourceMEI - Input object used by this function.
 * @param {Object} transcriptionMEI - Input object used by this function.
 * @returns {Object} Resulting object.
 */
export const getPageDimensions = (sourceMEI, transcriptionMEI) => {
  const source = transcriptionMEI.querySelector('source')
  const wzId = source.getAttribute('target').split('#')[1]
  const wzGenDesc = sourceMEI.querySelector('*[xml\\:id="' + wzId + '"]')
  const pageGenDesc = wzGenDesc.parentElement
  const surfaceRef = pageGenDesc.getAttribute('corresp')
  const foliumLike = sourceMEI.querySelector('foliaDesc *[recto="' + surfaceRef + '"], foliaDesc *[verso="' + surfaceRef + '"], foliaDesc *[outer\\.recto="' + surfaceRef + '"], foliaDesc *[inner\\.verso="' + surfaceRef + '"], foliaDesc *[inner\\.recto="' + surfaceRef + '"], foliaDesc *[outer\\.verso="' + surfaceRef + '"]')
  const foliumWidth = parseFloat(foliumLike.getAttribute('width'))
  const foliumHeight = parseFloat(foliumLike.getAttribute('height'))

  return { width: foliumWidth, height: foliumHeight }
}

/**
 * Returns at system centers from the current data context.
 *
 * @param {SVGElement|Document} atSvgDom - Source document used by this function.
 * @returns {void} No return value.
 */
export const getAtSystemCenters = (atSvgDom) => {
  // const arr = []
}

// calculates the outer bounding rect of a rotated rectangle
/**
 * Returns outer bounding rect from the current data context.
 *
 * @param {number} x - Numeric input used by this function.
 * @param {number} y - Numeric input used by this function.
 * @param {number} w - Numeric input used by this function.
 * @param {number} h - Numeric input used by this function.
 * @param {number} deg - Numeric input used by this function.
 * @returns {Object} Resulting object.
 */
export function getOuterBoundingRect (x, y, w, h, deg) {
  const center = {
    x: parseFloat(x) + parseFloat(w) / 2,
    y: parseFloat(y) + parseFloat(h) / 2
  }

  if (parseFloat(deg) === 0) {
    return { x, y, w, h }
  }

  const absDeg = Math.abs(deg)
  const rad = deg2rad(absDeg)
  const newWidth = parseFloat(w) * Math.cos(rad) + parseFloat(h) * Math.sin(rad)
  const newHeight = parseFloat(w) * Math.sin(rad) + parseFloat(h) * Math.cos(rad)

  const tlUnrotated = {
    x: center.x - newWidth / 2,
    y: center.y - newHeight / 2
  }

  const tl = rotatePoint(tlUnrotated, center, deg * -1)
  // console.log('x:' + tl.x + ' vs ' + newX + ' / y: ' + tl.y + ' vs ' + newY)
  const rect = {
    x: tl.x,
    y: tl.y,
    w: newWidth,
    h: newHeight
  }

  return rect
  // (305 * Math.cos(5 * Math.PI / 180)) + (232 * Math.sin(5 * Math.PI / 180))
}

/**
 * calculates radians from degrees
 *
 * @param {number} deg - Numeric input used by this function.
 * @returns {Object} Result value.
 */
function deg2rad (deg) {
  // console.log('\n\ndeg2rad. deg="' + deg + '", rad="' + deg * (Math.PI / 180) + '"')
  return deg * (Math.PI / 180)
}

/**
 * rotate point around specified center
 *
 * @param {{x: number, y: number}} point - Input object used by this function.
 * @param {{x: number, y: number}} center - Input object used by this function.
 * @param {number} deg - Numeric input used by this function.
 * @returns {Object} a point with x and y props
 */
function rotatePoint (point, center, deg) {
  const xOff = center.x
  const yOff = center.y

  const x = point.x - xOff
  const y = point.y - yOff

  const rad = deg2rad(deg)

  const x1 = x * Math.cos(rad) - y * Math.sin(rad)
  const y1 = x * Math.sin(rad) + y * Math.cos(rad)

  const newPoint = {
    x: x1 + xOff, // Math.cos(rad) * dist + xOff,
    y: y1 + yOff // Math.sin(rad) * dist + xOff
  }

  // console.log('rotating points', deg, /* point, { x, y }, dist, */ rad, newPoint, center)

  return newPoint
}
