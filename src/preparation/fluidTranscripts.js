/**
 * Calculate the center point of a system based on its bounding box
 * @param {Object} svg - SVG DOM of the system
 * @returns {Object} {x, y} coordinates of the center
 */
const calculateSystemCenter = (svg) => {
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox) {
    // Use viewBox if available (DT systems)
    const [x, y, width, height] = viewBox.split(' ').map(parseFloat)
    return {
      x: x + (width / 2),
      y: y + (height / 2)
    }
  }

  // For AT systems without viewBox, calculate bounding box from content
  const width = parseFloat(svg.getAttribute('width'))
  const height = parseFloat(svg.getAttribute('height'))
  
  if (width && height) {
    // Use full width/height with center at (width/2, height/2)
    return {
      x: width / 2,
      y: height / 2
    }
  }

  throw new Error('SVG must have either a viewBox attribute or width/height attributes')
}

/**
 * Calculate scale factor between DT and AT system pairs based on staff height
 * @param {Object} dtSystemSvg - DT system SVG DOM
 * @param {Object} atSystemSvg - AT system SVG DOM
 * @returns {number} Scale factor to apply to DT to match AT
 */
export const calculateScaleFactor = (dtSystemSvg, atSystemSvg) => {
  // Get the first staff's lines from both systems
  const dtStaffLines = getStaffLines(dtSystemSvg)
  const atStaffLines = getStaffLines(atSystemSvg)

  if (!dtStaffLines || !atStaffLines) {
    throw new Error('Could not find staff lines in DT or AT system')
  }

  // Calculate staff height (distance from first to fifth line)
  const dtHeight = calculateStaffHeight(dtStaffLines)
  const atHeight = calculateStaffHeight(atStaffLines)

  // Scale factor to transform DT to match AT
  return atHeight / dtHeight
}

/**
 * Get position of a symbol (note, chord, clef, etc.) in the SVG
 * @param {Element} symbolElement - The SVG element
 * @returns {Object|null} {x, y} coordinates or null if not found
 */
const getSymbolPosition = (symbolElement) => {
  // Try to find a positioned child element (use, path, etc.)
  const use = symbolElement.querySelector('use')
  if (use && use.hasAttribute('x') && use.hasAttribute('y')) {
    return {
      x: parseFloat(use.getAttribute('x')),
      y: parseFloat(use.getAttribute('y'))
    }
  }

  const path = symbolElement.querySelector('path')
  if (path && path.hasAttribute('d')) {
    const d = path.getAttribute('d')
    // Extract first coordinate from path (M x y ...)
    const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)/)
    if (match) {
      return {
        x: parseFloat(match[1]),
        y: parseFloat(match[2])
      }
    }
  }

  // For chords, get the first note's position
  const noteUse = symbolElement.querySelector('.note .notehead use')
  if (noteUse && noteUse.hasAttribute('x') && noteUse.hasAttribute('y')) {
    return {
      x: parseFloat(noteUse.getAttribute('x')),
      y: parseFloat(noteUse.getAttribute('y'))
    }
  }

  return null
}

/**
 * Extract corresp mappings from AT MEI document
 * @param {Document} atMeiDom - AT MEI DOM
 * @returns {Map} Map of atElementId -> dtElementId
 */
const extractCorrespMappings = (atMeiDom) => {
  const mappings = new Map()
  
  // Find all elements with @corresp attribute
  const correspElements = atMeiDom.querySelectorAll('[corresp]')
  
  correspElements.forEach(element => {
    const atId = element.getAttribute('xml:id')
    const corresp = element.getAttribute('corresp')
    
    // Extract DT ID after the # (format: ../path/file.xml#dtId)
    if (atId && corresp && corresp.includes('#')) {
      const dtId = corresp.split('#')[1]
      mappings.set(atId, dtId)
    }
  })
  
  return mappings
}

/**
 * Extract staff line coordinates from an SVG
 * @param {Object} svg - SVG DOM
 * @returns {Array<number>} Y-coordinates of the 5 staff lines
 */
const getStaffLines = (svg) => {
  // For DT: look for rastrum paths (horizontal lines)
  const rastrumPaths = svg.querySelectorAll('g.rastrum path[d*="L"]')
  if (rastrumPaths.length >= 5) {
    const yCoords = []
    for (let i = 0; i < 5; i++) {
      const d = rastrumPaths[i].getAttribute('d')
      // Extract y coordinate from "M x y L x2 y" format
      const y = parseFloat(d.split(' ')[1])
      yCoords.push(y)
    }
    return yCoords
  }

  // For AT: look for Verovio staff paths
  const staffPaths = svg.querySelectorAll('.staff > path')
  if (staffPaths.length >= 5) {
    const yCoords = []
    for (let i = 0; i < 5; i++) {
      const d = staffPaths[i].getAttribute('d')
      // Extract y coordinate
      const y = parseFloat(d.split(' ')[1])
      yCoords.push(y)
    }
    return yCoords
  }

  return null
}

/**
 * Calculate staff height from staff line y-coordinates
 * @param {Array<number>} staffLines - Y-coordinates of 5 staff lines
 * @returns {number} Height from first to fifth line
 */
const calculateStaffHeight = (staffLines) => {
  if (staffLines.length < 5) {
    throw new Error('Need at least 5 staff lines to calculate height')
  }
  // Staff height is the distance from the first line to the fifth line
  return Math.abs(staffLines[4] - staffLines[0])
}

/**
 * Generate fluid transcription by pairing DT and AT system SVGs
 * @param {Object} dtSystemSvg - DT system SVG DOM (document or svg element)
 * @param {Object} atSystemSvg - AT system SVG DOM (document or svg element)
 * @param {Document} atMeiDom - AT MEI DOM (for corresp mappings)
 * @returns {Object} Fluid transcription SVG DOM
 */
export const generateFluidTranscription = (dtSystemSvg, atSystemSvg, atMeiDom) => {
  // Handle both document and element inputs
  const dtSvgElement = dtSystemSvg.documentElement || dtSystemSvg
  const atSvgElement = atSystemSvg.documentElement || atSystemSvg
  
  // Calculate scale factor
  const scaleFactor = calculateScaleFactor(dtSvgElement, atSvgElement)
  
  // Calculate system centers
  const dtCenter = calculateSystemCenter(dtSvgElement)
  const atCenter = calculateSystemCenter(atSvgElement)
  
  // Extract corresp mappings from AT MEI
  const correspMappings = extractCorrespMappings(atMeiDom)
  
  // Clone AT SVG as the base for fluid transcription
  const ftSvg = atSvgElement.cloneNode(true)
  
  // Process each corresp pair
  correspMappings.forEach((dtId, atId) => {
    try {
      // Find elements in SVGs by data-id
      const atElement = ftSvg.querySelector(`[data-id="${atId}"]`)
      const dtElement = dtSvgElement.querySelector(`[data-id="${dtId}"]`)
      
      if (!atElement || !dtElement) {
        // One or both elements not found in SVG - skip
        return
      }
      
      // Get positions
      const atPos = getSymbolPosition(atElement)
      const dtPos = getSymbolPosition(dtElement)
      
      if (!atPos || !dtPos) {
        // Could not determine position - skip
        return
      }
      
      // Calculate relative positions to centers
      const atRelative = {
        x: atPos.x - atCenter.x,
        y: atPos.y - atCenter.y
      }
      
      const dtRelative = {
        x: dtPos.x - dtCenter.x,
        y: dtPos.y - dtCenter.y
      }
      
      // Apply scale factor to DT position
      const dtScaled = {
        x: dtRelative.x * scaleFactor,
        y: dtRelative.y * scaleFactor
      }
      
      // Calculate offset needed to move AT symbol to scaled DT position
      const offset = {
        x: dtScaled.x - atRelative.x,
        y: dtScaled.y - atRelative.y
      }
      
      // Add animation to AT element
      addPositionAnimation(atElement, offset)
      
    } catch (err) {
      console.warn(`Error processing corresp pair ${atId} -> ${dtId}:`, err)
    }
  })
  
  return ftSvg
}

/**
 * Add SVG animation to move element by offset
 * @param {Element} element - SVG element to animate
 * @param {Object} offset - {x, y} offset to animate
 */
const addPositionAnimation = (element, offset) => {
  // Create animateTransform element
  const anim = element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'animateTransform')
  
  anim.setAttribute('attributeName', 'transform')
  anim.setAttribute('attributeType', 'XML')
  anim.setAttribute('type', 'translate')
  
  // Animation values: start at DT position (offset), end at AT position (0,0)
  // Format: "x1 y1; x2 y2; ..."
  const dtPosition = `${offset.x} ${offset.y}`
  const atPosition = '0 0'
  
  // Simple 2-phase animation: DT -> AT
  anim.setAttribute('values', `${dtPosition};${atPosition}`)
  anim.setAttribute('dur', '2s')
  anim.setAttribute('fill', 'freeze')
  anim.setAttribute('repeatCount', 'indefinite')
  
  element.appendChild(anim)
}

// Legacy function - kept for compatibility but not used in new system-based approach
export const generateFluidTranscriptionLegacy = ({ atSvgDom, dtSvgDom, atOutDom, dtOutDom, sourceDom }) => {
  // TODO: Remove this legacy function once new system-based approach is fully integrated
  return null
}

