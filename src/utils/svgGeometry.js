/**
 * Absorbs one numeric value into a range.
 *
 * @param {{min: number, max: number}} range - Range object.
 * @param {number} value - Numeric value.
 * @returns {void} No return value.
 */
function absorb (range, value) {
  if (!Number.isFinite(value)) return
  range.min = Math.min(range.min, value)
  range.max = Math.max(range.max, value)
}

/**
 * Parses translate(x y) operations from a transform attribute.
 *
 * @param {string} transformAttr - Serialized transform attribute.
 * @returns {Array<{x: number, y: number}>} Parsed translate values.
 */
export function parseTranslatePoints (transformAttr = '') {
  if (!transformAttr) return []

  const points = []
  const regex = /translate\(\s*([\d.-]+)(?:[\s,]+([\d.-]+))?\s*\)/g
  let match
  while ((match = regex.exec(transformAttr)) !== null) {
    const x = parseFloat(match[1])
    const y = match[2] !== undefined ? parseFloat(match[2]) : 0
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y })
    }
  }
  return points
}

/**
 * Computes an approximate bounding box from SVG attributes and path points.
 *
 * @param {Element} node - Root node for box extraction.
 * @returns {{x: number, y: number, width: number, height: number}|null} Approximate bbox.
 */
export function computeApproxBBox (node) {
  if (!node) return null

  const xRange = { min: Infinity, max: -Infinity }
  const yRange = { min: Infinity, max: -Infinity }
  const nodes = [node, ...node.querySelectorAll('*')]

  nodes.forEach(current => {
    parseTranslatePoints(current.getAttribute('transform')).forEach(point => {
      absorb(xRange, point.x)
      absorb(yRange, point.y)
    })

    const x = parseFloat(current.getAttribute('x'))
    const y = parseFloat(current.getAttribute('y'))
    const width = parseFloat(current.getAttribute('width'))
    const height = parseFloat(current.getAttribute('height'))
    const x1 = parseFloat(current.getAttribute('x1'))
    const y1 = parseFloat(current.getAttribute('y1'))
    const x2 = parseFloat(current.getAttribute('x2'))
    const y2 = parseFloat(current.getAttribute('y2'))
    const cx = parseFloat(current.getAttribute('cx'))
    const cy = parseFloat(current.getAttribute('cy'))
    const r = parseFloat(current.getAttribute('r'))
    const rx = parseFloat(current.getAttribute('rx'))
    const ry = parseFloat(current.getAttribute('ry'))

    absorb(xRange, x)
    absorb(yRange, y)
    absorb(xRange, x1)
    absorb(yRange, y1)
    absorb(xRange, x2)
    absorb(yRange, y2)
    absorb(xRange, cx)
    absorb(yRange, cy)

    if (Number.isFinite(x) && Number.isFinite(width)) absorb(xRange, x + width)
    if (Number.isFinite(y) && Number.isFinite(height)) absorb(yRange, y + height)

    if (Number.isFinite(cx) && Number.isFinite(r)) {
      absorb(xRange, cx - r)
      absorb(xRange, cx + r)
    }
    if (Number.isFinite(cy) && Number.isFinite(r)) {
      absorb(yRange, cy - r)
      absorb(yRange, cy + r)
    }
    if (Number.isFinite(cx) && Number.isFinite(rx)) {
      absorb(xRange, cx - rx)
      absorb(xRange, cx + rx)
    }
    if (Number.isFinite(cy) && Number.isFinite(ry)) {
      absorb(yRange, cy - ry)
      absorb(yRange, cy + ry)
    }

    const d = current.getAttribute('d')
    if (d) {
      const coordRegex = /([\d.-]+)[,\s]+([\d.-]+)/g
      let coordMatch
      while ((coordMatch = coordRegex.exec(d)) !== null) {
        absorb(xRange, parseFloat(coordMatch[1]))
        absorb(yRange, parseFloat(coordMatch[2]))
      }
    }
  })

  if (!Number.isFinite(xRange.min) || !Number.isFinite(yRange.min)) {
    return null
  }

  return {
    x: xRange.min,
    y: yRange.min,
    width: Math.max(0, xRange.max - xRange.min),
    height: Math.max(0, yRange.max - yRange.min)
  }
}

/**
 * Parses the `points` attribute of a polygon.
 *
 * @param {string} pointsStr - Points such as `0,0 10,0 10,5 0,5`.
 * @returns {Array<{x: number, y: number}>} Points of the polygon.
 */
export const parsePolygonPoints = (pointsStr) => {
  return pointsStr.trim().split(/\s+/).map(point => {
    const [x, y] = point.split(',').map(Number)
    return { x, y }
  })
}

/**
 * Sorts polygons by their vertical position (top to bottom).
 *
 * @param {Array<Element>} polygons - Polygon elements.
 * @returns {Array<{element: Element, avgY: number, points: Array<{x: number, y: number}>}>} Polygons with their average y, sorted from the smallest to the largest.
 */
export const sortPolygonsByPosition = (polygons) => {
  return polygons.map(polygon => {
    const points = parsePolygonPoints(polygon.getAttribute('points'))
    const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length

    return { element: polygon, avgY, points }
  }).sort((a, b) => a.avgY - b.avgY)
}

/**
 * Returns the signed area of a polygon, which tells its winding order.
 *
 * @param {Array<{x: number, y: number}>} points - Points of the polygon.
 * @returns {number} Twice the signed area.
 */
const calculatePolygonWinding = (points) => points.reduce((area, point, index) => {
  const next = points[(index + 1) % points.length]
  return area + point.x * next.y - next.x * point.y
}, 0)

/**
 * Brings the points of a four-point polygon into the winding order of a reference polygon,
 * so that the two can be animated into each other without twisting.
 *
 * @param {string} points - Points to adjust.
 * @param {string} referencePoints - Points whose winding order is wanted.
 * @returns {string} Points in the winding order of the reference.
 */
export const alignPolygonWinding = (points, referencePoints) => {
  const polygonPoints = parsePolygonPoints(points)
  const reference = parsePolygonPoints(referencePoints)
  if (polygonPoints.length !== 4 || reference.length !== 4) return points

  const polygonWinding = calculatePolygonWinding(polygonPoints)
  const referenceWinding = calculatePolygonWinding(reference)
  if (polygonWinding === 0 || referenceWinding === 0 || Math.sign(polygonWinding) === Math.sign(referenceWinding)) {
    return points
  }

  return [...polygonPoints].reverse().map(point => `${point.x},${point.y}`).join(' ')
}
