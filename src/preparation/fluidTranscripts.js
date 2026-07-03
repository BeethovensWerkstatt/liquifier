import { appendNewElement, closestElement, removeElement } from '../utils/dom.js'
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
import { liquifyTremolos } from './liquify/tremolos.js'
import { liquifyStaffGrpBraces } from './liquify/staffGrpBraces.js'
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
    const rastrumGroup = closestElement(rect, 'g.rastrum')
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
 * Resolves the DT scale factor used in fluidSystems.
 *
 * @param {Object} options - Structured options object.
 * @param {number} fullScaleFactor - Computed full DT->AT scale factor.
 * @param {number|null} [perSystemScaleFactor] - Computed DT->AT scale factor for one matched system.
 * @param {number} [options.dtScaleReductionFactor] - Optional override divisor for DT reduction calibration.
 * @returns {number} Positive point scale factor.
 */
function resolveFluidSystemsDtScaleFactor (options = {}, fullScaleFactor = 1, perSystemScaleFactor = null) {
  const mode = options.dtScaleReductionMode === 'full' ? 'full' : 'perSystem'
  const configured = Number.parseFloat(options.dtScaleReductionFactor)
  if (Number.isFinite(configured) && configured > 0) {
    if (Number.isFinite(fullScaleFactor) && fullScaleFactor > 0) return fullScaleFactor / configured
    return 1 / configured
  }

  if (mode === 'perSystem') {
    if (Number.isFinite(perSystemScaleFactor) && perSystemScaleFactor > 0) return perSystemScaleFactor
    if (Number.isFinite(fullScaleFactor) && fullScaleFactor > 0) return fullScaleFactor
    return 1
  }

  if (Number.isFinite(fullScaleFactor) && fullScaleFactor > 0) return fullScaleFactor
  return 1
}

/**
 * Extracts min/max y range from rastrum path nodes.
 *
 * @param {Element[]} lineNodes - Staff-line path nodes.
 * @returns {{min: number, max: number}|null} Y range.
 */
function extractLineYRange (lineNodes = []) {
  let minY = Infinity
  let maxY = -Infinity

  lineNodes.forEach(line => {
    const d = line?.getAttribute?.('d') || ''
    const match = d.match(/M\s*([\d.-]+)[,\s]+([\d.-]+)\s+L\s*([\d.-]+)[,\s]+([\d.-]+)/)
    if (!match) return

    const y1 = Number.parseFloat(match[2])
    const y2 = Number.parseFloat(match[4])
    if (Number.isFinite(y1)) {
      minY = Math.min(minY, y1)
      maxY = Math.max(maxY, y1)
    }
    if (Number.isFinite(y2)) {
      minY = Math.min(minY, y2)
      maxY = Math.max(maxY, y2)
    }
  })

  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) return null
  return { min: minY, max: maxY }
}

/**
 * Builds per-block scale profile for fluidSystems using matched block/system pairs.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {SVGElement} params.ftSvg - Fluid transcription SVG.
 * @param {SVGElement|Document} params.dtSvg - Diplomatic transcript SVG.
 * @param {Set<number>|null} params.matchedStaffLineBlocks - Matched AT block indices.
 * @param {Map<number, string>|null} params.blockToDtSystemId - AT block -> DT system id mapping.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} params.logger - Logger instance.
 * @returns {{bands: Array<{blockIndex: number, centerY: number, scaleFactor: number}>, averageScaleFactor: number|null}} Scale profile.
 */
function buildFluidSystemsScaleProfile ({ ftSvg, dtSvg, matchedStaffLineBlocks, blockToDtSystemId, logger }) {
  if (!(matchedStaffLineBlocks instanceof Set) || matchedStaffLineBlocks.size === 0) {
    return { bands: [], averageScaleFactor: null }
  }

  const ftStaffLines = Array.from(ftSvg.querySelectorAll('path.rastrum'))
  const ftByBlock = groupFtStaffLinesByBlock(ftStaffLines)
  const dtByBlock = groupDtStaffLinesByMatchedBlocks(dtSvg, matchedStaffLineBlocks, blockToDtSystemId, logger)

  const bands = []

  Array.from(matchedStaffLineBlocks).sort((a, b) => a - b).forEach(blockIndex => {
    const ftRange = extractLineYRange(ftByBlock.get(blockIndex) || [])
    const dtRange = extractLineYRange(dtByBlock.get(blockIndex) || [])
    if (!ftRange || !dtRange) return

    const atHeight = ftRange.max - ftRange.min
    const dtHeight = dtRange.max - dtRange.min
    if (!Number.isFinite(atHeight) || !Number.isFinite(dtHeight) || atHeight <= 0 || dtHeight <= 0) return

    const scaleFactor = atHeight / dtHeight
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return

    bands.push({
      blockIndex,
      centerY: dtRange.min + ((dtRange.max - dtRange.min) / 2),
      scaleFactor
    })
  })

  if (bands.length === 0) return { bands: [], averageScaleFactor: null }

  bands.sort((a, b) => a.centerY - b.centerY)
  const averageScaleFactor = bands.reduce((sum, band) => sum + band.scaleFactor, 0) / bands.length
  return { bands, averageScaleFactor }
}

/**
 * Resolves per-system scale factor for one DT point by nearest DT block center.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {{x: number, y: number}} params.dtPoint - DT point used by coordinate transform.
 * @param {Array<{blockIndex: number, centerY: number, scaleFactor: number}>} params.bands - Per-block scale profile.
 * @returns {number|null} Resolved scale factor.
 */
function resolvePerSystemScaleFactorForDtPoint ({ dtPoint, bands }) {
  if (!Array.isArray(bands) || bands.length === 0) return null
  if (!Number.isFinite(dtPoint?.y)) return null

  let bestBand = null
  let bestDistance = Infinity

  bands.forEach(band => {
    if (!Number.isFinite(band.centerY) || !Number.isFinite(band.scaleFactor) || band.scaleFactor <= 0) return
    const distance = Math.abs(dtPoint.y - band.centerY)
    if (distance < bestDistance) {
      bestDistance = distance
      bestBand = band
    }
  })

  return bestBand?.scaleFactor || null
}

/**
 * Normalizes a file reference to a basename for stable matching.
 *
 * @param {string} value - Raw file reference value.
 * @returns {string} Normalized basename.
 */
function normalizeFileBasename (value = '') {
  const normalized = String(value).trim().replace(/\\/g, '/')
  if (!normalized) return ''
  const parts = normalized.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * Parses one corresp token into file reference and target id.
 *
 * @param {string} token - One corresp token.
 * @returns {{fileRef: string, targetId: string}|null} Parsed token parts.
 */
function parseCorrespToken (token = '') {
  const normalized = String(token).trim()
  if (!normalized || !normalized.includes('#')) return null

  const hashIndex = normalized.indexOf('#')
  const fileRef = hashIndex > 0 ? normalized.slice(0, hashIndex).trim() : ''
  const targetId = normalized.slice(hashIndex + 1).trim()
  if (!targetId) return null

  return { fileRef, targetId }
}

/**
 * Returns whether a file reference points to a diplomatic transcription.
 *
 * @param {string} fileRef - File reference from a corresp token.
 * @returns {boolean} Whether this token should be considered DT-linked.
 */
function isDiplomaticCorrespReference (fileRef = '') {
  if (fileRef === '') return true
  return fileRef.includes('/diplomaticTranscripts/') || fileRef.endsWith('_dt.xml')
}

/**
 * Returns whether a corresp file reference points to the current DT file.
 *
 * @param {string} fileRef - File reference from corresp token.
 * @param {string} currentDtBasename - Current DT basename for this run.
 * @returns {boolean} Whether token belongs to current DT context.
 */
function isCurrentDtReference (fileRef = '', currentDtBasename = '') {
  if (fileRef === '') return true
  if (!currentDtBasename) return true
  return normalizeFileBasename(fileRef) === currentDtBasename
}

/**
 * Extract DT correspondence context from AT MEI.
 *
 * @param {Document} atMeiDom - AT MEI DOM.
 * @param {Object} options - Context options.
 * @param {string} options.currentDtReference - Current DT file reference/path.
 * @returns {{correspMappings: Map<string, string[]>, unmatchedClassByAtId: Map<string, string>}}
 * Mapping to current DT ids and unmatched-class hints for AT ids.
 */
function extractCorrespContext (atMeiDom, { currentDtReference = '' } = {}) {
  const correspMappings = new Map()
  const unmatchedClassByAtId = new Map()
  const currentDtBasename = normalizeFileBasename(currentDtReference)

  const correspElements = atMeiDom.querySelectorAll('[corresp]')

  correspElements.forEach(element => {
    const atId = element.getAttribute('xml:id')
    const corresp = element.getAttribute('corresp')
    if (!atId || !corresp) return

    const currentDtIds = []
    let hasForeignDtReference = false

    corresp
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .forEach(token => {
        const parsed = parseCorrespToken(token)
        if (!parsed) return

        const { fileRef, targetId } = parsed
        if (!isDiplomaticCorrespReference(fileRef)) return

        if (isCurrentDtReference(fileRef, currentDtBasename)) {
          currentDtIds.push(targetId)
        } else {
          hasForeignDtReference = true
        }
      })

    const uniqueCurrentDtIds = Array.from(new Set(currentDtIds))
    if (uniqueCurrentDtIds.length > 0) {
      correspMappings.set(atId, uniqueCurrentDtIds)
      return
    }

    if (hasForeignDtReference) {
      unmatchedClassByAtId.set(atId, 'otherWz')
    }
  })

  return { correspMappings, unmatchedClassByAtId }
}

/**
 * Generate fluid transcription by pairing DT and AT system SVGs
 *
 * @param {Object} dtSystemSvg - DT system SVG DOM (document or svg element)
 * @param {Object} atSystemSvg - AT system SVG DOM (document or svg element)
 * @param {Document} atMeiDom - AT MEI DOM (for corresp mappings)
 * @param {Document} sourceMeiDom - Source MEI DOM (for additional context)
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance for info/debug/warn/error messages
 * @param {Object} options - Structured options object.
 * @returns {Object} Fluid transcription SVG DOM
 */
export const generateFluidTranscription = ({
  dtSvg,
  atSvg,
  atMei,
  dtMei,
  sourceMei,
  reconstructionMei,
  logger,
  overlayContext,
  positioningData
}, options = {}) => {
  const safeLogger = {
    debug: typeof logger?.debug === 'function' ? logger.debug.bind(logger) : () => {},
    info: typeof logger?.info === 'function' ? logger.info.bind(logger) : () => {},
    warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : () => {},
    error: typeof logger?.error === 'function' ? logger.error.bind(logger) : () => {}
  }
  // Handle both document and element inputs
  const dtSvgElement = dtSvg.documentElement || dtSvg
  const atSvgElement = atSvg.documentElement || atSvg
  const stateModel = options.stateModel || 'fluidTranscript'

  const currentDtReference = options.currentDtReference || ''
  const { correspMappings, unmatchedClassByAtId } = extractCorrespContext(atMei, {
    currentDtReference
  })

  // Calculate scale factor
  const scaleFactor = calculateScaleFactor(dtSvgElement, atSvgElement)

  // Calculate system centers
  const dtCenter = calculateDtSystemCenter(dtSvgElement)
  const atCenter = calculateAtSystemCenter(atSvgElement)

  // console.log(`[Scale Factor] Calculated scale factor: ${scaleFactor.toFixed(3)}`)
  // console.log('dtCenter', dtCenter)
  // console.log('atCenter', atCenter)

  // Clone AT SVG as the base for fluid transcription
  const ftSvg = atSvgElement.cloneNode(true)

  const measureBlockMap = buildAtMeasureBlockMap(atMei)
  const matchedStaffLineBlocks = options.matchedStaffLineBlocks instanceof Set
    ? options.matchedStaffLineBlocks
    : null
  const blockToDtSystemId = options.blockToDtSystemId instanceof Map
    ? options.blockToDtSystemId
    : null

  adjustAtStaffLines(ftSvg, atMei, measureBlockMap)
  adjustDtStaffLines(dtSvgElement)

  const fluidSystemsScaleProfile = stateModel === 'fluidTranscripts'
    ? buildFluidSystemsScaleProfile({
      ftSvg,
      dtSvg: dtSvgElement,
      matchedStaffLineBlocks,
      blockToDtSystemId,
      logger: safeLogger
    })
    : { bands: [], averageScaleFactor: null }

  const effectiveScaleFactor = stateModel === 'fluidTranscripts'
    ? resolveFluidSystemsDtScaleFactor(
      options,
      scaleFactor,
      fluidSystemsScaleProfile.averageScaleFactor
    )
    : scaleFactor

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

    const perSystemScaleFactor = stateModel === 'fluidTranscripts'
      ? resolvePerSystemScaleFactorForDtPoint({ dtPoint: dt, bands: fluidSystemsScaleProfile.bands })
      : null
    const pointScaleFactor = stateModel === 'fluidTranscripts'
      ? resolveFluidSystemsDtScaleFactor(options, scaleFactor, perSystemScaleFactor)
      : scaleFactor

    const diffX = atOffX - dtOffX * pointScaleFactor // ((dtOffX * scaleFactor) - atOffX) * -1
    const diffY = atOffY - dtOffY * pointScaleFactor // ((dtOffY * scaleFactor) - atOffY) * 1
    const newPos = { x: Math.round(at.x + diffX), y: Math.round(at.y + diffY) }
    safeLogger.debug(`[Position Diff] AT: (${at.x}, ${at.y}), DT: (${dt.x}, ${dt.y}) => newPos: (${newPos.x}, ${newPos.y})`)
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

  const choiceVerticalOffsets = options.choiceVerticalOffsets instanceof Map
    ? options.choiceVerticalOffsets
    : new Map()

  // Expose a no-op getter outside fluidTranscripts so liquify modules can call one API.
  /**
   * Returns choice vertical offset from the current data context.
   *
   * @param {string} elementId - Identifier for the target element.
   * @returns {number} Resulting numeric value.
   */
  const getChoiceVerticalOffset = (elementId) => {
    if (stateModel !== 'fluidTranscripts') return 0
    if (!elementId) return 0
    const offset = choiceVerticalOffsets.get(elementId)
    return Number.isFinite(offset) ? offset : 0
  }

  /**
   * Applies the unmatched classification class for an AT element id.
   *
   * @param {Element} element - SVG element to classify.
   * @param {string} atId - AT xml:id used for classification lookup.
   * @returns {string} Applied class name.
   */
  const applyUnmatchedClass = (element, atId) => {
    const className = unmatchedClassByAtId.get(atId) || 'supplied'
    applyClassificationClass(element, className)
    return className
  }

  // Build the state-model-specific writer once, then pass through all liquify modules.
  const setAnimationForMode = createAnimationSetter(stateModel, unmatchedClassByAtId)

  animateStaffLines(ftSvg, dtSvgElement, convertD, setAnimationForMode, safeLogger, matchedStaffLineBlocks, blockToDtSystemId)
  animateUnmatchedBlockContainers(
    ftSvg,
    measureBlockMap,
    matchedStaffLineBlocks,
    setAnimationForMode,
    stateModel
  )

  const tools = {
    getNewPos,
    convertD,
    scaleFactor: effectiveScaleFactor,
    correspMappings,
    stateModel,
    matchedStaffLineBlocks,
    measureBlockMap,
    getChoiceVerticalOffset,
    applyUnmatchedClass,
    setAnimation: setAnimationForMode,
    logger: safeLogger
  }

  liquifyMusic(ftSvg, dtSvgElement, atMei, tools)
  animateSystemLabels(ftSvg, setAnimationForMode, stateModel)

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
export const adjustAtStaffLines = (svg, atMeiDom, measureBlockMap = buildAtMeasureBlockMap(atMeiDom)) => {
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
    system.querySelectorAll(':scope > g.bw-system-rastrum').forEach(group => removeElement(group))

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
      staffLinesInMeasure.forEach(path => removeElement(path))
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
 * Animate system label overlays inserted into AT SVG so they become visible
 * from readingOrder onward without starting a fade during normalization.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {Function} setAnimation - Phase-aware animation descriptor writer.
 * @param {string} stateModel - Active state model.
 * @returns {void} No return value.
 */
function animateSystemLabels (ftSvg, setAnimation, stateModel) {
  if (stateModel !== 'fluidSystems') return

  // Eight-phase spacing is 1/7 per phase; compress label fade to 10% of one phase.
  const phaseSpan = 1 / 7
  const regulationStart = phaseSpan * 5
  const transitionSpan = phaseSpan * 0.1
  const readingOrderTransitionStart = regulationStart - transitionSpan
  const labelKeyTimes = [
    0,
    phaseSpan,
    phaseSpan * 2,
    phaseSpan * 3,
    readingOrderTransitionStart,
    regulationStart,
    phaseSpan * 6,
    1
  ].map(value => value.toFixed(2))

  const labelSelector = [
    'rect.pageLabelBox',
    'text.pageLabel',
    'rect.pageBg',
    'rect.sysPreview',
    'text.sysLabel'
  ].join(', ')

  const labelElements = Array.from(ftSvg.querySelectorAll(labelSelector))
  labelElements.forEach((element, index) => {
    element.setAttribute('opacity', '0')

    setAnimation({
      element,
      id: `system-label-${index}`,
      localName: 'system-label',
      states: {
        digitalFacsimile: { type: 'opacity', val: '0' },
        writingZone: { type: 'opacity', val: '0' },
        finding: { type: 'opacity', val: '0' },
        normalization: { type: 'opacity', val: '0' },
        readingOrder: { type: 'opacity', val: '0' },
        regulation: { type: 'opacity', val: '1' },
        supplements: { type: 'opacity', val: '1' },
        interventions: { type: 'opacity', val: '1' }
      }
    })

    const opacityAnimation = element.querySelector('animate[attributeName="opacity"]')
    if (opacityAnimation) {
      opacityAnimation.setAttribute('keyTimes', labelKeyTimes.join(';'))
      opacityAnimation.setAttribute('calcMode', 'linear')
    }
  })
}

/**
 * Hide AT content that belongs to unmatched reading-order blocks via container opacity.
 * Prefers system-level containers when the whole system is unmatched, otherwise falls
 * back to per-measure containers.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {Map<string, number>} measureBlockMap - AT measure id -> block index map.
 * @param {Set<number>|null} matchedStaffLineBlocks - Matched AT blocks for current DT page.
 * @param {Function} setAnimation - Phase-aware animation descriptor writer.
 * @param {string} stateModel - Active state model.
 * @returns {void} No return value.
 */
function animateUnmatchedBlockContainers (ftSvg, measureBlockMap, matchedStaffLineBlocks, setAnimation, stateModel) {
  if (stateModel !== 'fluidSystems') return
  if (!(matchedStaffLineBlocks instanceof Set) || matchedStaffLineBlocks.size === 0) return
  if (!(measureBlockMap instanceof Map) || measureBlockMap.size === 0) return

  const unmatchedBlocks = new Set(
    Array.from(new Set(measureBlockMap.values())).filter(block => !matchedStaffLineBlocks.has(block))
  )

  if (unmatchedBlocks.size === 0) return

  const allMeasures = Array.from(ftSvg.querySelectorAll('g.measure:not(.bounding-box)'))
  const unmatchedMeasures = allMeasures.filter(measure => {
    const measureId = measure.getAttribute('data-id')
    if (!measureId || !measureBlockMap.has(measureId)) return false
    return unmatchedBlocks.has(measureBlockMap.get(measureId))
  })

  if (unmatchedMeasures.length === 0) return

  const fullyUnmatchedSystems = new Set()

  Array.from(ftSvg.querySelectorAll('g.system:not(.bounding-box)')).forEach(system => {
    const systemMeasures = Array.from(system.querySelectorAll(':scope > g.measure:not(.bounding-box)'))
    if (systemMeasures.length === 0) return

    const hasMatchedMeasure = systemMeasures.some(measure => {
      const measureId = measure.getAttribute('data-id')
      if (!measureId || !measureBlockMap.has(measureId)) return false
      return matchedStaffLineBlocks.has(measureBlockMap.get(measureId))
    })

    if (!hasMatchedMeasure) {
      fullyUnmatchedSystems.add(system)
    }
  })

  let containerIndex = 0

  fullyUnmatchedSystems.forEach(system => {
    system.setAttribute('data-bw-unmatched-container', 'true')
    applyClassificationClass(system, 'otherWz')
    system.setAttribute('opacity', '0')

    setAnimation({
      element: system,
      id: `unmatched-system-${containerIndex++}`,
      localName: 'system',
      states: {
        digitalFacsimile: { type: 'opacity', val: '0' },
        writingZone: { type: 'opacity', val: '0' },
        finding: { type: 'opacity', val: '0' },
        normalization: { type: 'opacity', val: '0' },
        readingOrder: { type: 'opacity', val: '0' },
        regulation: { type: 'opacity', val: '0' },
        supplements: { type: 'opacity', val: '1' },
        interventions: { type: 'opacity', val: '1' }
      }
    })
  })

  unmatchedMeasures.forEach(measure => {
    if (closestElement(measure, 'g.system[data-bw-unmatched-container="true"]')) return

    measure.setAttribute('data-bw-unmatched-container', 'true')
    applyClassificationClass(measure, 'otherWz')
    measure.setAttribute('opacity', '0')

    setAnimation({
      element: measure,
      id: `unmatched-measure-${containerIndex++}`,
      localName: 'measure',
      states: {
        digitalFacsimile: { type: 'opacity', val: '0' },
        writingZone: { type: 'opacity', val: '0' },
        finding: { type: 'opacity', val: '0' },
        normalization: { type: 'opacity', val: '0' },
        readingOrder: { type: 'opacity', val: '0' },
        regulation: { type: 'opacity', val: '0' },
        supplements: { type: 'opacity', val: '1' },
        interventions: { type: 'opacity', val: '1' }
      }
    })
  })
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
          digitalFacsimile: { type: 'd', val: newD },
          writingZone: { type: 'd', val: newD },
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
          digitalFacsimile: { type: 'opacity', val: '0' },
          writingZone: { type: 'opacity', val: '0' },
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
          digitalFacsimile: { type: 'd', val: newD },
          writingZone: { type: 'd', val: newD },
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
  liquifyTremolos(ftSvg, dtSvg, atMeiDom, tools)
  liquifyStaffGrpBraces(ftSvg, dtSvg, atMeiDom, tools)

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
  if (values.length === 0) return

  const hasOnlyZeroTranslateValues = values.every(value => {
    const match = String(value || '').trim().match(/^([\d.-]+)[,\s]+([\d.-]+)$/)
    if (!match) return false

    const x = parseFloat(match[1])
    const y = parseFloat(match[2])
    return Number.isFinite(x) && Number.isFinite(y) && x === 0 && y === 0
  })

  if (hasOnlyZeroTranslateValues) return

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
 * Resolves AT id for an animation target.
 *
 * @param {Element} element - Animated element.
 * @param {string} fallbackId - Descriptor id fallback.
 * @returns {string|null} Resolved AT id when available.
 */
function resolveAtIdForClassification (element, fallbackId) {
  if (!element) return fallbackId || null

  const ownId = element.getAttribute?.('data-id')
  if (ownId) return ownId

  const ancestorId = closestElement(element, '[data-id]')?.getAttribute?.('data-id')
  if (ancestorId) return ancestorId

  return fallbackId || null
}

/**
 * Applies one classification class while removing conflicting ones.
 *
 * @param {Element} element - SVG element to classify.
 * @param {string} className - Classification class name.
 * @returns {void} No return value.
 */
function applyClassificationClass (element, className) {
  if (!element || !className) return

  const classes = (element.getAttribute('class') || '')
    .split(/\s+/)
    .filter(Boolean)
    .filter(classToken => classToken !== 'supplied' && classToken !== 'otherWz')

  classes.push(className)
  element.setAttribute('class', classes.join(' '))
}

/**
 * Resolves unmatched class name for a descriptor.
 *
 * @param {Object} descriptor - Animation descriptor.
 * @param {Map<string, string>} unmatchedClassByAtId - AT id to class mapping.
 * @returns {string} Class to apply.
 */
function resolveUnmatchedClassForDescriptor (descriptor, unmatchedClassByAtId) {
  const atId = resolveAtIdForClassification(descriptor.element, descriptor.id)
  if (!atId) return 'supplied'
  return unmatchedClassByAtId.get(atId) || 'supplied'
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
const setAnimationFluidTranscript = (descriptor, unmatchedClassByAtId = new Map()) => {
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
      const unmatchedClass = resolveUnmatchedClassForDescriptor(descriptor, unmatchedClassByAtId)
      applyClassificationClass(element, unmatchedClass)
      if (unmatchedClass === 'supplied') {
        element.setAttribute('fill', '#999999')
        element.setAttribute('stroke', '#999999')
      } else if (unmatchedClass === 'otherWz') {
        element.setAttribute('fill', '#555555')
        element.setAttribute('stroke', '#555555')
      }
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
 * Resolve a partial state descriptor into the canonical fluidSystems eight-phase sequence.
 * Missing phases are derived conservatively to preserve existing behavior.
 *
 * @param {Object} states - Input object used by this function.
 * @returns {Object} Fully-resolved eight-phase state descriptor
 */
export const resolveFluidSystemsStates = (states = {}) => {
  const digitalFacsimile = states.digitalFacsimile || null
  const writingZone = states.writingZone || digitalFacsimile

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
    digitalFacsimile,
    writingZone,
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
const setAnimationFluidSystems = (descriptor, unmatchedClassByAtId = new Map()) => {
  const { element, id, localName, states } = descriptor
  const resolvedStates = resolveFluidSystemsStates(states)
  const {
    digitalFacsimile,
    writingZone,
    finding,
    normalization,
    readingOrder,
    regulation,
    supplements,
    interventions
  } = resolvedStates

  const allStates = [digitalFacsimile, writingZone, finding, normalization, readingOrder, regulation, supplements, interventions]
  const hasNullStates = allStates.some(state => state === null)
  const unmatchedContainer = closestElement(element, '[data-bw-unmatched-container="true"]') || null
  const isContainerItself = Boolean(unmatchedContainer && unmatchedContainer === element)
  const isInsideUnmatchedContainer = Boolean(unmatchedContainer && !isContainerItself)

  if (hasNullStates) {
    let opacityValues = allStates.map(state => (state === null ? '0' : '1'))

    // Supplied/editorial material must remain hidden until supplements.
    const isSuppliedLike = (finding === null || normalization === null) && supplements !== null
    if (isSuppliedLike) {
      opacityValues = ['0', '0', '0', '0', '0', '0', '1', interventions === null ? '0' : '1']
    }

    if (!isInsideUnmatchedContainer) {
      // Ensure the initial static frame already reflects the first animation state.
      element.setAttribute('opacity', opacityValues[0])
      addTransform(element, 'opacity', opacityValues)
    }

    if (finding === null || normalization === null) {
      const unmatchedClass = resolveUnmatchedClassForDescriptor(descriptor, unmatchedClassByAtId)
      applyClassificationClass(element, unmatchedClass)
      if (unmatchedClass === 'supplied') {
        element.setAttribute('fill', '#999999')
        element.setAttribute('stroke', '#999999')
      } else if (unmatchedClass === 'otherWz') {
        element.setAttribute('fill', '#555555')
        element.setAttribute('stroke', '#555555')
      }
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
const createAnimationSetter = (stateModel, unmatchedClassByAtId = new Map()) => {
  if (stateModel === 'fluidSystems') {
    return descriptor => setAnimationFluidSystems(descriptor, unmatchedClassByAtId)
  }

  return descriptor => setAnimationFluidTranscript(descriptor, unmatchedClassByAtId)
}

/**
 * Determines the necessary positions for the fluid transcription
 *
 * @param {{ dtSvg, atSvg, atMei, dtMei, source, logger, overlayContext }} params - Parameters object.
 * @param {SVGElement} params.dtSvg - Diplomatic transcript SVG element.
 * @param {Document} params.atMei - AT MEI document for metadata access.
 * @param {SVGElement} params.atSvg - AT SVG element.
 * @param {Document} params.dtMei - DT MEI document for metadata access.
 * @param {Document} params.sourceMei - Source MEI document for metadata access.
 * @param {Document} params.reconstructionMei - Reconstruction MEI document for metadata access.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} params.logger - Logger instance.
 * @param {Object|null} [params.overlayContext] - Optional normalized facsimile/shapes overlay context.
 * @param {Object} [params.overlayContext.facsimile] - Normalized facsimile geometry in px/mm units.
 * @param {Object} [params.overlayContext.shapes] - Shapes source context.
 * @returns {object} Object containing positional data for fluid transcription elements.
 */
export const retrievePositioningDataForFluidTranscripts = ({ dtSvg, atSvg, atMei, dtMei, sourceMei, reconstructionMei, logger, overlayContext = null }) => {
  const surfaceId = dtMei.querySelector('pb').getAttribute('target').split('#')[1]
  const atSurfaceIds = Array.from(atMei.querySelectorAll('pb')).map(pb => pb.getAttribute('corresp').split('#')[1])
  // const pageIndex = atSurfaceIds.indexOf(surfaceId)

  const round = num => Math.round((num + Number.EPSILON) * 100) / 100

  const arr = []

  atSvg.querySelectorAll('g.writingZone > rect.pageLabelBox').forEach((labelBox, pageIndex) => {
    const iteratedSurfaceId = atSurfaceIds[pageIndex]
    const foliumLike = [...reconstructionMei.querySelectorAll('*|foliaDesc *|folium, *|foliaDesc *|bifolium')].find(elem => {
      const match = (elem.hasAttribute('recto') && elem.getAttribute('recto').endsWith('#' + iteratedSurfaceId)) ||
        (elem.hasAttribute('verso') && elem.getAttribute('verso').endsWith('#' + iteratedSurfaceId)) ||
        (elem.hasAttribute('outer.recto') && elem.getAttribute('outer.recto').endsWith('#' + iteratedSurfaceId)) ||
        (elem.hasAttribute('inner.verso') && elem.getAttribute('inner.verso').endsWith('#' + iteratedSurfaceId)) ||
        (elem.hasAttribute('inner.recto') && elem.getAttribute('inner.recto').endsWith('#' + iteratedSurfaceId)) ||
        (elem.hasAttribute('outer.verso') && elem.getAttribute('outer.verso').endsWith('#' + iteratedSurfaceId))

      return match
    })

    const pageInfo = {}
    const labelY = parseFloat(labelBox.getAttribute('y') || '0')
    const labelHeight = parseFloat(labelBox.getAttribute('height') || '0')

    pageInfo.atWidth = round(parseFloat(labelBox.getAttribute('width') || '0') / 90)
    pageInfo.atCenterY = round((labelY + (labelHeight / 2)) / 90)
    pageInfo.mmWidth = parseFloat(foliumLike.getAttribute('width') || '0')
    pageInfo.mmHeight = parseFloat(foliumLike.getAttribute('height') || '0')
    pageInfo.surfaceId = iteratedSurfaceId
    pageInfo.currentPage = iteratedSurfaceId === surfaceId

    pageInfo.systems = []
    labelBox.parentNode.querySelectorAll('g.systemBegin').forEach((systemBegin, systemIndex) => {
      const systemInfo = {}
      systemInfo.sbId = systemBegin.getAttribute('data-id')
      systemInfo.width = round(parseFloat(systemBegin.querySelector('rect.pageLabelBox').getAttribute('width') || '0') / 90)
      pageInfo.systems.push(systemInfo)
    })
    arr.push(pageInfo)
  })

  let sum = 0
  arr.forEach((page, index) => {
    page.precedingWidth = round(sum)
    sum += page.atWidth
  })

  const obj = { pages: arr }

  if (overlayContext?.facsimile) {
    obj.iiifUrl = overlayContext.facsimile.href
    obj.facsimile = {
      href: overlayContext.facsimile.href,
      widthPx: overlayContext.facsimile.widthPx,
      heightPx: overlayContext.facsimile.heightPx,
      fragment: overlayContext.facsimile.fragment,
      pageMm: overlayContext.facsimile.pageMm,
      mediaFragMm: overlayContext.facsimile.mediaFragMm,
      imageMm: overlayContext.facsimile.imageMm,
      ratioPxPerMm: overlayContext.facsimile.ratioPxPerMm,
      mmPerPx: overlayContext.facsimile.mmPerPx
    }
  } else {
    const surface = sourceMei.getElementById(surfaceId)
    const iiifUrl = surface?.querySelector('graphic[type="facsimile"]')?.getAttribute('target') || null
    obj.iiifUrl = iiifUrl
  }

  return obj
}
