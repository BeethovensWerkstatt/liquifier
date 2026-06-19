/**
 * Parses view box from serialized input values.
 *
 * @param {string} viewBoxAttr - Serialized viewBox attribute value.
 * @returns {{x: number, y: number, width: number, height: number}|null} Parsed viewBox.
 */
export function parseViewBox (viewBoxAttr) {
  if (!viewBoxAttr) return null
  const [x, y, width, height] = viewBoxAttr.split(/\s+/).map(Number)
  if ([x, y, width, height].every(Number.isFinite)) {
    return { x, y, width, height }
  }
  return null
}

/**
 * Parses translate point from transform values.
 *
 * @param {string} transformAttr - Transform attribute value.
 * @returns {{x: number, y: number}|null} Parsed translate point.
 */
export function parseTranslatePoint (transformAttr) {
  if (!transformAttr) return null

  const match = transformAttr.match(/translate\(\s*([\d.-]+)\s*[\s,]+\s*([\d.-]+)\s*\)/)
  if (!match) return null

  const x = parseFloat(match[1])
  const y = parseFloat(match[2])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  return { x, y }
}

/**
 * Extracts node x-range from SVG subtree.
 *
 * @param {Element} node - Root node to scan.
 * @returns {{min: number, max: number}|null} Extracted x-range.
 */
export function extractNodeXRange (node) {
  const range = { min: Infinity, max: -Infinity }
  const nodes = [node, ...node.querySelectorAll('*')]

  nodes.forEach(current => {
    parseTranslateXValues(current.getAttribute('transform')).forEach(tx => absorbX(range, tx))

    const x = parseFloat(current.getAttribute('x'))
    const width = parseFloat(current.getAttribute('width'))
    const x1 = parseFloat(current.getAttribute('x1'))
    const x2 = parseFloat(current.getAttribute('x2'))
    const cx = parseFloat(current.getAttribute('cx'))

    absorbX(range, x)
    absorbX(range, x1)
    absorbX(range, x2)
    absorbX(range, cx)
    if (Number.isFinite(x) && Number.isFinite(width)) {
      absorbX(range, x + width)
    }

    const d = current.getAttribute('d')
    if (d) {
      const coordRegex = /([\d.-]+)[,\s]+([\d.-]+)/g
      let coordMatch
      while ((coordMatch = coordRegex.exec(d)) !== null) {
        absorbX(range, parseFloat(coordMatch[1]))
      }
    }
  })

  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) {
    return null
  }

  return range
}

/**
 * Updates a numeric range with one x coordinate.
 *
 * @param {{min: number, max: number}} range - Mutable range object.
 * @param {number} x - Candidate x value.
 * @returns {void} No return value.
 */
function absorbX (range, x) {
  if (!Number.isFinite(x)) return
  range.min = Math.min(range.min, x)
  range.max = Math.max(range.max, x)
}

/**
 * Parses all translate x values from one transform attribute.
 *
 * @param {string} transformAttr - Transform attribute value.
 * @returns {number[]} Parsed translate x values.
 */
function parseTranslateXValues (transformAttr) {
  if (!transformAttr) return []

  const values = []
  const regex = /translate\(\s*([\d.-]+)(?:[\s,]+([\d.-]+))?\s*\)/g
  let match

  while ((match = regex.exec(transformAttr)) !== null) {
    const tx = parseFloat(match[1])
    if (Number.isFinite(tx)) values.push(tx)
  }

  return values
}
