import { appendNewElement } from '../utils/dom.js'

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

  animateEvents(ftSvg, dtSvgElement, atMeiDom, scaleFactor, getNewPos, correspMappings)

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

const animateEvents = (ftSvg, dtSvg, atMeiDom, scaleFactor, getNewPos, correspMappings) => {
  animateNotes(ftSvg, dtSvg, atMeiDom, scaleFactor, getNewPos, correspMappings)
  /* animateRests(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateChords(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateAccids(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateClefs(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateDots(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateMeterSigs(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateArtics(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings)
  animateTupletNums(ftSvg, dtSvg, atMeiDom, getNewPos, correspMappings) */
}

const animateNotes = (ftSvg, dtSvg, atMeiDom, scaleFactor, getNewPos, correspMappings) => {
  const notes = ftSvg.querySelectorAll('g.note:not(.bounding-box)')
  notes.forEach(note => {
    const atId = note.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)
    if (!dtIds || dtIds.length === 0) return

    // Animate the notehead - extract x, y from transform translate()
    const atHeadUse = note.querySelector('.notehead > use')
    const atHeadTranslate = atHeadUse?.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
    if (!atHeadTranslate) return

    const atHead = { x: parseFloat(atHeadTranslate[1]), y: parseFloat(atHeadTranslate[2]) }

    dtIds.forEach(dtId => {
      const dtNote = dtSvg.querySelector(`g.note[data-id="${dtId}"]`)
      if (!dtNote) return

      const dtHead = { x: parseFloat(dtNote.querySelector('.notehead > use')?.getAttribute('x')),
          y: parseFloat(dtNote.querySelector('.notehead > use')?.getAttribute('y')) }

      // Animate the notehead
      const newHeadPos = getNewPos(atHead, dtHead)
      const atVal = '0 0'
      const dtVal = parseFloat(newHeadPos.x - atHead.x) + ' ' + parseFloat(newHeadPos.y - atHead.y)

      addTransformTranslate(note, [atVal, dtVal])

      // Animate the stem
      const atStem = note.querySelector('.stem > path')
      if (atStem) {
        const dtStem = dtNote.querySelector('.stem > path')
        if (!dtStem) return
        
        const atD = atStem.getAttribute('d')
        const dtD = dtStem.getAttribute('d')
        
        // Parse d attributes to get start and end points
        const atMatch = atD.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
        const dtMatch = dtD.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
        if (!atMatch || !dtMatch) return
        
        // Extract coordinates
        const atX1 = parseFloat(atMatch[1])
        const atY1 = parseFloat(atMatch[2])
        const atX2 = parseFloat(atMatch[3])
        const atY2 = parseFloat(atMatch[4])
        const dtY1 = parseFloat(dtMatch[2])
        const dtY2 = parseFloat(dtMatch[4])
        
        // Calculate stem lengths
        const dtLength = Math.abs(dtY2 - dtY1)
        const newLength = dtLength * scaleFactor
        
        // Get stem direction from MEI - use attribute selector that works in Node.js
        const meiNote = atMeiDom.querySelector(`note[xml\\:id="${atId}"]`)
        const stemDir = meiNote?.getAttribute('stem.dir') || 'up'
        
        // Calculate new d attribute based on stem direction
        let newD, newStemEndY
        if (stemDir === 'up') {
          // Stem goes up: keep bottom (higher y) fixed, extend upward (lower y)
          if (atY1 > atY2) {
            // M is bottom, L is top - keep M fixed
            newStemEndY = atY1 - newLength
            newD = `M${atX1} ${atY1} L${atX2} ${newStemEndY}`
          } else {
            // M is top, L is bottom - keep L fixed
            newStemEndY = atY2 - newLength
            newD = `M${atX1} ${newStemEndY} L${atX2} ${atY2}`
          }
        } else {
          // Stem goes down: keep top (lower y) fixed, extend downward (higher y)
          if (atY1 < atY2) {
            // M is top, L is bottom - keep M fixed
            newStemEndY = atY1 + newLength
            newD = `M${atX1} ${atY1} L${atX2} ${newStemEndY}`
          } else {
            // M is bottom, L is top - keep L fixed
            newStemEndY = atY2 + newLength
            newD = `M${atX1} ${newStemEndY} L${atX2} ${atY2}`
          }
        }
        
        addTransform(atStem, 'd', [atD, newD])
      }
    })
  })
}

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

const addTransform = (node, attribute, values = []) => {
  const anim = appendNewElement(node, 'animate', 'http://www.w3.org/2000/svg')
  anim.setAttribute('attributeName', attribute)
  
  const reverse = reverseAnimations ? values.slice(0, -1).reverse() : []
  anim.setAttribute('values', values.concat(reverse).join(';'))
  anim.setAttribute('repeatCount', repeatCount)
  anim.setAttribute('dur', duration)
  // anim.setAttribute('calcMode', 'spline')
}
