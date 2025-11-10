/**
 * Adjust viewBox of SVG to encompass all animated content
 * 
 * This post-processing function analyzes all animation values to find the
 * bounding box of all content across all animation states, then adjusts
 * the SVG viewBox to ensure everything is visible with padding.
 * 
 * @param {SVGElement} svg - The SVG element to adjust
 * @param {Object} tools - Tools object containing logger
 */
export const adjustViewBoxForContent = (svg, tools) => {
  const { logger } = tools
  
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
    // States order: findings, diplomatic, supplements-pos, supplements-opacity, conjectures, annotated
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
 * Parse translate value: "x y" or "x,y"
 * @param {string} value - Translate value
 * @returns {Array<{x: number, y: number}>} Array with one coordinate
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
 * @param {string} d - Path d attribute value
 * @returns {Array<{x: number, y: number}>} Array of coordinates
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
 * @param {string} points - Points attribute value
 * @returns {Array<{x: number, y: number}>} Array of coordinates
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
