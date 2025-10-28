import { appendNewElement } from '../utils/dom.js'
import { liquifyNotes } from './liquify/liquifyNotes.js'

const duration = '3s'
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
 * @returns {Object} Fluid transcription SVG DOM
 */
export const generateFluidTranscription = (dtSystemSvg, atSystemSvg, atMeiDom) => {
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
    console.log(`[Position Diff] AT: (${at.x}, ${at.y}), DT: (${dt.x}, ${dt.y}) => newPos: (${newPos.x}, ${newPos.y})`)
    return newPos
  }

  animateStaffLines(ftSvg, dtSvgElement, getNewPos)

  liquifyEvents(ftSvg, dtSvgElement, atMeiDom, scaleFactor, getNewPos, correspMappings)

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
 * The animation calculates new positions for both endpoints of each staff line using the
 * provided `getNewPos` function, which takes into account the coordinate system differences
 * and scale factors between AT and DT.
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Function} getNewPos - Function to calculate new position: (atPos, dtPos) => {x, y}
 */
const animateStaffLines = (ftSvg, dtSvg, getNewPos) => {
  const ftStaffLines = ftSvg.querySelectorAll('path.rastrum')
  const dtStaffLines = dtSvg.querySelectorAll('.rastrum:not(.bounding-box) > path')

  ftStaffLines.forEach((ftLine, i) => {
    const dtLine = dtStaffLines[i]
    
    const ftD = ftLine.getAttribute('d')
    const dtD = dtLine.getAttribute('d')
    
    const ftMatch = ftD.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
    const dtMatch = dtD.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
    
    if (ftMatch && dtMatch) {
      // Extract AT (ftLine) coordinates
      const atX1 = parseFloat(ftMatch[1])
      const atY = parseFloat(ftMatch[2])
      const atX2 = parseFloat(ftMatch[3])
      
      // Extract DT coordinates
      const dtX1 = parseFloat(dtMatch[1])
      const dtY = parseFloat(dtMatch[2])
      const dtX2 = parseFloat(dtMatch[3])
      
      const p1 = getNewPos({ x: atX1, y: atY }, { x: dtX1,  y: dtY })
      const p2 = getNewPos({ x: atX2, y: atY }, { x: dtX2,  y: dtY })

      const atVal = ftD
      const dtVal = 'M' + p1.x + ' ' + p1.y + ' L' + p2.x + ' ' + p2.y 

      console.log(`[Animating Staff Line ${i}] AT D: ${atVal}, DT D: ${dtVal}`)

      addTransform(ftLine, 'd', [atVal, dtVal])
    }
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
 * @param {number} scaleFactor - Scale factor between DT and AT staff heights
 * @param {Function} getNewPos - Function to calculate new position: (atPos, dtPos) => {x, y}
 * @param {Map<string, string[]>} correspMappings - Map of AT element IDs to DT element IDs
 */
const liquifyEvents = (ftSvg, dtSvg, atMeiDom, scaleFactor, getNewPos, correspMappings) => {
  liquifyNotes(ftSvg, dtSvg, atMeiDom, scaleFactor, getNewPos, correspMappings, addTransform, addTransformTranslate, generateHideAnimation)
  /* animateRests(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateChords(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateAccids(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateClefs(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateDots(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateMeterSigs(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateArtics(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateTupletNums(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings) */
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

    const values = reverseAnimations ? '1;0;1' : '1;0'

    hideAnim.setAttribute('values', values)
    hideAnim.setAttribute('dur', duration)
    hideAnim.setAttribute('repeatCount', repeatCount)

    node.setAttribute('fill', '#009900')
    node.setAttribute('stroke', '#009900')
    //node.setAttribute.add('data-supplied',1)
    const existingClasses = node.getAttribute('class') || ''
    node.setAttribute('class', `${existingClasses} supplied`.trim())
}
