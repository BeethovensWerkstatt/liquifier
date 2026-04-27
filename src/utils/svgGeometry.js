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
