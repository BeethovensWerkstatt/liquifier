import { appendNewElement } from '../utils/dom.js'
import { liquifyNotes } from './liquify/notes.js'
import { liquifyBarlines } from './liquify/barlines.js'
import { liquifyCurves } from './liquify/curves.js'
import { liquifyAccids } from './liquify/accids.js'
import { liquifyRests } from './liquify/rests.js'
import { liquifyBeams } from './liquify/beams.js'
import { liquifyMeterSigs } from './liquify/meterSigs.js'
import { liquifyClefs } from './liquify/clefs.js'
import { liquifyChords } from './liquify/chords.js'
import { liquifyTrills } from './liquify/trills.js'
import { liquifyFermatas } from './liquify/fermatas.js'
import { liquifyPedals } from './liquify/pedals.js'
import { liquifyFings } from './liquify/fings.js'
import { liquifyFs } from './liquify/fs.js'
import { liquifyArtics } from './liquify/artics.js'
import { liquifyDynams } from './liquify/dynams.js'
import { liquifyTempo } from './liquify/tempo.js'
import { liquifyDirs } from './liquify/dirs.js'
import { liquifyHairpins } from './liquify/hairpins.js'

const duration = '5s'
const repeatCount = 'indefinite'
const reverseAnimations = false

/**
 * Calculate the center of DT system based on rastrum bounding boxes
 * Takes into account rotation and the visible viewBox area
 * @param {Object} svg - DT SVG DOM
 * @returns {Object} {x, y} coordinates of the center
 */
const calculateDtSystemCenter = (svg) => {
  // Get all rastrum bounding boxes
  const rastrumBBoxes = svg.querySelectorAll('g.rastrum.bounding-box rect')
  
  if (rastrumBBoxes.length === 0) {
    throw new Error('No rastrum bounding boxes found in DT SVG')
  }
  
  // Calculate bounds of all rastrums
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  
  rastrumBBoxes.forEach(rect => {
    const x = parseFloat(rect.getAttribute('x'))
    const y = parseFloat(rect.getAttribute('y'))
    const width = parseFloat(rect.getAttribute('width'))
    const height = parseFloat(rect.getAttribute('height'))
    
    // Get the transform-origin from parent rastrum group
    const rastrumGroup = rect.closest('g.rastrum')
    const style = rastrumGroup?.getAttribute('style')
    let transformOriginX = x + width / 2
    let transformOriginY = y + height / 2
    let rotation = 0
    
    if (style) {
      const rotateMatch = style.match(/rotate\(([-\d.]+)deg\)/)
      const originMatch = style.match(/transform-origin:\s*([\d.]+)px\s+([\d.]+)px/)
      
      if (rotateMatch) {
        rotation = parseFloat(rotateMatch[1])
      }
      if (originMatch) {
        transformOriginX = parseFloat(originMatch[1])
        transformOriginY = parseFloat(originMatch[2])
      }
    }
    
    // For small rotations (<1°), we can approximate the bounding box
    // without doing full rotation math (the effect is negligible)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x + width)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y + height)
  })
  
  const viewBox = svg.getAttribute('viewBox').split(' ').map(Number)
  const [vbx, vby, vbWidth, vbHeight] = viewBox

  // Calculate center of all rastrums
  const xCenter = vbx // parseFloat((minX + maxX) / 2)
  const yCenter = parseFloat((minY + maxY) / 2)

  return {
    x: xCenter,
    y: yCenter
  }
}

/**
 * Calculate the center of AT system based on staff lines
 * @param {Object} svg - AT SVG DOM
 * @returns {Object} {x, y} coordinates of the center
 */
const calculateAtSystemCenter = (svg) => {
  // Get horizontal center from viewBox or width
  const staffLines = svg.querySelectorAll('g.staff:not(.bounding-box) > path')
  let top = Infinity
  let bottom = -Infinity
  let left = Infinity
  let right = -Infinity
  
  staffLines.forEach(path => {
    const d = path.getAttribute('d')
    const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
    if (match) {
      const x1 = parseFloat(match[1])
      const y1 = parseFloat(match[2])
      const x2 = parseFloat(match[3])
      const y2 = parseFloat(match[4])
      
      top = Math.min(top, y1)
      bottom = Math.max(bottom, y1)
      left = Math.min(left, x1)
      right = Math.max(right, x2)
    }
  })

  const xCenter = left // left + ((right - left) / 2)
  const yCenter = top + ((bottom - top) / 2)

  return {
    x: xCenter,
    y: yCenter
  }
}

/**
 * Calculate scale factor between DT and AT system pairs based on staff height
 * @param {Object} dtSystemSvg - DT system SVG DOM
 * @param {Object} atSystemSvg - AT system SVG DOM
 * @returns {number} Scale factor to apply to DT to match AT
 */
export const calculateScaleFactor = (dtSystemSvg, atSystemSvg) => {
  // Get the average DT staff height
  let avgDtStaffHeight = 0
  const dtRastrums = dtSystemSvg.querySelectorAll('g.rastrum.bounding-box rect')
  dtRastrums.forEach(rastrum => {
    avgDtStaffHeight += parseFloat(rastrum.getAttribute('height')) || 0
  })
  avgDtStaffHeight /= dtRastrums.length || 1

  // Get the AT staff height
  const firstStaffLines = [...atSystemSvg.querySelector('g.staff:not(.bounding-box)').children].filter(child => child.nodeName.toLowerCase() === 'path')
  const atStaffLineYs = firstStaffLines.map(path => {
    const d = path.getAttribute('d')
    return parseFloat(d.split(' ')[1])
  })
  const atStaffHeight = Math.abs(atStaffLineYs[4] - atStaffLineYs[0])

  // Scale factor to transform DT to match AT
  return atStaffHeight / avgDtStaffHeight
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
      const arr = corresp
        .trim()
        .replace(/\s+/g, ' ')  // Replace multiple whitespaces with single space
        .split(' ')
        .map(corresp => corresp.split('#')[1])
        .filter(id => id && id.length > 0)  // Filter out empty strings
      mappings.set(atId, arr)
    }
  })
  
  return mappings
}

/**
 * Generate fluid transcription by pairing DT and AT system SVGs
 * @param {Object} dtSystemSvg - DT system SVG DOM (document or svg element)
 * @param {Object} atSystemSvg - AT system SVG DOM (document or svg element)
 * @param {Document} atMeiDom - AT MEI DOM (for corresp mappings)
 * @param {Object} logger - Logger instance for info/debug/warn/error messages
 * @returns {Object} Fluid transcription SVG DOM
 */
export const generateFluidTranscription = (dtSystemSvg, atSystemSvg, atMeiDom, logger) => {
  // Handle both document and element inputs
  const dtSvgElement = dtSystemSvg.documentElement || dtSystemSvg
  const atSvgElement = atSystemSvg.documentElement || atSystemSvg

  const correspMappings = extractCorrespMappings(atMeiDom)
  
  // Calculate scale factor
  const scaleFactor = calculateScaleFactor(dtSvgElement, atSvgElement)
  
  // Calculate system centers
  const dtCenter = calculateDtSystemCenter(dtSvgElement)
  const atCenter = calculateAtSystemCenter(atSvgElement)

  // Clone AT SVG as the base for fluid transcription
  const ftSvg = atSvgElement.cloneNode(true)

  adjustAtStaffLines(ftSvg)
  adjustDtStaffLines(dtSvgElement)

  // helper function that will get the translation between two points
  const getNewPos = (at = { x, y }, dt = { x, y }) => {
    const atOffX = atCenter.x - at.x
    const atOffY = atCenter.y - at.y
    const dtOffX = dtCenter.x - dt.x
    const dtOffY = dtCenter.y - dt.y

    const diffX =  atOffX - dtOffX * scaleFactor // ((dtOffX * scaleFactor) - atOffX) * -1
    const diffY =  atOffY - dtOffY * scaleFactor // ((dtOffY * scaleFactor) - atOffY) * 1
    const newPos = { x: Math.round(at.x + diffX), y: Math.round(at.y + diffY) }
    logger.debug(`[Position Diff] AT: (${at.x}, ${at.y}), DT: (${dt.x}, ${dt.y}) => newPos: (${newPos.x}, ${newPos.y})`)
    return newPos
  }

  /**
   * Convert all coordinates in a path's d attribute using getNewPos transformation
   * 
   * Parses the path d attribute, extracts all coordinate pairs, transforms them using
   * getNewPos (which applies scale factor and coordinate system transformations), and
   * reconstructs the path string with the new coordinates.
   * 
   * Supports path commands: M (moveto), L (lineto), H (horizontal), V (vertical), 
   * C (cubic bezier), S (smooth cubic), Q (quadratic), T (smooth quadratic), A (arc)
   * 
   * @param {string} atD - The AT path's d attribute
   * @param {string} dtD - The DT path's d attribute (same shape, different coordinates)
   * @returns {string} New d attribute with transformed coordinates
   */
  const convertD = (atD, dtD) => {
    // Parse coordinates from both paths
    const atCoords = []
    const dtCoords = []
    
    // Regex to match coordinate pairs (handles both space and comma separated)
    const coordRegex = /([-\d.]+)[,\s]+([-\d.]+)/g
    
    let match
    while ((match = coordRegex.exec(atD)) !== null) {
      atCoords.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) })
    }
    
    coordRegex.lastIndex = 0
    while ((match = coordRegex.exec(dtD)) !== null) {
      dtCoords.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) })
    }
    
    // Transform all coordinates
    const newCoords = atCoords.map((atPos, i) => {
      const dtPos = dtCoords[i] || atPos // fallback if coords don't match
      return getNewPos(atPos, dtPos)
    })
    
    // Reconstruct the path by replacing coordinates in the original AT path
    let coordIndex = 0
    const newD = atD.replace(coordRegex, () => {
      const coord = newCoords[coordIndex++]
      return `${coord.x} ${coord.y}`
    })
    
    return newD
  }

  animateStaffLines(ftSvg, dtSvgElement, convertD, setAnimation, logger)

  const tools = { getNewPos, convertD, scaleFactor, correspMappings, setAnimation, logger }

  liquifyMusic(ftSvg, dtSvgElement, atMeiDom, tools)

  return ftSvg
}

/**
 * Adjust AT staff lines to have only one continuous path per line across all measures
 * @param {Object} svg - AT SVG DOM
 */
const adjustAtStaffLines = (svg) => {
  const staffLines = svg.querySelectorAll('g.staff:not(.bounding-box) > path')

  let left = Infinity
  let right = -Infinity
  
  // get left/right extent of staff lines
  staffLines.forEach(path => {
    const d = path.getAttribute('d')
    const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
    if (match) {
      left = Math.min(left, parseFloat(match[1]))
      right = Math.max(right, parseFloat(match[3]))
    }
  })

  svg.querySelectorAll('.measure:not(.bounding-box)').forEach((measure, i) => {
    const staffLinesInMeasure = measure.querySelectorAll('g.staff:not(.bounding-box) > path')
    if (i === 0) {
      // First measure: extend lines to the right
      staffLinesInMeasure.forEach(path => {
        const d = path.getAttribute('d')
        const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
        if (match) {
          const y = parseFloat(match[2])
          const newD = `M${left} ${y} L${right} ${y}`
          path.setAttribute('d', newD)
          path.classList.add('rastrum')
        }
      })
    } else {
      // remove staff lines in other measures
      staffLinesInMeasure.forEach(path => {
        path.remove()
      })
    }
  })
}

/**
 * Cut DT staff lines to fit within the viewBox
 * @param {*} svg 
 */
const adjustDtStaffLines = (svg) => {
  const viewBox = svg.getAttribute('viewBox').split(' ').map(Number)
  const [vbx, vby, vbWidth, vbHeight] = viewBox
  const staffLines = svg.querySelectorAll('.rastrum:not(.bounding-box) > path')
  staffLines.forEach(path => {
    const d = path.getAttribute('d')
    const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
    if (match) {
      let x1 = Math.max(parseFloat(match[1]), vbx)
      let x2 = Math.min(parseFloat(match[3]), vbx + vbWidth)
      const y = parseFloat(match[2])
      const newD = `M${x1} ${y} L${x2} ${y}`
      path.setAttribute('d', newD)
    }
  })
}

/**
 * Animate staff lines between AT and DT transcriptions
 * 
 * Pairs each staff line from the fluid transcription with its corresponding DT staff line
 * and creates animations for the `d` attribute (path data) to morph between the two positions.
 * 
 * Uses the `convertD` function to transform all coordinates in the path, which applies
 * scale factor and coordinate system transformations.
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Function} convertD - Function to convert path d attribute: (atD, dtD) => newD
 * @param {Function} setAnimation - Function to create 5-state animations from descriptors
 * @param {Object} logger - Logger instance
 */
const animateStaffLines = (ftSvg, dtSvg, convertD, setAnimation, logger) => {
  const ftStaffLines = ftSvg.querySelectorAll('path.rastrum')
  const dtStaffLines = dtSvg.querySelectorAll('.rastrum:not(.bounding-box) > path')

  ftStaffLines.forEach((ftLine, i) => {
    const dtLine = dtStaffLines[i]
    
    if (!dtLine) {
      logger.warn(`[animateStaffLines] No corresponding DT staff line for FT line ${i}`)
      return
    }
    
    const atD = ftLine.getAttribute('d')
    const dtD = dtLine.getAttribute('d')
    
    // Use convertD to transform all coordinates
    const newD = convertD(atD, dtD)

    logger.debug(`[Animating Staff Line ${i}] AT D: ${atD}, DT D: ${newD}`)

    setAnimation({
      element: ftLine,
      id: `staff-line-${i}`,
      localName: 'staff-line',
      states: {
          findings: { type: 'd', val: newD },
          diplomatic: { type: 'd', val: newD },
          supplements: { type: 'd', val: atD },
          conjectures: { type: 'd', val: atD },
          annotated: { type: 'd', val: atD }
        }
    })
  })
}

/**
 * Orchestrate animation of all musical events (notes, rests, chords, etc.) between AT and DT transcriptions
 * 
 * This function serves as the main coordinator for animating all types of musical notation elements.
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data:
 *   - getNewPos: Function to calculate new position
 *   - convertD: Function to convert path d attribute
 *   - scaleFactor: Scale factor between DT and AT
 *   - correspMappings: Map of AT to DT element IDs
 *   - addTransform: Function to add animate element
 *   - addTransformTranslate: Function to add animateTransform element
 *   - generateHideAnimation: Function to generate fade-out animation
 */
const liquifyMusic = (ftSvg, dtSvg, atMeiDom, tools) => {
  // events
  liquifyNotes(ftSvg, dtSvg, atMeiDom, tools)
  liquifyBarlines(ftSvg, dtSvg, atMeiDom, tools)
  liquifyRests(ftSvg, dtSvg, atMeiDom, tools)
  liquifyChords(ftSvg, dtSvg, atMeiDom, tools)
  liquifyAccids(ftSvg, dtSvg, atMeiDom, tools)
  liquifyClefs(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyDots(ftSvg, dtSvg, atMeiDom, tools)
  liquifyMeterSigs(ftSvg, dtSvg, atMeiDom, tools)
  liquifyArtics(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyTupletNums(ftSvg, dtSvg, atMeiDom, tools)

  // controlevents
  liquifyBeams(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyRepeats(ftSvg, dtSvg, atMeiDom, tools)
  liquifyDirs(ftSvg, dtSvg, atMeiDom, tools)
  liquifyTempo(ftSvg, dtSvg, atMeiDom, tools)
  liquifyDynams(ftSvg, dtSvg, atMeiDom, tools)
  liquifyCurves(ftSvg, dtSvg, atMeiDom, tools)
  liquifyHairpins(ftSvg, dtSvg, atMeiDom, tools)
  liquifyTrills(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyOctaves(ftSvg, dtSvg, atMeiDom, tools)
  liquifyFermatas(ftSvg, dtSvg, atMeiDom, tools)
  liquifyPedals(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyWords(ftSvg, dtSvg, atMeiDom, tools)
  liquifyFings(ftSvg, dtSvg, atMeiDom, tools)
  liquifyFs(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyMetamarks(ftSvg, dtSvg, atMeiDom, tools)
}

/**
 * Add an SVG animateTransform element for translate animations
 * 
 * Creates an `<animateTransform>` element with type="translate" to animate the position
 * of an SVG element. The animation transitions between the provided values using the
 * global duration and repeat settings.
 * 
 * @param {SVGElement} node - The SVG element to add the animation to
 * @param {string[]} values - Array of translate values (e.g., ["0 0", "100 50"]) representing
 *                            the start and end positions as "x y" strings
 */
const addTransformTranslate = (node, values = []) => {
  const anim = appendNewElement(node, 'animateTransform', 'http://www.w3.org/2000/svg')
  anim.setAttribute('attributeName', 'transform')
  anim.setAttribute('attributeType', 'XML')
  anim.setAttribute('type', 'translate')

  const reverse = reverseAnimations ? values.slice(0, -1).reverse() : []
  anim.setAttribute('values', values.concat(reverse).join(';'))
  anim.setAttribute('repeatCount', repeatCount)
  anim.setAttribute('dur', duration)
  // anim.setAttribute('calcMode', 'spline')
}

/**
 * Add an SVG animate element for animating any attribute
 * 
 * Creates an `<animate>` element to animate any SVG attribute (e.g., `d`, `opacity`, `fill`).
 * The animation transitions between the provided values using the global duration and repeat settings.
 * 
 * @param {SVGElement} node - The SVG element to add the animation to
 * @param {string} attribute - The name of the attribute to animate (e.g., "d", "opacity", "fill")
 * @param {string[]} values - Array of attribute values representing the animation states
 */
const addTransform = (node, attribute, values = []) => {
  const anim = appendNewElement(node, 'animate', 'http://www.w3.org/2000/svg')
  anim.setAttribute('attributeName', attribute)
  
  const reverse = reverseAnimations ? values.slice(0, -1).reverse() : []
  anim.setAttribute('values', values.concat(reverse).join(';'))
  anim.setAttribute('repeatCount', repeatCount)
  anim.setAttribute('dur', duration)
  // anim.setAttribute('calcMode', 'spline')
}

/**
 * Set animation for an element based on a 5-state descriptor
 * 
 * This is the central animation function that handles the five editorial states:
 * findings → diplomatic → supplements → conjectures → annotated
 * 
 * The supplements phase is split into two sub-phases:
 * 1. Position animations complete (all elements move to final positions)
 * 2. Opacity animations complete (editorial additions fade in)
 * 
 * This creates a 6-frame animation where movement happens before editorial content appears.
 * 
 * The descriptor contains state definitions for each phase. Missing states are filled with defaults:
 * - diplomatic defaults to findings
 * - supplements and conjectures default to annotated
 * 
 * Null states indicate the element doesn't exist in that phase and will be hidden (opacity: 0).
 * 
 * @param {Object} descriptor - Animation descriptor with the following structure:
 * @param {SVGElement} descriptor.element - The SVG element to animate
 * @param {string} descriptor.id - The element's ID (for logging)
 * @param {string} descriptor.localName - The element's type (e.g., 'note', 'artic')
 * @param {Object} descriptor.states - State definitions for each phase
 * @param {Object} [descriptor.states.findings] - State in findings phase (original manuscript)
 * @param {Object} [descriptor.states.diplomatic] - State in diplomatic phase (defaults to findings)
 * @param {Object} [descriptor.states.supplements] - State in supplements phase (defaults to annotated)
 * @param {Object} [descriptor.states.conjectures] - State in conjectures phase (defaults to annotated)
 * @param {Object} [descriptor.states.annotated] - State in annotated phase (Verovio rendering)
 * 
 * Each state object has:
 * @param {string} state.type - Animation type: 'translate', 'd', 'opacity', etc.
 * @param {string} state.val - The value for that state
 * 
 * Example:
 * {
 *   element: noteElement,
 *   id: 'note-123',
 *   localName: 'note',
 *   states: {
 *     findings: { type: 'translate', val: '0 0' },
 *     annotated: { type: 'translate', val: '100 50' }
 *   }
 * }
 */
const setAnimation = (descriptor) => {
  const { element, id, localName, states } = descriptor
  
  // Fill in missing states with defaults
  const findings = states.findings || null
  const diplomatic = states.diplomatic || findings
  const annotated = states.annotated || null
  const supplements = states.supplements || annotated
  const conjectures = states.conjectures || annotated
  
  const allStates = [findings, diplomatic, supplements, conjectures, annotated]
  
  // Handle case where element doesn't exist in some states (null values)
  // Check if we need to handle visibility/opacity animations
  const hasNullStates = allStates.some(state => state === null)
  
  if (hasNullStates) {
    // Create 6-frame opacity animation: split supplements into position + opacity phases
    // findings, diplomatic, supplements-position (still hidden), supplements-opacity (fade in), conjectures, annotated
    const opacityValues = allStates.flatMap(state => {
      if (state === supplements && state !== null) {
        // Split supplements: first frame keeps opacity from previous state, second frame shows element
        const prevState = diplomatic || findings
        const prevOpacity = prevState === null ? '0' : '1'
        return [prevOpacity, '1']  // [supplements-position (hidden/visible based on prev), supplements-opacity (visible)]
      }
      return [state === null ? '0' : '1']
    })
    addTransform(element, 'opacity', opacityValues)
    
    // Apply visual styling for supplied elements
    if (findings === null || diplomatic === null) {
      element.setAttribute('fill', '#009900')
      element.setAttribute('stroke', '#009900')
      const existingClasses = element.getAttribute('class') || ''
      element.setAttribute('class', `${existingClasses} supplied`.trim())
    }
  }
  
  // Get non-null states to determine animation type
  const validStates = allStates.filter(state => state !== null)
  
  if (validStates.length === 0) {
    console.warn(`[setAnimation] No valid states for element ${id} (${localName})`)
    return
  }
  
  // Determine animation type from first valid state
  const animationType = validStates[0].type
  
  // Build 6-frame values array: duplicate supplements for position/opacity split
  const values = allStates.flatMap(state => {
    if (state === supplements) {
      // Duplicate supplements value for both position and opacity phases
      const val = state === null ? (animationType === 'translate' ? '0 0' : animationType === 'opacity' ? '0' : '') : state.val
      return [val, val]
    }
    if (state === null) {
      // For null states, use a neutral/hidden value
      if (animationType === 'translate') return ['0 0']
      if (animationType === 'opacity') return ['0']
      return ['']
    }
    return [state.val]
  })
  
  // Apply the appropriate animation based on type
  if (animationType === 'translate') {
    addTransformTranslate(element, values)
  } else {
    // For 'd', 'opacity', and other attributes
    addTransform(element, animationType, values)
  }
}

/**
 * Generate a fade-out animation for elements without DT correspondence
 * 
 * Creates an opacity animation that fades the element out, indicating it's a supplied/editorial
 * element that doesn't exist in the diplomatic transcript. Also applies visual styling (green color)
 * and adds a "supplied" class to mark the element.
 * 
 * This is used for AT elements that have no matching corresp in the DT, signaling to users
 * that these are editorial additions or interpretations.
 * 
 * @param {SVGElement} node - The SVG element to animate and mark as supplied
 */
const generateHideAnimation = (node) => {
    const hideAnim = appendNewElement(node, 'animate')
    hideAnim.setAttribute('attributeName', 'opacity')

    const values = reverseAnimations ? '1;0;0;0;0;0;1' : '1;0;0;0;' // '1;0;1' : '1;0'

    hideAnim.setAttribute('values', values)
    hideAnim.setAttribute('dur', duration)
    hideAnim.setAttribute('repeatCount', repeatCount)

    node.setAttribute('fill', '#009900')
    node.setAttribute('stroke', '#009900')
    //node.setAttribute.add('data-supplied',1)
    const existingClasses = node.getAttribute('class') || ''
    node.setAttribute('class', `${existingClasses} supplied`.trim())
}
