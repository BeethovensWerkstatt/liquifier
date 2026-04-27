import { addSbIndicators, prepareAtDomForRendering, addSystemLabelBlocks } from '../preparation/annotatedTranscripts.js'
import { prepareEditedAtDom } from '../preparation/editedAnnotatedTranscripts.js'
import { prepareDtForThulemeier } from '../preparation/mei.js'
import { serializeXmlCanonical } from '../utils/xml.js'
import { renderContinuousAt, renderSystemBasedAt, renderMidi } from './verovioHandler.js'
import { renderDiplomaticTranscript } from './thulemeierHandler.js'
import { writeData } from '../filehandlers/filehandler.js'
import { generateFluidTranscription } from '../preparation/fluidTranscripts.js'
import { JSDOM } from 'jsdom'
import path from 'path'
import fs from 'fs'

export const FLUID_SYSTEMS_STATE_SEQUENCE = [
  'finding',
  'normalization',
  'readingOrder',
  'regulation',
  'supplements',
  'interventions'
]

/**
 * Parses view box from serialized input values.
 *
 * @param {number} viewBoxAttr - Numeric input used by this function.
 * @returns {Object} Resulting object.
 */
function parseViewBox (viewBoxAttr) {
  if (!viewBoxAttr) return null
  const [x, y, width, height] = viewBoxAttr.split(/\s+/).map(Number)
  if ([x, y, width, height].every(Number.isFinite)) {
    return { x, y, width, height }
  }
  return null
}

/**
 * Parses translate point from serialized input values.
 *
 * @param {Function} transformAttr - Callback invoked by this function.
 * @returns {Object} Resulting object.
 */
function parseTranslatePoint (transformAttr) {
  if (!transformAttr) return null

  const match = transformAttr.match(/translate\(\s*([\d.-]+)\s*[\s,]+\s*([\d.-]+)\s*\)/)
  if (!match) return null

  const x = parseFloat(match[1])
  const y = parseFloat(match[2])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  return { x, y }
}

/**
 * Collects choice position map.
 *
 * @param {SVGElement|Document} svgElement - SVG document used by this function.
 * @returns {Element|null} Resulting object.
 */
function collectChoicePositionMap (svgElement) {
  const positions = new Map()
  if (!svgElement) return positions

  /**
   * Processes positions for this operation.
   *
   * @param {string} selector - CSS selector used to query target nodes.
   * @param {string} pointSelector - Collection of values used by this function.
   * @returns {void} No return value.
   */
  const addPositions = (selector, pointSelector) => {
    svgElement.querySelectorAll(selector).forEach(element => {
      const id = element.getAttribute('data-id')
      if (!id || positions.has(id)) return

      const pointElement = element.querySelector(pointSelector)
      const point = parseTranslatePoint(pointElement?.getAttribute('transform'))
      if (!point) return

      positions.set(id, point)
    })
  }

  addPositions('g.note:not(.bounding-box)[data-id]', '.notehead > use')
  addPositions('g.accid:not(.bounding-box)[data-id], g.keyAccid:not(.bounding-box)[data-id]', 'use')
  addPositions('g.artic:not(.bounding-box)[data-id]', 'use')

  return positions
}

/**
 * Builds choice reg to orig id map for subsequent processing steps.
 *
 * @param {Document} editedAtDom - DOM document used by this function.
 * @returns {Element|null} Resulting object.
 */
function buildChoiceRegToOrigIdMap (editedAtDom) {
  const regToOrig = new Map()
  if (!editedAtDom) return regToOrig

  /**
   * Processes by local name and corresp for this operation.
   *
   * @param {Element} origNodes - Element processed by this function.
   * @param {Element} regNodes - Element processed by this function.
   * @returns {string} Resulting string.
   */
  const pairByLocalNameAndCorresp = (origNodes, regNodes) => {
    const usedOrigIds = new Set()

    regNodes.forEach(regNode => {
      const regId = regNode.getAttribute('xml:id')
      if (!regId || regToOrig.has(regId)) return

      const regLocalName = regNode.localName
      const regCorresp = regNode.getAttribute('corresp') || ''

      const candidate = origNodes.find(origNode => {
        const origId = origNode.getAttribute('xml:id')
        if (!origId || usedOrigIds.has(origId)) return false
        if (origNode.localName !== regLocalName) return false
        const origCorresp = origNode.getAttribute('corresp') || ''
        return regCorresp.length > 0 && origCorresp === regCorresp
      })

      if (candidate) {
        const origId = candidate.getAttribute('xml:id')
        regToOrig.set(regId, origId)
        usedOrigIds.add(origId)
      }
    })

    regNodes.forEach(regNode => {
      const regId = regNode.getAttribute('xml:id')
      if (!regId || regToOrig.has(regId)) return

      const regLocalName = regNode.localName
      const candidate = origNodes.find(origNode => {
        const origId = origNode.getAttribute('xml:id')
        if (!origId || usedOrigIds.has(origId)) return false
        return origNode.localName === regLocalName
      })

      if (!candidate) return
      const origId = candidate.getAttribute('xml:id')
      regToOrig.set(regId, origId)
      usedOrigIds.add(origId)
    })
  }

  /**
   * Finds direct child.
   *
   * @param {Element} parent - Element processed by this function.
   * @param {string} localName - String input used by this function.
   * @returns {Object} Resulting object.
   */
  const findDirectChild = (parent, localName) => {
    const children = Array.from(parent.childNodes || [])
    return children.find(node => node.nodeType === 1 && node.localName === localName) || null
  }

  editedAtDom.querySelectorAll('choice').forEach(choiceNode => {
    const origNode = findDirectChild(choiceNode, 'orig')
    const regNode = findDirectChild(choiceNode, 'reg')
    if (!origNode || !regNode) return

    const origElements = Array.from(origNode.querySelectorAll('[xml\\:id]'))
    const regElements = Array.from(regNode.querySelectorAll('[xml\\:id]'))
    if (origElements.length === 0 || regElements.length === 0) return

    pairByLocalNameAndCorresp(origElements, regElements)
  })

  return regToOrig
}

/**
 * Extracts choice vertical offsets from the provided data structures.
 *
 * @param {SVGElement|Document} regAtSvg - SVG document used by this function.
 * @param {SVGElement|Document} origAtSvg - SVG document used by this function.
 * @param {Document} editedAtDom - DOM document used by this function.
 * @returns {Map<*, *>} Resulting mapping.
 */
function extractChoiceVerticalOffsets (regAtSvg, origAtSvg, editedAtDom) {
  const regSvgElement = regAtSvg?.documentElement || regAtSvg
  const origSvgElement = origAtSvg?.documentElement || origAtSvg
  if (!regSvgElement || !origSvgElement) return new Map()

  const regPositions = collectChoicePositionMap(regSvgElement)
  const origPositions = collectChoicePositionMap(origSvgElement)
  const regToOrig = buildChoiceRegToOrigIdMap(editedAtDom)

  const offsets = new Map()
  regPositions.forEach((regPos, id) => {
    const mappedOrigId = regToOrig.get(id) || id
    const origPos = origPositions.get(mappedOrigId)
    if (!origPos) return

    const diffY = Math.round((origPos.y - regPos.y) * 1000) / 1000
    if (Math.abs(diffY) < 0.001) return
    offsets.set(id, diffY)
  })

  return offsets
}

/**
 * Anchors fluid systems to AT left.
 *
 * @param {string} fluidSvgDocument - SVG document used by this function.
 * @returns {Object} Resulting object.
 */
function anchorFluidSystemsToAtLeft (fluidSvgDocument) {
  const rootSvg = fluidSvgDocument.documentElement || fluidSvgDocument
  const displaySvg = rootSvg.querySelector('svg.definition-scale') || rootSvg
  const viewBox = parseViewBox(displaySvg.getAttribute('viewBox'))
  if (!viewBox) return null

  const atFrame = displaySvg.querySelector('g.page-margin') || displaySvg
  const atRange = extractNodeXRange(atFrame)
  if (!atRange) return null

  const currentRight = viewBox.x + viewBox.width
  const newX = Math.floor(atRange.min)
  const newWidth = Math.max(1, Math.ceil(currentRight - newX))

  displaySvg.setAttribute('viewBox', `${newX} ${viewBox.y} ${newWidth} ${viewBox.height}`)
  return { newX, newWidth }
}

/**
 * Builds reading order block map for subsequent processing steps.
 *
 * @param {Document} atDom - DOM document used by this function.
 * @returns {Map<*, *>} Resulting mapping.
 */
function buildReadingOrderBlockMap (atDom) {
  const measureBlockMap = new Map()
  if (!atDom) return measureBlockMap

  let blockIndex = 0
  let sawMeasure = false
  let startNewBlock = false

  const sections = atDom.querySelectorAll('section')
  sections.forEach(section => {
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
      if (measureId) {
        measureBlockMap.set(measureId, blockIndex)
      }
      sawMeasure = true
    })
  })

  return measureBlockMap
}

/**
 * Returns first diplomatic corresp id from the current data context.
 *
 * @param {string} value - String input used by this function.
 * @returns {string} Resulting string.
 */
function getFirstDiplomaticCorrespId (value = '') {
  const diplomaticIds = getDiplomaticCorrespIds(value)
  return diplomaticIds[0] || null
}

/**
 * Maps annotated diplomatic corresp ids data to diplomatic transcription output.
 *
 * @param {string} value - String input used by this function.
 * @returns {Array<*>} Resulting list.
 */
function getDiplomaticCorrespIds (value = '') {
  if (!value) return []

  const ids = []
  const tokens = value.trim().split(/\s+/)
  tokens.forEach(token => {
    if (!token.includes('#')) return
    const [filePart, id] = token.split('#')
    if (!id) return
    const isDiplomaticRef = filePart.includes('/diplomaticTranscripts/') || filePart.endsWith('_dt.xml') || filePart === ''
    if (!isDiplomaticRef) return
    ids.push(id)
  })

  return ids
}

/**
 * Processes x for this operation.
 *
 * @param {{min: number, max: number}} range - Numeric range with minimum and maximum values.
 * @param {number} x - Numeric input used by this function.
 * @returns {void} No return value.
 */
function absorbX (range, x) {
  if (!Number.isFinite(x)) return
  range.min = Math.min(range.min, x)
  range.max = Math.max(range.max, x)
}

/**
 * Parses translate xvalues from serialized input values.
 *
 * @param {Function} transformAttr - Callback invoked by this function.
 * @returns {Array<*>} Resulting list.
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

/**
 * Extracts node xrange from the provided data structures.
 *
 * @param {Element} node - Element processed by this function.
 * @returns {number} Resulting numeric value.
 */
function extractNodeXRange (node) {
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
 * Renders fluid systems like.
 *
 * @param {Object} params - Destructured parameter bundle for this renderer stage.
 * @param {Object} params.data - Source payload containing AT/DT documents.
 * @param {Object} params.triple - File tuple with derived paths and timestamps.
 * @param {boolean} params.recreate - Re-render flag that bypasses output timestamp checks.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} params.logger - Logger instance.
 * @param {string} params.sourceDir - Source directory segment for per-system input SVGs.
 * @param {string} params.sourceSuffix - Source filename suffix used to resolve DT system SVGs.
 * @param {string} params.targetDir - Target directory segment for generated output SVGs.
 * @param {string} params.targetSuffix - Target filename suffix for generated SVGs.
 * @param {Date} params.outputDate - Output timestamp used by render freshness checks.
 * @param {Function} params.postProcessSvg - Optional post-processing hook for each generated system SVG.
 * @param {Object} params.generationOptions - Options passed through to fluid transcription generation.
 * @returns {{skipped: boolean, successCount?: number, errorCount?: number, noSystemFiles?: boolean}} Render summary for this invocation.
 */
function renderFluidSystemsLike ({ data, triple, recreate, logger, sourceDir, sourceSuffix, targetDir, targetSuffix, outputDate, postProcessSvg, generationOptions = {} }) {
  const { atDate, dtDate, atSvgPath } = triple

  if (!shouldRender(recreate, [atDate, dtDate], outputDate)) {
    return { skipped: true }
  }

  const dom = new JSDOM()
  const parser = new dom.window.DOMParser()
  const serializer = new dom.window.XMLSerializer()

  const atSvgDir = path.dirname(atSvgPath)
  const baseFilename = path.basename(atSvgPath).replace('_at.svg', '')

  const files = fs.readdirSync(atSvgDir)
  const atSystemFiles = files.filter(f =>
    f.startsWith(baseFilename) &&
    f.includes('_sys') &&
    f.endsWith('_at.svg')
  )

  if (atSystemFiles.length === 0) {
    return { skipped: false, successCount: 0, errorCount: 0, noSystemFiles: true }
  }

  let successCount = 0
  let errorCount = 0

  atSystemFiles.forEach(atSystemFile => {
    try {
      const systemIdMatch = atSystemFile.match(/_sys([^_]+)_at\.svg$/)
      if (!systemIdMatch) {
        logger.warn(`Could not extract system ID from ${atSystemFile}`)
        return
      }

      const atSystemPath = path.join(atSvgDir, atSystemFile)
      const dtSystemPath = atSystemPath
        .replace('/annotatedTranscripts/', sourceDir)
        .replace('_at.svg', sourceSuffix)
      const targetSystemPath = atSystemPath
        .replace('/annotatedTranscripts/', targetDir)
        .replace('_at.svg', targetSuffix)

      if (!fs.existsSync(dtSystemPath)) {
        logger.warn(`DT system file not found: ${dtSystemPath}`)
        errorCount++
        return
      }

      const atSystemSvgString = fs.readFileSync(atSystemPath, 'utf8')
      const dtSystemSvgString = fs.readFileSync(dtSystemPath, 'utf8')

      const atSystemSvg = parser.parseFromString(atSystemSvgString, 'image/svg+xml')
      const dtSystemSvg = parser.parseFromString(dtSystemSvgString, 'image/svg+xml')

      const effectiveGenerationOptions = {
        currentDtReference: triple.dtFullPath || triple.dt || '',
        ...generationOptions
      }

      const fluidSvg = generateFluidTranscription(dtSystemSvg, atSystemSvg, data.atDom, data.sourceDom, logger, effectiveGenerationOptions)

      if (postProcessSvg) {
        postProcessSvg(fluidSvg, {
          triple,
          systemId: systemIdMatch[1],
          atDom: data.atDom,
          dtSvgElement: dtSystemSvg.documentElement || dtSystemSvg
        })
      }

      const fluidSvgString = serializer.serializeToString(fluidSvg)

      const targetDirPath = path.dirname(targetSystemPath)
      if (!fs.existsSync(targetDirPath)) {
        fs.mkdirSync(targetDirPath, { recursive: true })
      }

      writeData(fluidSvgString, targetSystemPath)
      successCount++
    } catch (err) {
      logger.error(`Error processing system: ${err.message}`)
      errorCount++
    }
  })

  return { skipped: false, successCount, errorCount, noSystemFiles: false }
}

/**
 * Check if a file should be rendered based on recreate flag or date comparison
 *
 * @param {boolean} recreate - Force recreation flag
 * @param {Date[]} sourceDates - Array of source file dates to compare
 * @param {Date} outputDate - Output file date
 * @returns {boolean} True if file should be rendered
 */
function shouldRender (recreate, sourceDates, outputDate) {
  if (recreate) return true
  return sourceDates.some(sourceDate => sourceDate.getTime() > outputDate.getTime())
}

/**
 * Render Edited Annotated Transcript (MEI XML)
 *
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<void>} Promise resolving to the computed result.
 */
export async function renderEditedAnnotatedTranscript ({ data, triple, recreate, logger }) {
  const { atDate, editedAtPath, editedAtDate } = triple

  if (shouldRender(recreate, [atDate], editedAtDate)) {
    logger.info('Rendering Edited Annotated Transcript for ' + editedAtPath + ' ...')

    const editedAtDom = prepareEditedAtDom(data.atDom, data.dtDom)
    const editedAtString = serializeXmlCanonical(editedAtDom)

    await writeData(editedAtString, editedAtPath)
    logger.info('Successfully rendered ' + editedAtPath)
  } else {
    logger.info('Skipping Edited Annotated Transcript for ' + editedAtPath)
  }
}

/**
 * Render Annotated Transcript SVG
 * Renders both the full continuous AT and individual system ATs
 *
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<void>} Promise resolving to the computed result.
 */
export async function renderAnnotatedTranscriptSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, atSvgPath, atSvgDate } = triple

  if (shouldRender(recreate, [atDate], atSvgDate)) {
    logger.info('Rendering Annotated Transcript for ' + atSvgPath + ' ...')
    const atWithSbIndicators = addSbIndicators(null, data.atDom.cloneNode(true))
    const atOutDom = prepareAtDomForRendering(atWithSbIndicators, data.dtDom, pageDimensions)

    // Render full continuous AT
    const atSvgString = renderContinuousAt(atOutDom, verovio, 'annotated', pageDimensions)
    await writeData(atSvgString, atSvgPath)
    logger.info('Successfully rendered ' + atSvgPath)

    // Render individual system ATs
    try {
      const systemSvgs = renderSystemBasedAt(atOutDom, verovio, pageDimensions)

      if (systemSvgs.length > 0) {
        logger.info(`Rendering ${systemSvgs.length} individual AT systems...`)

        systemSvgs.forEach(async ({ systemId, svg }) => {
          if (systemId && svg) {
            // Generate system-specific filename
            // Pattern: {source}_{page}_{wz}_sys{systemId}_at.svg
            const systemSvgPath = atSvgPath.replace('_at.svg', `_sys${systemId}_at.svg`)
            await writeData(svg, systemSvgPath)
            logger.debug(`  Rendered AT system ${systemId}`)
          }
        })

        logger.info(`Successfully rendered all ${systemSvgs.length} AT systems`)
      }
    } catch (error) {
      logger.error('Error rendering AT systems: ' + error.message)
      throw error
    }
  } else {
    logger.info('Skipping Annotated Transcript for ' + atSvgPath)
  }
}

/**
 * Render Annotated Transcript MIDI
 *
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 * @returns {void} No return value.
 */
export function renderAnnotatedTranscriptMidi ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, atMidPath, atMidDate } = triple

  if (shouldRender(recreate, [atDate], atMidDate)) {
    logger.info('Rendering Annotated MIDI for ' + atMidPath + ' ...')
    const atWithSbIndicators = addSbIndicators(null, data.atDom.cloneNode(true))
    const atOutDom = prepareAtDomForRendering(atWithSbIndicators, data.dtDom, pageDimensions)
    const atMidBuffer = renderMidi(atOutDom, verovio)
    writeData(atMidBuffer, atMidPath)
  } else {
    logger.info('Skipping Annotated MIDI for ' + atMidPath)
  }
}

/**
 * Render Diplomatic Transcript SVG
 * Renders both the full DT and individual system files
 *
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<*>} Promise resolving to the computed result.
 */
export async function renderDiplomaticTranscriptSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { dtDate, dtSvgPath, dtSvgDate, sourceFullPath } = triple

  if (shouldRender(recreate, [dtDate], dtSvgDate)) {
    logger.info('Rendering Diplomatic Transcript for ' + dtSvgPath + ' ...')

    try {
      // Prepare the DT by merging with source information
      const preparedDt = prepareDtForThulemeier({
        dtDom: data.dtDom,
        sourceDom: data.sourceDom
      })

      if (!preparedDt) {
        logger.warn('Could not prepare diplomatic transcript - skipping ' + dtSvgPath)
        return
      }

      // Render full DT using Thulemeier
      const dtSvgString = await renderDiplomaticTranscript(preparedDt)
      await writeData(dtSvgString, dtSvgPath)
      logger.info('Successfully rendered ' + dtSvgPath)

      // Extract system IDs from original DT DOM
      const systems = data.dtDom.querySelectorAll('draft > system, draft > bw\\:system')
      const systemIds = Array.from(systems).map(s => s.getAttribute('xml:id')).filter(id => id)

      if (systemIds.length > 0) {
        logger.info(`Rendering ${systemIds.length} individual systems...`)

        // Render each system individually
        for (const systemId of systemIds) {
          try {
            // Generate system-specific filename
            // Pattern: {source}_{page}_{wz}_sys{systemId}_dt.svg
            const systemSvgPath = dtSvgPath.replace('_dt.svg', `_sys${systemId}_dt.svg`)

            // Render using singleSystem mode with margin around content
            // Thulemeier uses 1mm = 90 units
            // 20mm = 20 * 90 = 1800 units
            const systemSvgString = await renderDiplomaticTranscript(preparedDt, {
              mode: 'singleSystem',
              systemId,
              systemMargin: 1800 // 20mm margin around system content
            })

            await writeData(systemSvgString, systemSvgPath)
            logger.debug(`  Rendered system ${systemId}`)
          } catch (systemError) {
            // Fail completely if any system fails (as per requirement)
            throw new Error(`Failed to render system ${systemId}: ${systemError.message}`)
          }
        }

        logger.info(`Successfully rendered all ${systemIds.length} systems`)
      }
    } catch (error) {
      logger.error('Error rendering diplomatic transcript: ' + error.message)
      logger.debug('Source file: ' + sourceFullPath)
      throw error // Re-throw to ensure failure is visible
    }
  } else {
    logger.info('Skipping Diplomatic Transcript for ' + dtSvgPath)
  }
}

/**
 * Render Fluid Transcript SVG
 * Generates fluid transcriptions for each system pair (DT + AT)
 *
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 * @returns {void} No return value.
 */
export function renderFluidTranscriptSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, dtDate, ftSvgPath, ftSvgDate } = triple

  if (shouldRender(recreate, [atDate, dtDate], ftSvgDate)) {
    logger.info('Rendering Fluid Transcripts for system pairs...')

    try {
      const result = renderFluidSystemsLike({
        data,
        triple,
        recreate,
        logger,
        sourceDir: '/diplomaticTranscripts/',
        sourceSuffix: '_dt.svg',
        targetDir: '/fluidTranscripts/',
        targetSuffix: '_ft.svg',
        outputDate: ftSvgDate,
        generationOptions: { stateModel: 'fluidTranscript' }
      })

      if (result.skipped) {
        logger.info('Skipping Fluid Transcript for ' + ftSvgPath)
        return
      }

      if (result.noSystemFiles) {
        logger.warn('No AT system files found for fluid transcription generation')
        return
      }

      logger.info(`Fluid Transcript generation complete: ${result.successCount} succeeded, ${result.errorCount} failed`)
    } catch (err) {
      logger.error(`Error rendering fluid transcripts: ${err.message}`)
    }
  } else {
    logger.info('Skipping Fluid Transcript for ' + ftSvgPath)
  }
}

/**
 * Normalize a page reference value from pb attributes.
 *
 * @param {string} value - Raw pb attribute value.
 * @returns {string|null} Normalized page reference, or null when empty.
 */
function normalizePbReference (value = '') {
  const token = String(value).trim().split(/\s+/)[0]
  if (!token) return null

  const hashIndex = token.indexOf('#')
  if (hashIndex >= 0 && hashIndex < token.length - 1) {
    return token.slice(hashIndex + 1).trim()
  }

  return token
}

/**
 * Builds fluid systems error log path for the current output file.
 *
 * @param {string} fsSvgPath - Fluid systems output SVG path.
 * @returns {string} Error log output path.
 */
function buildFluidSystemsErrorLogPath (fsSvgPath) {
  const segments = fsSvgPath.split(path.sep)
  const sourcesIndex = segments.indexOf('sources')
  if (sourcesIndex >= 0) {
    segments[sourcesIndex] = 'errorLogs'
  } else {
    segments.splice(Math.max(0, segments.length - 1), 0, 'errorLogs')
  }

  segments[segments.length - 1] = segments[segments.length - 1].replace(/_fs\.svg$/, '_fs.error.log')
  return segments.join(path.sep)
}

/**
 * Produces a stable one-line summary for one fluid systems issue object.
 *
 * @param {Object} issue - Structured issue descriptor.
 * @returns {string} Flattened single-line summary.
 */
function formatFluidSystemsIssueLine (issue) {
  return Object.entries(issue || {})
    .map(([key, value]) => `${key}=${String(value ?? '').replace(/\s+/g, ' ').trim()}`)
    .join(';')
}

/**
 * Persists a fluidSystems error/warning report for one output file.
 *
 * @param {Object} params - Structured parameter bundle.
 * @param {Object} params.triple - File tuple containing source/target paths.
 * @param {Error|string} params.error - Error value to log.
 * @param {Array<Object>} params.issues - Non-fatal issue details to include.
 * @param {string} params.severity - Severity marker (`error` or `warning`).
 * @returns {Promise<void>} Promise resolving after log write.
 */
async function writeFluidSystemsErrorLog ({ triple, error, issues = [], severity = 'error' }) {
  if (!triple?.fsSvgPath) return
  if (!error && issues.length === 0) return

  const errorLogPath = buildFluidSystemsErrorLogPath(triple.fsSvgPath)
  const reason = error instanceof Error ? error.message : String(error || '')
  const uniqueIssueLines = Array.from(new Set(issues.map(formatFluidSystemsIssueLine).filter(Boolean)))
  const lines = [
    `timestamp=${new Date().toISOString()}`,
    'type=fluidSystems',
    `severity=${severity}`,
    `inputDt=${triple.dtFullPath || triple.dt || ''}`,
    `inputAt=${triple.atFullPath || triple.at || ''}`,
    `outputFs=${triple.fsSvgPath}`
  ]

  if (reason) {
    lines.push(`reason=${reason}`)
  }

  if (uniqueIssueLines.length > 0) {
    lines.push(`issueCount=${uniqueIssueLines.length}`)
    uniqueIssueLines.forEach((issueLine, index) => {
      lines.push(`issue.${index + 1}=${issueLine}`)
    })
  }

  await writeData(`${lines.join('\n')}\n`, errorLogPath)
}

/**
 * Collect DT page references from pb attributes.
 *
 * @param {Document} dom - MEI DOM to inspect.
 * @returns {Set<string>} Normalized DT page references.
 */
function collectDtPageReferenceSet (dom) {
  const values = new Set()
  if (!dom) return values

  dom.querySelectorAll('pb[target], pb[corresp]').forEach(pb => {
    const targetRef = normalizePbReference(pb.getAttribute('target'))
    const correspRef = normalizePbReference(pb.getAttribute('corresp'))
    const pageRef = targetRef || correspRef
    if (!pageRef) return
    values.add(pageRef)
  })

  return values
}

/**
 * Build AT block -> page reference mapping using section traversal order.
 *
 * @param {Document} atDom - Annotated transcript MEI DOM.
 * @returns {Map<number, string>} Mapping from AT block index to normalized page reference.
 */
function buildAtBlockPageReferenceMap (atDom) {
  const blockMap = buildReadingOrderBlockMap(atDom)
  const pageByBlock = new Map()
  if (!atDom || blockMap.size === 0) return pageByBlock

  const sections = atDom.querySelectorAll('section')
  sections.forEach(section => {
    let currentPageReference = null

    Array.from(section.querySelectorAll('pb, measure')).forEach(node => {
      if (node.localName === 'pb') {
        // AT usually stores page linkage on @corresp; keep @target as fallback.
        const pageRef = normalizePbReference(node.getAttribute('corresp')) || normalizePbReference(node.getAttribute('target'))
        currentPageReference = pageRef || null
        return
      }

      if (node.localName !== 'measure') return
      if (!currentPageReference) return

      const measureId = node.getAttribute('xml:id')
      const blockIndex = blockMap.get(measureId)
      if (!Number.isFinite(blockIndex)) return

      pageByBlock.set(blockIndex, currentPageReference)
    })
  })

  return pageByBlock
}

/**
 * Build AT block -> DT system id mapping from sb corresp/target attributes.
 *
 * @param {Document} atDom - Annotated transcript MEI DOM.
 * @returns {Map<number, string>} Mapping from AT block index to DT system id.
 */
function buildAtBlockDtSystemMap (atDom) {
  const blockMap = buildReadingOrderBlockMap(atDom)
  const systemByBlock = new Map()
  if (!atDom || blockMap.size === 0) return systemByBlock

  const sections = atDom.querySelectorAll('section')
  sections.forEach(section => {
    let currentSystemId = null

    Array.from(section.querySelectorAll('sb, measure')).forEach(node => {
      if (node.localName === 'sb') {
        // AT usually stores DT system linkage on @corresp; keep @target as fallback.
        const systemId = getFirstDiplomaticCorrespId(node.getAttribute('corresp')) || getFirstDiplomaticCorrespId(node.getAttribute('target'))
        currentSystemId = systemId || null
        return
      }

      if (node.localName !== 'measure') return

      const measureId = node.getAttribute('xml:id')
      const blockIndex = blockMap.get(measureId)
      if (!Number.isFinite(blockIndex)) return

      if (currentSystemId && !systemByBlock.has(blockIndex)) {
        systemByBlock.set(blockIndex, currentSystemId)
      }
    })
  })

  return systemByBlock
}

/**
 * Resolve AT blocks that belong to the currently rendered DT page context,
 * including strict block -> DT system id references from AT sb@corresp.
 *
 * @param {Document} atDom - Annotated transcript MEI DOM.
 * @param {Document} dtDom - Diplomatic transcript MEI DOM.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance.
 * @returns {{matchedStaffLineBlocks: Set<number>|null, blockToDtSystemId: Map<number, string>|null, errorMessage: string|null}}
 * Strict resolution context or error details.
 */
export function resolveMatchedStaffLineContextForCurrentDt (atDom, dtDom, logger) {
  const dtPageReferenceSet = collectDtPageReferenceSet(dtDom)
  if (dtPageReferenceSet.size === 0) {
    const errorMessage = '[renderFluidSystemsSvg] No pb@target or pb@corresp in DT; cannot resolve strict staff-line block mapping.'
    logger.warn(errorMessage)
    return { matchedStaffLineBlocks: null, blockToDtSystemId: null, errorMessage }
  }

  const pageByBlock = buildAtBlockPageReferenceMap(atDom)
  if (pageByBlock.size === 0) {
    const errorMessage = '[renderFluidSystemsSvg] No AT block page mapping from pb attributes; cannot resolve strict staff-line block mapping.'
    logger.warn(errorMessage)
    return { matchedStaffLineBlocks: null, blockToDtSystemId: null, errorMessage }
  }

  const matchedBlocks = new Set()
  pageByBlock.forEach((pageReference, blockIndex) => {
    if (dtPageReferenceSet.has(pageReference)) {
      matchedBlocks.add(blockIndex)
    }
  })

  if (matchedBlocks.size === 0) {
    const errorMessage = '[renderFluidSystemsSvg] AT block mapping produced no DT page matches; cannot resolve strict staff-line block mapping.'
    logger.warn(errorMessage)
    return { matchedStaffLineBlocks: null, blockToDtSystemId: null, errorMessage }
  }

  const systemByBlock = buildAtBlockDtSystemMap(atDom)
  const blockToDtSystemId = new Map()
  const missingSystemBlocks = []

  Array.from(matchedBlocks).sort((a, b) => a - b).forEach(blockIndex => {
    const systemId = systemByBlock.get(blockIndex)
    if (!systemId) {
      missingSystemBlocks.push(blockIndex)
      return
    }
    blockToDtSystemId.set(blockIndex, systemId)
  })

  if (missingSystemBlocks.length > 0) {
    const errorMessage = `[renderFluidSystemsSvg] Missing AT sb@corresp DT system mapping for matched blocks: ${missingSystemBlocks.join(', ')}.`
    logger.warn(errorMessage)
    return { matchedStaffLineBlocks: null, blockToDtSystemId: null, errorMessage }
  }

  return { matchedStaffLineBlocks: matchedBlocks, blockToDtSystemId, errorMessage: null }
}

/**
 * Builds DT SVG from current DT/source DOM inputs for fluidSystems generation.
 *
 * @param {Object} params - Structured parameter bundle.
 * @param {Document} params.dtDom - Diplomatic transcript MEI DOM.
 * @param {Document} params.sourceDom - Source MEI DOM.
 * @param {DOMParser} params.parser - XML parser used to build SVG DOM.
 * @param {Function} [params.prepareDt] - Optional DI hook for DT preparation.
 * @param {Function} [params.renderDt] - Optional DI hook for DT SVG rendering.
 * @returns {Promise<SVGElement|Document>} Parsed DT SVG document.
 */
export async function buildCurrentDtSvgForFluidSystems ({ dtDom, sourceDom, parser, prepareDt = prepareDtForThulemeier, renderDt = renderDiplomaticTranscript }) {
  const preparedDt = prepareDt({ dtDom, sourceDom })
  if (!preparedDt) {
    throw new Error('[renderFluidSystemsSvg] Could not prepare diplomatic transcript for fluid systems generation.')
  }

  const dtSvgString = await renderDt(preparedDt)
  return parser.parseFromString(dtSvgString, 'image/svg+xml')
}

/**
 * Render Fluid Systems SVG
 *
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom, reconstructionDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<void>} Promise resolving to the computed result.
 */
export async function renderFluidSystemsSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, dtDate, fsSvgPath, fsSvgDate } = triple
  const systemLabelIssues = []

  if (!shouldRender(recreate, [atDate, dtDate], fsSvgDate)) {
    logger.info('Skipping Fluid Systems for ' + fsSvgPath)
    return
  }

  logger.info('Rendering Fluid Systems for system pairs...')

  try {
    const dom = new JSDOM()
    const parser = new dom.window.DOMParser()
    const serializer = new dom.window.XMLSerializer()

    const dtSvg = await buildCurrentDtSvgForFluidSystems({
      dtDom: data.dtDom,
      sourceDom: data.sourceDom,
      parser
    })

    // Derive per-element vertical offsets from editedAT choice rendering (reg vs orig).
    const editedAtDom = prepareEditedAtDom(data.atDom, data.dtDom)
    const editedAtWithSbIndicators = addSbIndicators(null, editedAtDom.cloneNode(true))

    const editedRenderDom = prepareAtDomForRendering(editedAtWithSbIndicators, data.dtDom, pageDimensions)
    const regAtSvgString = renderContinuousAt(editedRenderDom, verovio, 'annotated', pageDimensions, {
      choiceXPathQuery: ['./reg']
    })
    const origAtSvgString = renderContinuousAt(editedRenderDom, verovio, 'annotated', pageDimensions, {
      choiceXPathQuery: ['./orig']
    })
    const regAtSvg = parser.parseFromString(regAtSvgString, 'image/svg+xml')
    const origAtSvg = parser.parseFromString(origAtSvgString, 'image/svg+xml')
    const choiceVerticalOffsets = extractChoiceVerticalOffsets(regAtSvg, origAtSvg, editedAtDom)
    const staffLineContext = resolveMatchedStaffLineContextForCurrentDt(data.atDom, data.dtDom, logger)
    if (staffLineContext.errorMessage) {
      throw new Error(staffLineContext.errorMessage)
    }

    const dtSystemIdsInSvg = new Set(
      Array.from(dtSvg.querySelectorAll('g.system:not(.bounding-box)[data-id]'))
        .map(system => system.getAttribute('data-id'))
        .filter(Boolean)
    )

    const missingSvgSystems = Array.from(staffLineContext.blockToDtSystemId.values())
      .filter(systemId => !dtSystemIdsInSvg.has(systemId))

    if (missingSvgSystems.length > 0) {
      const missingUnique = Array.from(new Set(missingSvgSystems))
      const message = `[renderFluidSystemsSvg] AT sb@corresp references DT systems that are missing in DT SVG: ${missingUnique.join(', ')}.`
      logger.warn(message)
      throw new Error(message)
    }

    // Keep the canonical AT render as the geometry base to avoid side effects in clef handling.
    const atWithSbIndicators = addSbIndicators(null, data.atDom.cloneNode(true))
    const renderDom = prepareAtDomForRendering(atWithSbIndicators, data.dtDom, pageDimensions)
    const atSvgString = renderContinuousAt(renderDom, verovio, 'annotated', pageDimensions)
    const atSvg = parser.parseFromString(atSvgString, 'image/svg+xml')

    const atSvgWithSystemLabels = addSystemLabelBlocks(atSvg, data.atDom, data.dtDom, data.sourceDom, data.reconstructionDom, triple, {
      onIssue: (issue) => {
        systemLabelIssues.push(issue)
      }
    })

    const fluidSvg = generateFluidTranscription(dtSvg, atSvgWithSystemLabels, data.atDom, data.sourceDom, logger, {
      stateModel: 'fluidSystems',
      currentDtReference: triple.dtFullPath || triple.dt || '',
      choiceVerticalOffsets,
      matchedStaffLineBlocks: staffLineContext.matchedStaffLineBlocks,
      blockToDtSystemId: staffLineContext.blockToDtSystemId
    })
    anchorFluidSystemsToAtLeft(fluidSvg)

    const fluidSvgString = serializer.serializeToString(fluidSvg)
    await writeData(fluidSvgString, fsSvgPath)

    if (systemLabelIssues.length > 0) {
      const warningMessage = `[renderFluidSystemsSvg] Non-fatal system label issues detected (${systemLabelIssues.length}); see fluid systems error log for details.`
      logger.warn(warningMessage)
      try {
        await writeFluidSystemsErrorLog({
          triple,
          error: warningMessage,
          issues: systemLabelIssues,
          severity: 'warning'
        })
      } catch (logErr) {
        logger.error(`Error writing fluid systems warning log: ${logErr.message}`)
      }
    }

    logger.info('Fluid Systems generation complete: 1 succeeded, 0 failed')
  } catch (err) {
    logger.error(`Error rendering fluid systems: ${err.message}`)
    try {
      await writeFluidSystemsErrorLog({ triple, error: err, issues: systemLabelIssues, severity: 'error' })
    } catch (logErr) {
      logger.error(`Error writing fluid systems error log: ${logErr.message}`)
    }
  }
}

/**
 * Render Fluid Transcript HTML
 *
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 * @returns {void} No return value.
 */
export function renderFluidTranscriptHtml ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, dtDate, ftHtmlPath, ftHtmlDate } = triple

  if (shouldRender(recreate, [atDate, dtDate], ftHtmlDate)) {
    logger.info('Rendering Fluid HTML for ' + ftHtmlPath + ' ...')
    logger.info('TODO create fluid HTML ' + ftHtmlPath)
    // TODO: Implement fluid HTML rendering
    // const html = generateHtmlWrapper(ftSvgDom, data.sourceDom, data.dtDom, data.atDom, htmlPath.split('/').pop())
    // writeData(serializer.serializeToString(html), ftHtmlPath)
  } else {
    logger.info('Skipping Fluid HTML for ' + ftHtmlPath)
  }
}
