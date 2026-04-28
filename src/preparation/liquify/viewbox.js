/**
 * Adjust viewBox of SVG to encompass all animated content
 * This post-processing function analyzes all animation values to find the
 * bounding box of all content across all animation states, then adjusts
 * the SVG viewBox to ensure everything is visible with padding.
 *
 * @param {SVGElement} svg - The SVG element to adjust
 * @param {Object} tools - Tools object containing logger
 * @returns {number} Resulting numeric value.
 */
export const adjustViewBoxForContent = (svg, tools) => {
  const { logger, stateModel, matchedStaffLineBlocks, measureBlockMap } = tools

  logger.info('[adjustViewBoxForContent] Analyzing animated content bounds...')

  // Get the current viewBox as starting point
  // Check root SVG first, then nested svg.definition-scale
  let currentViewBox = svg.getAttribute('viewBox')
  let targetSvg = svg

  if (!currentViewBox) {
    const nestedSvg = svg.querySelector('svg.definition-scale')
    if (nestedSvg) {
      currentViewBox = nestedSvg.getAttribute('viewBox')
      targetSvg = nestedSvg
    }
  }

  if (!currentViewBox) {
    logger.warn('[adjustViewBoxForContent] No viewBox attribute found')
    return
  }

  const [currentMinX, currentMinY, currentWidth, currentHeight] = currentViewBox.split(/\s+/).map(parseFloat)
  const currentMaxX = currentMinX + currentWidth
  const currentMaxY = currentMinY + currentHeight

  logger.debug(`[adjustViewBoxForContent] Current viewBox: ${currentMinX} ${currentMinY} ${currentWidth} ${currentHeight}`)

  const focusedBounds = stateModel === 'fluidSystems'
    ? getFocusedFluidSystemsBounds(svg, matchedStaffLineBlocks, measureBlockMap)
    : null

  if (focusedBounds) {
    const padding = 50
    const minX = focusedBounds.minX - padding
    const minY = focusedBounds.minY - padding
    const maxX = focusedBounds.maxX + padding
    const maxY = focusedBounds.maxY + padding
    const width = maxX - minX
    const height = maxY - minY

    logger.info(`[adjustViewBoxForContent] Focused fluidSystems bounds: (${minX.toFixed(0)}, ${minY.toFixed(0)}) to (${maxX.toFixed(0)}, ${maxY.toFixed(0)})`)
    logger.info(`[adjustViewBoxForContent] Focused fluidSystems viewBox: ${minX.toFixed(0)} ${minY.toFixed(0)} ${width.toFixed(0)} ${height.toFixed(0)}`)

    targetSvg.setAttribute('data-bw-focused-viewbox', 'true')
    targetSvg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`)
    return
  }

  targetSvg.removeAttribute('data-bw-focused-viewbox')

  // Find all elements with animations
  const animatedElements = svg.querySelectorAll('animate[attributeName], animateTransform[attributeName="transform"]')

  if (animatedElements.length === 0) {
    logger.warn('[adjustViewBoxForContent] No animated elements found')
    return
  }

  // Start with current viewBox bounds
  let minX = currentMinX
  let minY = currentMinY
  let maxX = currentMaxX
  let maxY = currentMaxY

  // Parse all animation values to find coordinate bounds
  // Check ALL states since the viewBox needs to encompass content in all animation phases
  animatedElements.forEach(anim => {
    const parent = anim.parentElement
    if (!parent) return

    const attributeName = anim.getAttribute('attributeName')
    const values = anim.getAttribute('values')
    if (!values) return

    // Split animation values (semicolon-separated states)
    // States order: finding, normalization, readingOrder, regulation, supplements, interventions
    const states = values.split(';')

    // Check all states to find maximum bounds
    states.forEach(stateValue => {
      let coords = []

      if (attributeName === 'transform' || anim.tagName === 'animateTransform') {
        // Handle translate: "x y" or "x,y"
        coords = parseTranslateValue(stateValue)
      } else if (attributeName === 'd') {
        // Handle path d attribute: "M x y L x y C x y x y x y ..."
        coords = parsePathD(stateValue)
      } else if (attributeName === 'points') {
        // Handle polyline points: "x1,y1 x2,y2 x3,y3"
        coords = parsePoints(stateValue)
      }

      // Expand bounds if animated content goes beyond current viewBox
      coords.forEach(coord => {
        if (coord.x < minX) {
          minX = coord.x
        }
        if (coord.x > maxX) {
          maxX = coord.x
        }
        if (coord.y < minY) {
          minY = coord.y
        }
        if (coord.y > maxY) {
          maxY = coord.y
        }
      })
    })
  })

  // Check if we found valid bounds
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    logger.warn('[adjustViewBoxForContent] Could not determine content bounds')
    return
  }

  // Add minimal padding (in AT coordinate units)
  const padding = 50
  minX -= padding
  minY -= padding
  maxX += padding
  maxY += padding

  const width = maxX - minX
  const height = maxY - minY

  logger.info(`[adjustViewBoxForContent] Content bounds: (${minX.toFixed(0)}, ${minY.toFixed(0)}) to (${maxX.toFixed(0)}, ${maxY.toFixed(0)})`)
  logger.info(`[adjustViewBoxForContent] New viewBox: ${minX.toFixed(0)} ${minY.toFixed(0)} ${width.toFixed(0)} ${height.toFixed(0)}`)

  // Update viewBox on the target SVG (either root or nested)
  targetSvg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`)
}

/**
 * Compute a tighter focus box for the currently matched fluidSystems block set.
 * This intentionally ignores unmatched containers so the current writing-zone
 * context is framed instead of the full AT page width.
 *
 * @param {SVGElement} svg - The fluid SVG root.
 * @param {Set<number>|null} matchedStaffLineBlocks - Blocks matched to current DT context.
 * @param {Map<string, number>|null} measureBlockMap - AT measure -> block map.
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null} Focus bounds.
 */
const getFocusedFluidSystemsBounds = (svg, matchedStaffLineBlocks, measureBlockMap) => {
  if (!(matchedStaffLineBlocks instanceof Set) || matchedStaffLineBlocks.size === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const rastrumLines = Array.from(svg.querySelectorAll('path.rastrum[data-bw-block]')).filter(line => {
    const blockIndex = Number.parseInt(line.getAttribute('data-bw-block') || '', 10)
    return Number.isFinite(blockIndex) && matchedStaffLineBlocks.has(blockIndex)
  })

  rastrumLines.forEach(line => {
    expandBounds(minMaxFromLinePath(line), line)
  })

  if (measureBlockMap instanceof Map) {
    const matchedMeasures = Array.from(svg.querySelectorAll('g.measure[data-id]')).filter(measure => {
      if (measure.closest('[data-bw-unmatched-container="true"]')) return false
      const measureId = measure.getAttribute('data-id')
      const blockIndex = measureBlockMap.get(measureId)
      return Number.isFinite(blockIndex) && matchedStaffLineBlocks.has(blockIndex)
    })

    matchedMeasures.forEach(measure => {
      expandBounds(getElementBounds(measure), measure)
    })
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }

  return { minX, minY, maxX, maxY }

  function expandBounds (localBounds, element) {
    if (!localBounds) return
    const offset = getCumulativeTranslate(element, svg)
    minX = Math.min(minX, localBounds.minX + offset.x)
    minY = Math.min(minY, localBounds.minY + offset.y)
    maxX = Math.max(maxX, localBounds.maxX + offset.x)
    maxY = Math.max(maxY, localBounds.maxY + offset.y)
  }
}

/**
 * Collect bounds for a container by inspecting its geometric descendants.
 *
 * @param {Element} container - Container to inspect.
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null} Bounds.
 */
const getElementBounds = (container) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const elements = [container, ...container.querySelectorAll('*')]
  elements.forEach(element => {
    const localBounds = getLocalGeometryBounds(element)
    if (!localBounds) return
    const offset = getCumulativeTranslate(element, container)
    minX = Math.min(minX, localBounds.minX + offset.x)
    minY = Math.min(minY, localBounds.minY + offset.y)
    maxX = Math.max(maxX, localBounds.maxX + offset.x)
    maxY = Math.max(maxY, localBounds.maxY + offset.y)
  })

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }

  return { minX, minY, maxX, maxY }
}

/**
 * Extract local geometry bounds from a single SVG element.
 *
 * @param {Element} element - SVG element to inspect.
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null} Bounds.
 */
const getLocalGeometryBounds = (element) => {
  if (!element?.getAttribute) return null

  if (element.localName === 'path') {
    const d = element.getAttribute('d')
    return minMaxFromCoords(parsePathD(d))
  }

  if (element.localName === 'polygon' || element.localName === 'polyline') {
    return minMaxFromCoords(parsePoints(element.getAttribute('points')))
  }

  if (element.localName === 'use') {
    const offset = parseTranslateAttribute(element.getAttribute('transform'))
    if (!offset) return null
    return { minX: offset.x, minY: offset.y, maxX: offset.x, maxY: offset.y }
  }

  if (element.localName === 'rect') {
    const x = parseFloat(element.getAttribute('x') || '0')
    const y = parseFloat(element.getAttribute('y') || '0')
    const width = parseFloat(element.getAttribute('width') || '0')
    const height = parseFloat(element.getAttribute('height') || '0')
    return { minX: x, minY: y, maxX: x + width, maxY: y + height }
  }

  if (element.localName === 'line') {
    const x1 = parseFloat(element.getAttribute('x1') || '0')
    const y1 = parseFloat(element.getAttribute('y1') || '0')
    const x2 = parseFloat(element.getAttribute('x2') || '0')
    const y2 = parseFloat(element.getAttribute('y2') || '0')
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2)
    }
  }

  if (element.localName === 'circle') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const r = parseFloat(element.getAttribute('r') || '0')
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r }
  }

  if (element.localName === 'ellipse') {
    const cx = parseFloat(element.getAttribute('cx') || '0')
    const cy = parseFloat(element.getAttribute('cy') || '0')
    const rx = parseFloat(element.getAttribute('rx') || '0')
    const ry = parseFloat(element.getAttribute('ry') || '0')
    return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry }
  }

  return null
}

/**
 * Convert coordinates into min/max bounds.
 *
 * @param {Array<{x: number, y: number}>} coords - Coordinates to reduce.
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null} Bounds.
 */
const minMaxFromCoords = (coords) => {
  if (!Array.isArray(coords) || coords.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  coords.forEach(coord => {
    minX = Math.min(minX, coord.x)
    minY = Math.min(minY, coord.y)
    maxX = Math.max(maxX, coord.x)
    maxY = Math.max(maxY, coord.y)
  })

  return { minX, minY, maxX, maxY }
}

/**
 * Extract bounds from a straight-line path.
 *
 * @param {Element} path - Path element.
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null} Bounds.
 */
const minMaxFromLinePath = (path) => {
  const d = path?.getAttribute?.('d') || ''
  return minMaxFromCoords(parsePathD(d))
}

/**
 * Sum translate transforms from an element up to a stop node.
 *
 * @param {Element} element - Starting element.
 * @param {Element} stopAt - Ancestor at which to stop.
 * @returns {{x: number, y: number}} Translate offset.
 */
const getCumulativeTranslate = (element, stopAt) => {
  let x = 0
  let y = 0
  let current = element

  while (current && current !== stopAt) {
    const offset = parseTranslateAttribute(current.getAttribute?.('transform'))
    if (offset) {
      x += offset.x
      y += offset.y
    }
    current = current.parentElement
  }

  return { x, y }
}

/**
 * Parse a translate transform string.
 *
 * @param {string|null} transform - Transform attribute.
 * @returns {{x: number, y: number}|null} Parsed translate.
 */
const parseTranslateAttribute = (transform) => {
  if (!transform) return null

  let totalX = 0
  let totalY = 0
  let matched = false
  const pattern = /translate\(([-\d.]+)(?:[ ,]+([-\d.]+))?\)/g
  let match

  while ((match = pattern.exec(transform)) !== null) {
    matched = true
    totalX += parseFloat(match[1])
    totalY += parseFloat(match[2] || '0')
  }

  return matched ? { x: totalX, y: totalY } : null
}

/**
 * Parse translate value: "x y" or "x,y"
 *
 * @param {string} value - Translate value
 * @returns {Array<{x: number, y: number} >} Array with one coordinate
 */
const parseTranslateValue = (value) => {
  if (!value || value.trim() === '') return []

  // Handle both "x y" and "x,y" formats
  const match = value.trim().match(/^([-\d.]+)[,\s]+([-\d.]+)$/)
  if (!match) return []

  return [{
    x: parseFloat(match[1]),
    y: parseFloat(match[2])
  }]
}

/**
 * Parse SVG path d attribute to extract all coordinates
 *
 * @param {string} d - Path d attribute value
 * @returns {Array<{x: number, y: number} >} Array of coordinates
 */
const parsePathD = (d) => {
  if (!d || d.trim() === '') return []

  const coords = []

  // Match all coordinate pairs in the path
  // Handles M, L, C commands with their coordinates
  const coordPattern = /([-\d.]+)[,\s]+([-\d.]+)/g
  let match

  while ((match = coordPattern.exec(d)) !== null) {
    coords.push({
      x: parseFloat(match[1]),
      y: parseFloat(match[2])
    })
  }

  return coords
}

/**
 * Parse polyline points attribute: "x1,y1 x2,y2 x3,y3"
 *
 * @param {string} points - Points attribute value
 * @returns {Array<{x: number, y: number} >} Array of coordinates
 */
const parsePoints = (points) => {
  if (!points || points.trim() === '') return []

  const coords = []

  // Split by whitespace to get individual "x,y" pairs
  const pairs = points.trim().split(/\s+/)

  pairs.forEach(pair => {
    const match = pair.match(/^([-\d.]+),([-\d.]+)$/)
    if (match) {
      coords.push({
        x: parseFloat(match[1]),
        y: parseFloat(match[2])
      })
    }
  })

  return coords
}
