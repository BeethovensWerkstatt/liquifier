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
import { liquifyTupletNums } from './liquify/tupletNums.js'
import { adjustViewBoxForContent } from './liquify/viewbox.js'

const duration = '5s'
const repeatCount = 'indefinite'
const reverseAnimations = false

/**
 * Builds at measure block map for subsequent processing steps.
 *
 * @param {string} atMeiDom - DOM document used by this function.
 * @returns {Map<*, *>} Resulting mapping.
 */
function buildAtMeasureBlockMap (atMeiDom) {
  const map = new Map()
  if (!atMeiDom) return map

  let blockIndex = 0
  let sawMeasure = false
  let startNewBlock = false

  atMeiDom.querySelectorAll('section').forEach(section => {
    Array.from(section.querySelectorAll('sb, measure')).forEach(node => {
      if (node.localName === 'sb') {
        startNewBlock = sawMeasure
        return
      }

      if (node.localName !== 'measure') return

      if (startNewBlock) {
        blockIndex += 1
        startNewBlock = false
      }

      const measureId = node.getAttribute('xml:id')
      if (measureId) map.set(measureId, blockIndex)
      sawMeasure = true
    })
  })

  return map
}

/**
 * Calculate the center of DT system based on rastrum bounding boxes
 * Takes into account rotation and the visible viewBox area
 *
 * @param {Object} svg - DT SVG DOM
 * @returns {Object} {x, y} coordinates of the center
 */
const calculateDtSystemCenter = (svg) => {
  // Get all rastrum bounding boxes
  const rastrumBBoxes = svg.querySelectorAll('g.rastrum.bounding-box rect')

  if (rastrumBBoxes.length === 0) {
    throw new Error('No rastrum bounding boxes found in DT SVG')
  }

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
    if (style) {
      // Rotation metadata may exist on rastrum groups, but current bbox logic intentionally
      // uses the axis-aligned approximation for performance and stability.
    }

    // For small rotations (<1°), we can approximate the bounding box
    // without doing full rotation math (the effect is negligible)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x + width)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y + height)
  })

  const viewBox = svg.getAttribute('viewBox').split(' ').map(Number)
  const [vbx] = viewBox

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
 *
 * @param {Object} svg - AT SVG DOM
 * @returns {Object} {x, y} coordinates of the center
 */
const calculateAtSystemCenter = (svg) => {
  // Get horizontal center from viewBox or width
  let staffLines = svg.querySelectorAll('g.staff:not(.bounding-box) > path')
  if (staffLines.length === 0) {
    staffLines = svg.querySelectorAll('path.rastrum')
  }

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
      top = Math.min(top, y1)
      bottom = Math.max(bottom, y1)
      left = Math.min(left, x1)
      right = Math.max(right, x2)
    }
  })

  if (!Number.isFinite(top) || !Number.isFinite(bottom) || !Number.isFinite(left)) {
    const viewBox = (svg.getAttribute('viewBox') || '0 0 0 0').split(' ').map(Number)
    const [, y, , height] = viewBox
    return {
      x: 0,
      y: Number.isFinite(y) && Number.isFinite(height) ? y + (height / 2) : 0
    }
  }

  const xCenter = left // left + ((right - left) / 2)
  const yCenter = top + ((bottom - top) / 2)

  return {
    x: xCenter,
    y: yCenter
  }
}

/**
 * Calculate scale factor between DT and AT system pairs based on staff height
 *
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
  const safeDtStaffHeight = Number.isFinite(avgDtStaffHeight) && avgDtStaffHeight > 0 ? avgDtStaffHeight : 1

  // Get the AT staff height
  const firstStaff = atSystemSvg.querySelector('g.staff:not(.bounding-box)')
  if (!firstStaff) return 1

  const firstStaffLines = [...firstStaff.children].filter(child => child.nodeName.toLowerCase() === 'path')
  const atStaffLineYs = firstStaffLines.map(path => {
    const d = path.getAttribute('d')
    return parseFloat(d.split(' ')[1])
  }).filter(Number.isFinite)

  let atStaffHeight = 0
  if (atStaffLineYs.length >= 2) {
    const minY = Math.min(...atStaffLineYs)
    const maxY = Math.max(...atStaffLineYs)
    atStaffHeight = Math.abs(maxY - minY)
  }

  if (!Number.isFinite(atStaffHeight) || atStaffHeight <= 0) {
    atStaffHeight = safeDtStaffHeight
  }

  // Scale factor to transform DT to match AT
  return atStaffHeight / safeDtStaffHeight
}

/**
 * Extract corresp mappings from AT MEI document
 *
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
        .replace(/\s+/g, ' ') // Replace multiple whitespaces with single space
        .split(' ')
        .map(corresp => corresp.split('#')[1])
        .filter(id => id && id.length > 0) // Filter out empty strings
      mappings.set(atId, arr)
    }
  })

  return mappings
}

/**
 * Generate fluid transcription by pairing DT and AT system SVGs
 *
 * @param {Object} dtSystemSvg - DT system SVG DOM (document or svg element)
 * @param {Object} atSystemSvg - AT system SVG DOM (document or svg element)
 * @param {Document} atMeiDom - AT MEI DOM (for corresp mappings)
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance for info/debug/warn/error messages
 * @param {Object} options - Structured options object.
 * @returns {Object} Fluid transcription SVG DOM
 */
export const generateFluidTranscription = (dtSystemSvg, atSystemSvg, atMeiDom, logger, options = {}) => {
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

  const measureBlockMap = buildAtMeasureBlockMap(atMeiDom)
  const matchedStaffLineBlocks = options.matchedStaffLineBlocks instanceof Set
    ? options.matchedStaffLineBlocks
    : null
  const blockToDtSystemId = options.blockToDtSystemId instanceof Map
    ? options.blockToDtSystemId
    : null

  adjustAtStaffLines(ftSvg, atMeiDom, measureBlockMap)
  adjustDtStaffLines(dtSvgElement)

  // helper function that will get the translation between two points
  /**
   * Returns new pos from the current data context.
   *
   * @param {{x: number, y: number}} at - Input object used by this function.
   * @param {{x: number, y: number}} dt - Input object used by this function.
   * @returns {void} No return value.
   */
  const getNewPos = (at = { x: 0, y: 0 }, dt = { x: 0, y: 0 }) => {
    const atOffX = atCenter.x - at.x
    const atOffY = atCenter.y - at.y
    const dtOffX = dtCenter.x - dt.x
    const dtOffY = dtCenter.y - dt.y

    const diffX = atOffX - dtOffX * scaleFactor // ((dtOffX * scaleFactor) - atOffX) * -1
    const diffY = atOffY - dtOffY * scaleFactor // ((dtOffY * scaleFactor) - atOffY) * 1
    const newPos = { x: Math.round(at.x + diffX), y: Math.round(at.y + diffY) }
    logger.debug(`[Position Diff] AT: (${at.x}, ${at.y}), DT: (${dt.x}, ${dt.y}) => newPos: (${newPos.x}, ${newPos.y})`)
    return newPos
  }

  /**
   * Convert all coordinates in a path's d attribute using getNewPos transformation
   * Parses the path d attribute, extracts all coordinate pairs, transforms them using
   * getNewPos (which applies scale factor and coordinate system transformations), and
   * reconstructs the path string with the new coordinates.
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

  const stateModel = options.stateModel || 'fluidTranscript'
  const choiceVerticalOffsets = options.choiceVerticalOffsets instanceof Map
    ? options.choiceVerticalOffsets
    : new Map()

  // Expose a no-op getter outside fluidSystems so liquify modules can call one API.
  /**
   * Returns choice vertical offset from the current data context.
   *
   * @param {string} elementId - Identifier for the target element.
   * @returns {number} Resulting numeric value.
   */
  const getChoiceVerticalOffset = (elementId) => {
    if (stateModel !== 'fluidSystems') return 0
    if (!elementId) return 0
    const offset = choiceVerticalOffsets.get(elementId)
    return Number.isFinite(offset) ? offset : 0
  }

  // Build the state-model-specific writer once, then pass through all liquify modules.
  const setAnimationForMode = createAnimationSetter(stateModel)

  animateStaffLines(ftSvg, dtSvgElement, convertD, setAnimationForMode, logger, matchedStaffLineBlocks, blockToDtSystemId)

  const tools = {
    getNewPos,
    convertD,
    scaleFactor,
    correspMappings,
    stateModel,
    getChoiceVerticalOffset,
    setAnimation: setAnimationForMode,
    logger
  }

  liquifyMusic(ftSvg, dtSvgElement, atMeiDom, tools)

  // Adjust viewBox to encompass all animated content
  adjustViewBoxForContent(ftSvg, tools)

  return ftSvg
}

/**
 * Adjust AT staff lines to have only one continuous path per line across all measures
 *
 * @param {Object} svg - AT SVG DOM
 * @param {Document} atMeiDom - AT MEI DOM used to infer reading-order blocks.
 * @param {Map<string, number>} measureBlockMap - Optional precomputed map of AT measure ids to block indices.
 * @returns {void} No return value.
 */
const adjustAtStaffLines = (svg, atMeiDom, measureBlockMap = buildAtMeasureBlockMap(atMeiDom)) => {
  const systemGroups = svg.querySelectorAll('g.system:not(.bounding-box)')

  systemGroups.forEach(system => {
    const measures = Array.from(system.querySelectorAll('g.measure:not(.bounding-box)'))
    if (measures.length === 0) return

    const blockToMeasures = new Map()
    measures.forEach((measure, idx) => {
      const measureId = measure.getAttribute('data-id')
      const block = measureBlockMap.has(measureId) ? measureBlockMap.get(measureId) : idx
      if (!blockToMeasures.has(block)) blockToMeasures.set(block, [])
      blockToMeasures.get(block).push(measure)
    })

    // Remove any previously generated system-level rastrum lines for idempotency.
    system.querySelectorAll(':scope > g.bw-system-rastrum').forEach(group => group.remove())

    const doc = system.ownerDocument || system
    // Keep generated rastrum groups behind existing content while preserving block order.
    const insertionAnchor = system.firstChild
    Array.from(blockToMeasures.entries()).sort((a, b) => a[0] - b[0]).forEach(([block, blockMeasures]) => {
      let left = Infinity
      let right = -Infinity

      blockMeasures.forEach(measure => {
        measure.querySelectorAll('g.staff:not(.bounding-box) > path').forEach(path => {
          const d = path.getAttribute('d')
          const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
          if (!match) return
          left = Math.min(left, parseFloat(match[1]))
          right = Math.max(right, parseFloat(match[3]))
        })
      })

      if (!Number.isFinite(left) || !Number.isFinite(right)) return

      const firstMeasure = blockMeasures[0]
      const templateLines = firstMeasure
        ? Array.from(firstMeasure.querySelectorAll('g.staff:not(.bounding-box) > path'))
        : []

      const systemRastrum = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
      systemRastrum.setAttribute('class', 'bw-system-rastrum')
      systemRastrum.setAttribute('data-bw-block', String(block))

      templateLines.forEach((template, idx) => {
        const d = template.getAttribute('d')
        const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
        if (!match) return

        const y = parseFloat(match[2])
        const strokeWidth = template.getAttribute('stroke-width')
        const stroke = template.getAttribute('stroke')

        const line = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
        line.setAttribute('d', `M${left} ${y} L${right} ${y}`)
        if (strokeWidth) line.setAttribute('stroke-width', strokeWidth)
        if (stroke) line.setAttribute('stroke', stroke)
        line.setAttribute('class', 'rastrum')
        line.setAttribute('data-bw-block', String(block))
        line.setAttribute('data-bw-line-index', String(idx))
        systemRastrum.appendChild(line)
      })

      if (insertionAnchor) {
        system.insertBefore(systemRastrum, insertionAnchor)
      } else {
        system.appendChild(systemRastrum)
      }
    })

    measures.forEach((measure, i) => {
      const staffLinesInMeasure = measure.querySelectorAll('g.staff:not(.bounding-box) > path')
      // Remove measure-owned staff lines so staff lines are truly system-level.
      staffLinesInMeasure.forEach(path => path.remove())
    })
  })
}

/**
 * Cut DT staff lines to fit within the viewBox
 *
 * @param {SVGElement|Document} svg - Source document used by this function.
 * @returns {void} No return value.
 */
const adjustDtStaffLines = (svg) => {
  const viewBox = svg.getAttribute('viewBox').split(' ').map(Number)
  const [vbx, , vbWidth] = viewBox
  const staffLines = svg.querySelectorAll('.rastrum:not(.bounding-box) > path')
  staffLines.forEach(path => {
    const d = path.getAttribute('d')
    const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
    if (match) {
      const x1 = Math.max(parseFloat(match[1]), vbx)
      const x2 = Math.min(parseFloat(match[3]), vbx + vbWidth)
      const y = parseFloat(match[2])
      const newD = `M${x1} ${y} L${x2} ${y}`
      path.setAttribute('d', newD)
    }
  })
}

/**
 * Group FT staff lines by block index and line index.
 *
 * @param {SVGElement[]} staffLines - Staff lines from the fluid transcription SVG.
 * @returns {Map<number, SVGElement[]>} Staff lines grouped by block index.
 */
function groupFtStaffLinesByBlock (staffLines) {
  const byBlock = new Map()

  staffLines.forEach(line => {
    const blockRaw = line.getAttribute('data-bw-block')
    const blockIndex = Number.parseInt(blockRaw, 10)
    if (!Number.isFinite(blockIndex)) return

    if (!byBlock.has(blockIndex)) byBlock.set(blockIndex, [])
    byBlock.get(blockIndex).push(line)
  })

  byBlock.forEach(lines => {
    lines.sort((a, b) => {
      const aIdx = Number.parseInt(a.getAttribute('data-bw-line-index') || '0', 10)
      const bIdx = Number.parseInt(b.getAttribute('data-bw-line-index') || '0', 10)
      return aIdx - bIdx
    })
  })

  return byBlock
}

/**
 * Group DT staff lines by matched AT block index using DT system order.
 *
 * @param {SVGElement|Document} dtSvg - Diplomatic transcript SVG.
 * @param {Set<number>} matchedBlocks - AT block indices that belong to the current DT context.
 * @param {Map<number, string>|null} blockToDtSystemId - Explicit AT block -> DT system id mapping.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance.
 * @returns {Map<number, SVGElement[]>} DT staff lines grouped by matched AT block index.
 */
function groupDtStaffLinesByMatchedBlocks (dtSvg, matchedBlocks, blockToDtSystemId, logger) {
  const byBlock = new Map()
  if (!(matchedBlocks instanceof Set) || matchedBlocks.size === 0) return byBlock
  if (!(blockToDtSystemId instanceof Map) || blockToDtSystemId.size === 0) {
    logger.warn('[animateStaffLines] Missing strict AT block -> DT system mapping; skipping matched DT staff-line alignment.')
    return byBlock
  }

  const sortedBlocks = Array.from(matchedBlocks).sort((a, b) => a - b)
  const dtSystems = Array.from(dtSvg.querySelectorAll('g.system:not(.bounding-box)'))
  const rastrumLinesById = new Map()
  const dtSystemById = new Map()

  dtSystems.forEach(system => {
    const systemId = system.getAttribute('data-id')
    if (!systemId) return
    dtSystemById.set(systemId, system)
  })

  Array.from(dtSvg.querySelectorAll('g.rastrum[data-id]')).forEach(rastrum => {
    const classes = (rastrum.getAttribute('class') || '').split(/\s+/)
    if (classes.includes('bounding-box')) return

    const rastrumId = rastrum.getAttribute('data-id')
    if (!rastrumId) return

    const lines = Array.from(rastrum.children).filter(child => child.localName === 'path')
    rastrumLinesById.set(rastrumId, lines)
  })

  if (dtSystems.length > 0) {
    sortedBlocks.forEach(blockIndex => {
      const systemId = blockToDtSystemId.get(blockIndex)
      const system = systemId ? dtSystemById.get(systemId) : null
      if (!system) {
        logger.warn(`[animateStaffLines] Missing DT system '${systemId || 'unknown'}' for AT block ${blockIndex}.`)
        return
      }

      const nestedLines = Array.from(system.querySelectorAll('.rastrum:not(.bounding-box) > path'))
      if (nestedLines.length > 0) {
        byBlock.set(blockIndex, nestedLines)
        return
      }

      // Some DT renders keep rastrum paths in a top-level group and reference them from staffs.
      const seenRastrumIds = new Set()
      const orderedRastrumIds = []
      Array.from(system.querySelectorAll('g.staff[data-rastrum]')).forEach(staff => {
        const rastrumRef = (staff.getAttribute('data-rastrum') || '').trim()
        const rastrumId = rastrumRef.split(/\s+/)[0]
        if (!rastrumId || seenRastrumIds.has(rastrumId)) return

        seenRastrumIds.add(rastrumId)
        orderedRastrumIds.push(rastrumId)
      })

      const referencedLines = orderedRastrumIds.flatMap(rastrumId => rastrumLinesById.get(rastrumId) || [])
      byBlock.set(blockIndex, referencedLines)
    })

    return byBlock
  }

  const dtLines = Array.from(dtSvg.querySelectorAll('.rastrum:not(.bounding-box) > path'))
  if (sortedBlocks.length === 1) {
    byBlock.set(sortedBlocks[0], dtLines)
  } else if (sortedBlocks.length > 1 && dtLines.length > 0) {
    logger.warn('[animateStaffLines] DT has no system groups; cannot distribute DT staff lines across multiple matched blocks reliably.')
  }

  return byBlock
}

/**
 * Animate staff lines between AT and DT transcriptions
 * Pairs each staff line from the fluid transcription with its corresponding DT staff line
 * and creates animations for the `d` attribute (path data) to morph between the two positions.
 * Uses the `convertD` function to transform all coordinates in the path, which applies
 * scale factor and coordinate system transformations.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Function} convertD - Function to convert path d attribute: (atD, dtD) => newD
 * @param {Function} setAnimation - Function to create six-phase animations from descriptors
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance
 * @param {Set<number>|null} matchedStaffLineBlocks - AT block indices in the current DT page context.
 * @param {Map<number, string>|null} blockToDtSystemId - Explicit AT block -> DT system id mapping.
 * @returns {void} No return value.
 */
const animateStaffLines = (ftSvg, dtSvg, convertD, setAnimation, logger, matchedStaffLineBlocks = null, blockToDtSystemId = null) => {
  const ftStaffLines = Array.from(ftSvg.querySelectorAll('path.rastrum'))

  if (ftStaffLines.length === 0) {
    logger.warn('[animateStaffLines] Missing FT staff lines; skipping staff-line animation')
    return
  }

  const hasBlockFilter = matchedStaffLineBlocks instanceof Set && matchedStaffLineBlocks.size > 0

  if (!hasBlockFilter) {
    const dtStaffLines = Array.from(dtSvg.querySelectorAll('.rastrum:not(.bounding-box) > path'))
    if (dtStaffLines.length === 0) {
      logger.warn('[animateStaffLines] Missing DT staff lines; skipping staff-line animation')
      return
    }

    const targetCount = Math.max(ftStaffLines.length, dtStaffLines.length)
    const expandedFtLines = Array.from({ length: targetCount }).map((_, i) => {
      const baseLine = ftStaffLines[i % ftStaffLines.length]
      if (i < ftStaffLines.length) return baseLine

      const clone = baseLine.cloneNode(true)
      clone.setAttribute('data-bw-staff-clone', String(i))
      baseLine.parentNode.appendChild(clone)
      return clone
    })

    expandedFtLines.forEach((ftLine, i) => {
      const dtLine = dtStaffLines[i % dtStaffLines.length]
      if (!dtLine) return

      const atD = ftLine.getAttribute('d')
      const dtD = dtLine.getAttribute('d')
      const newD = convertD(atD, dtD)

      setAnimation({
        element: ftLine,
        id: `staff-line-${i}`,
        localName: 'staff-line',
        states: {
          finding: { type: 'd', val: newD },
          normalization: { type: 'd', val: newD },
          readingOrder: { type: 'd', val: newD },
          regulation: { type: 'd', val: atD },
          supplements: { type: 'd', val: atD },
          interventions: { type: 'd', val: atD }
        }
      })
    })

    return
  }

  const ftByBlock = groupFtStaffLinesByBlock(ftStaffLines)
  const dtByBlock = groupDtStaffLinesByMatchedBlocks(dtSvg, matchedStaffLineBlocks, blockToDtSystemId, logger)

  const unmatchedBlocks = Array.from(ftByBlock.keys()).filter(blockIndex => !matchedStaffLineBlocks.has(blockIndex))

  unmatchedBlocks.forEach(blockIndex => {
    const lines = ftByBlock.get(blockIndex) || []
    lines.forEach((line, idx) => {
      line.setAttribute('opacity', '0')
      setAnimation({
        element: line,
        id: `staff-line-block-${blockIndex}-unmatched-${idx}`,
        localName: 'staff-line',
        states: {
          finding: { type: 'opacity', val: '0' },
          normalization: { type: 'opacity', val: '0' },
          readingOrder: { type: 'opacity', val: '1' },
          regulation: { type: 'opacity', val: '1' },
          supplements: { type: 'opacity', val: '1' },
          interventions: { type: 'opacity', val: '1' }
        }
      })
    })
  })

  const matchedBlocks = Array.from(matchedStaffLineBlocks).sort((a, b) => a - b)

  matchedBlocks.forEach(blockIndex => {
    const ftLines = ftByBlock.get(blockIndex) || []
    const dtLines = dtByBlock.get(blockIndex) || []

    if (ftLines.length === 0 || dtLines.length === 0) {
      logger.warn(`[animateStaffLines] Missing FT or DT staff lines for block ${blockIndex}; skipping DT alignment for this block.`)
      return
    }

    const sharedCount = Math.min(ftLines.length, dtLines.length)

    for (let i = 0; i < sharedCount; i++) {
      const ftLine = ftLines[i]
      const dtLine = dtLines[i]
      const atD = ftLine.getAttribute('d')
      const dtD = dtLine.getAttribute('d')
      const newD = convertD(atD, dtD)

      setAnimation({
        element: ftLine,
        id: `staff-line-block-${blockIndex}-${i}`,
        localName: 'staff-line',
        states: {
          finding: { type: 'd', val: newD },
          normalization: { type: 'd', val: newD },
          readingOrder: { type: 'd', val: newD },
          regulation: { type: 'd', val: atD },
          supplements: { type: 'd', val: atD },
          interventions: { type: 'd', val: atD }
        }
      })
    }

    if (dtLines.length > ftLines.length) {
      logger.warn(`[animateStaffLines] Staff-line count mismatch in block ${blockIndex}: FT=${ftLines.length}, DT=${dtLines.length}. Extra DT lines will be hidden from regulation onward.`)

      for (let i = ftLines.length; i < dtLines.length; i++) {
        const templateLine = ftLines[ftLines.length - 1]
        const clone = templateLine.cloneNode(true)
        clone.setAttribute('data-bw-staff-clone', `${blockIndex}-${i}`)
        clone.setAttribute('data-bw-block', String(blockIndex))
        clone.setAttribute('data-bw-line-index', String(i))
        templateLine.parentNode.appendChild(clone)

        const atD = clone.getAttribute('d')
        const dtD = dtLines[i].getAttribute('d')
        const newD = convertD(atD, dtD)

        setAnimation({
          element: clone,
          id: `staff-line-block-${blockIndex}-dt-extra-${i}`,
          localName: 'staff-line',
          states: {
            finding: { type: 'd', val: newD },
            normalization: { type: 'd', val: newD },
            readingOrder: { type: 'd', val: newD },
            regulation: null,
            supplements: null,
            interventions: null
          }
        })
      }
    } else if (ftLines.length > dtLines.length) {
      logger.warn(`[animateStaffLines] Staff-line count mismatch in block ${blockIndex}: FT=${ftLines.length}, DT=${dtLines.length}. FT extra lines remain at their AT positions.`)
    }
  })
}

/**
 * Orchestrate animation of all musical events (notes, rests, chords, etc.) between AT and DT transcriptions
 * This function serves as the main coordinator for animating all types of musical notation elements.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Shared animation helper bundle
 * @param {Function} tools.getNewPos - Converts DT coordinates into FT coordinate space
 * @param {Function} tools.convertD - Converts DT path data into FT coordinate space
 * @param {number} tools.scaleFactor - DT-to-AT scale factor
 * @param {Map<string, string[]>} tools.correspMappings - AT element id to DT ids mapping
 * @param {string} tools.stateModel - Active state model (fluidTranscript or fluidSystems)
 * @param {Function} tools.getChoiceVerticalOffset - Returns fluidSystems vertical override per element id
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer
 * @param {Object} tools.logger - Logger instance
 * @returns {void} No return value.
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
  liquifyTupletNums(ftSvg, dtSvg, atMeiDom, tools)

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
 * Creates an `<animateTransform>` element with type="translate" to animate the position
 * of an SVG element. The animation transitions between the provided values using the
 * global duration and repeat settings.
 * the start and end positions as "x y" strings
 *
 * @param {SVGElement} node - The SVG element to add the animation to
 * @param {string[]} values - Array of translate values (e.g., ["0 0", "100 50"]) representing
 * @returns {void} No return value.
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
 * Creates an `<animate>` element to animate any SVG attribute (e.g., `d`, `opacity`, `fill`).
 * The animation transitions between the provided values using the global duration and repeat settings.
 *
 * @param {SVGElement} node - The SVG element to add the animation to
 * @param {string} attribute - The name of the attribute to animate (e.g., "d", "opacity", "fill")
 * @param {string[]} values - Array of attribute values representing the animation states
 * @returns {void} No return value.
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
 * Set animation for an element based on the six-phase sequence:
 * finding -> normalization -> readingOrder -> regulation -> supplements -> interventions.
 * This resolver is used for fluid transcript output. Missing states are filled with
 * conservative defaults so each animated attribute always has six frames.
 * Null states indicate the element doesn't exist in that phase and will be hidden (opacity: 0).
 * Each state object has:
 * Example:
 * {
 * element: noteElement,
 * id: 'note-123',
 * localName: 'note',
 * states: {
 * finding: { type: 'translate', val: '0 0' },
 * interventions: { type: 'translate', val: '100 50' }
 * }
 * }
 *
 * @param {Object} descriptor - Animation descriptor with the following structure:
 * @param {SVGElement} descriptor.element - The SVG element to animate
 * @param {string} descriptor.id - The element's ID (for logging)
 * @param {string} descriptor.localName - The element's type (e.g., 'note', 'artic')
 * @param {Object} descriptor.states - State definitions for each phase
 * @returns {string} Resulting string.
 */
const setAnimationFluidTranscript = (descriptor) => {
  const { element, id, localName, states } = descriptor

  const finding = states.finding || null
  const normalization = states.normalization || finding
  const readingOrder = states.readingOrder || normalization
  const regulation = states.regulation || states.supplements || states.interventions || normalization
  const supplements = states.supplements || regulation
  const interventions = states.interventions || supplements

  const allStates = [finding, normalization, readingOrder, regulation, supplements, interventions]
  const hasNullStates = allStates.some(state => state === null)

  if (hasNullStates) {
    const opacityValues = allStates.map(state => (state === null ? '0' : '1'))
    element.setAttribute('opacity', opacityValues[0])
    addTransform(element, 'opacity', opacityValues)

    if (finding === null || normalization === null) {
      element.setAttribute('fill', '#009900')
      element.setAttribute('stroke', '#009900')
      const existingClasses = element.getAttribute('class') || ''
      element.setAttribute('class', `${existingClasses} supplied`.trim())
    }
  }

  const validStates = allStates.filter(state => state !== null)

  if (validStates.length === 0) {
    console.warn(`[setAnimationFluidTranscript] No valid states for element ${id} (${localName})`)
    return
  }

  const animationType = validStates[0].type
  const values = allStates.map(state => {
    if (state === null) {
      if (animationType === 'translate') return '0 0'
      if (animationType === 'opacity') return '0'
      return ''
    }
    return state.val
  })

  if (animationType === 'translate') {
    addTransformTranslate(element, values)
  } else {
    addTransform(element, animationType, values)
  }
}

/**
 * Resolve a partial state descriptor into the canonical fluidSystems six-phase sequence.
 * Missing phases are derived conservatively to preserve existing behavior.
 *
 * @param {Object} states - Input object used by this function.
 * @returns {Object} Fully-resolved six-phase state descriptor
 */
export const resolveFluidSystemsStates = (states = {}) => {
  const finding = states.finding || null
  const normalization = states.normalization || finding
  const readingOrder = states.readingOrder || normalization

  const rawRegulation = states.regulation || null
  const rawSupplements = states.supplements || null

  // Supplied/editorial material: stay hidden through regulation, then reveal at supplements.
  const isSuppliedLike = (finding === null || normalization === null) && rawSupplements !== null

  // Non-supplied material: internal system transition happens in regulation.
  const regulation = isSuppliedLike
    ? (rawRegulation || normalization)
    : (rawRegulation || rawSupplements || normalization)

  const supplements = rawSupplements || regulation

  const interventions = states.interventions || supplements

  return {
    finding,
    normalization,
    readingOrder,
    regulation,
    supplements,
    interventions
  }
}

/**
 * Sets animation fluid systems.
 *
 * @param {Element} descriptor - Element processed by this function.
 * @returns {string} Resulting string.
 */
const setAnimationFluidSystems = (descriptor) => {
  const { element, id, localName, states } = descriptor
  const resolvedStates = resolveFluidSystemsStates(states)
  const { finding, normalization, readingOrder, regulation, supplements, interventions } = resolvedStates

  const allStates = [finding, normalization, readingOrder, regulation, supplements, interventions]
  const hasNullStates = allStates.some(state => state === null)

  if (hasNullStates) {
    let opacityValues = allStates.map(state => (state === null ? '0' : '1'))

    // Supplied/editorial material must remain hidden until supplements.
    const isSuppliedLike = (finding === null || normalization === null) && supplements !== null
    if (isSuppliedLike) {
      opacityValues = ['0', '0', '0', '0', '1', interventions === null ? '0' : '1']
    }

    // Ensure the initial static frame already reflects the first animation state.
    element.setAttribute('opacity', opacityValues[0])
    addTransform(element, 'opacity', opacityValues)

    if (finding === null || normalization === null) {
      element.setAttribute('fill', '#009900')
      element.setAttribute('stroke', '#009900')
      const existingClasses = element.getAttribute('class') || ''
      element.setAttribute('class', `${existingClasses} supplied`.trim())
    }
  }

  const validStates = allStates.filter(state => state !== null)

  if (validStates.length === 0) {
    console.warn(`[setAnimationFluidSystems] No valid states for element ${id} (${localName})`)
    return
  }

  const animationType = validStates[0].type
  const values = allStates.map(state => {
    if (state === null) {
      if (animationType === 'translate') return '0 0'
      if (animationType === 'opacity') return '0'
      return ''
    }
    return state.val
  })

  if (animationType === 'translate') {
    addTransformTranslate(element, values)
  } else {
    addTransform(element, animationType, values)
  }
}

/**
 * Creates animation setter.
 *
 * @param {string} stateModel - State value used by this function.
 * @returns {void} No return value.
 */
const createAnimationSetter = (stateModel) => {
  if (stateModel === 'fluidSystems') {
    return setAnimationFluidSystems
  }

  return setAnimationFluidTranscript
}
