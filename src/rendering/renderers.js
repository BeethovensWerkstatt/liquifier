import { addSbIndicators, prepareAtDomForRendering } from '../preparation/annotatedTranscripts.js'
import { prepareEditedAtDom } from '../preparation/editedAnnotatedTranscripts.js'
import { prepareDtForThulemeier } from '../preparation/mei.js'
import { serializeXmlCanonical } from '../utils/xml.js'
import { renderContinuousAt, renderSystemBasedAt, renderMidi } from './verovioHandler.js'
import { renderDiplomaticTranscript, getThulemeierVersion } from './thulemeierHandler.js'
import { writeData } from '../filehandlers/filehandler.js'
import { generateFluidTranscription } from '../preparation/fluidTranscripts.js'
import { JSDOM } from 'jsdom'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'

const FLUID_SYSTEMS_DESC_ID = 'bw-fs-overlay-metadata'
const SVG_NS = 'http://www.w3.org/2000/svg'
const READING_ORDER_BLOCK_GAP = 80
const CURRENT_PAGE_REGION_PADDING = 500
const CURRENT_PAGE_REGION_TARGET_X = 1000
const require = createRequire(import.meta.url)
const { version: LIQUIFIER_VERSION } = require('../../package.json')
/**
 * Canonical phase sequence used by fluidSystems overlays and animation metadata.
 */
export const FLUID_SYSTEMS_STATE_SEQUENCE = [
  'finding',
  'normalization',
  'readingOrder',
  'regulation',
  'supplements',
  'interventions'
]

function getSvgViewBoxSize (svgElement) {
  const viewBox = svgElement.getAttribute('viewBox')
  if (viewBox) {
    const [x, y, width, height] = viewBox.split(/\s+/).map(Number)
    if ([x, y, width, height].every(Number.isFinite)) {
      return { x, y, width, height }
    }
  }

  const widthAttr = parseFloat(svgElement.getAttribute('width') || '0')
  const heightAttr = parseFloat(svgElement.getAttribute('height') || '0')
  return {
    x: 0,
    y: 0,
    width: Number.isFinite(widthAttr) ? widthAttr : 0,
    height: Number.isFinite(heightAttr) ? heightAttr : 0
  }
}

function parseViewBox (viewBoxAttr) {
  if (!viewBoxAttr) return null
  const [x, y, width, height] = viewBoxAttr.split(/\s+/).map(Number)
  if ([x, y, width, height].every(Number.isFinite)) {
    return { x, y, width, height }
  }
  return null
}

function parseTranslatePoint (transformAttr) {
  if (!transformAttr) return null

  const match = transformAttr.match(/translate\(\s*([\d.-]+)\s*[\s,]+\s*([\d.-]+)\s*\)/)
  if (!match) return null

  const x = parseFloat(match[1])
  const y = parseFloat(match[2])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  return { x, y }
}

function collectChoicePositionMap (svgElement) {
  const positions = new Map()
  if (!svgElement) return positions

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

function buildChoiceRegToOrigIdMap (editedAtDom) {
  const regToOrig = new Map()
  if (!editedAtDom) return regToOrig

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

function buildReadingOrderBlockMap (atDom) {
  const measureBlockMap = new Map()
  if (!atDom) return measureBlockMap

  let blockIndex = 0
  let sawMeasure = false
  let startNewBlock = false

  const sections = atDom.querySelectorAll('section')
  sections.forEach(section => {
    Array.from(section.children).forEach(node => {
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

function getFirstDiplomaticCorrespId (value = '') {
  const diplomaticIds = getDiplomaticCorrespIds(value)
  return diplomaticIds[0] || null
}

function buildDtIdSet (dtDom) {
  const dtIds = new Set()
  if (!dtDom) return dtIds

  dtDom.querySelectorAll('*').forEach(node => {
    const id = node.getAttribute('xml:id')
    if (id) dtIds.add(id)
  })

  return dtIds
}

function buildMappedAtIdSet (atDom, dtIds) {
  const atIds = new Set()
  if (!atDom || !dtIds || dtIds.size === 0) return atIds

  atDom.querySelectorAll('[corresp]').forEach(element => {
    const atId = element.getAttribute('xml:id')
    if (!atId) return

    const diplomaticIds = getDiplomaticCorrespIds(element.getAttribute('corresp'))
    if (diplomaticIds.some(id => dtIds.has(id))) {
      atIds.add(atId)
    }
  })

  return atIds
}

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

function buildAtToDtMeasureMap (atDom) {
  const map = new Map()
  if (!atDom) return map

  const measures = atDom.querySelectorAll('measure[corresp]')
  measures.forEach(measure => {
    const atId = measure.getAttribute('xml:id')
    if (!atId) return

    const dtId = getFirstDiplomaticCorrespId(measure.getAttribute('corresp'))
    if (!dtId) return

    map.set(atId, dtId)
  })

  return map
}

function absorbX (range, x) {
  if (!Number.isFinite(x)) return
  range.min = Math.min(range.min, x)
  range.max = Math.max(range.max, x)
}

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

function getAnimationValueForPhase (animationElement, phaseIndex) {
  if (!animationElement) return null

  const values = (animationElement.getAttribute('values') || '').split(';').map(v => v.trim()).filter(Boolean)
  if (values.length === 0) return null

  const index = Math.min(phaseIndex, values.length - 1)
  return values[index]
}

function parseTranslateXFromAnimationValue (value) {
  if (!value) return 0

  const match = value.match(/^([\d.-]+)[\s,]+([\d.-]+)$/)
  if (!match) return 0

  const x = parseFloat(match[1])
  return Number.isFinite(x) ? x : 0
}

function parseNoteheadBaseX (noteElement) {
  const noteheadUse = noteElement.querySelector('.notehead > use')
  if (!noteheadUse) return null

  const translatedPoint = parseTranslatePoint(noteheadUse.getAttribute('transform'))
  if (translatedPoint) return translatedPoint.x

  const x = parseFloat(noteheadUse.getAttribute('x') || '')
  return Number.isFinite(x) ? x : null
}

function isElementVisibleAtPhase (element, phaseIndex) {
  const opacityAnimation = element.querySelector(':scope > animate[attributeName="opacity"]')
  const opacityValue = getAnimationValueForPhase(opacityAnimation, phaseIndex)
  if (!opacityValue) return true
  return opacityValue !== '0'
}

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

function computeMappedNotePhaseRegion (svgElement, mappedAtIds, phaseIndex) {
  if (!svgElement || !mappedAtIds || mappedAtIds.size === 0) return null

  const displaySvg = svgElement.querySelector('svg.definition-scale') || svgElement
  const pageMargin = displaySvg.querySelector('g.page-margin')
  if (!pageMargin) return null

  const pageMarginTranslate = parseTranslatePoint(pageMargin.getAttribute('transform')) || { x: 0, y: 0 }
  const positions = []

  pageMargin.querySelectorAll('g.note:not(.bounding-box)[data-id]').forEach(noteElement => {
    const atId = noteElement.getAttribute('data-id')
    if (!atId || !mappedAtIds.has(atId)) return
    if (!isElementVisibleAtPhase(noteElement, phaseIndex)) return

    const baseX = parseNoteheadBaseX(noteElement)
    if (!Number.isFinite(baseX)) return

    const translateAnimation = noteElement.querySelector(':scope > animateTransform[type="translate"]')
    const translateValue = getAnimationValueForPhase(translateAnimation, phaseIndex)
    const translateX = parseTranslateXFromAnimationValue(translateValue)

    positions.push(baseX + translateX + pageMarginTranslate.x)
  })

  if (positions.length === 0) return null

  const min = Math.min(...positions)
  const max = Math.max(...positions)
  const width = Math.max(1, max - min)

  return {
    source: 'mappedNotes',
    phaseIndex,
    sampleCount: positions.length,
    contentXMin: Math.round(min),
    contentXMax: Math.round(max),
    contentWidth: Math.round(width)
  }
}

function computeCurrentPageRegion (svgElement, atDom, dtDom) {
  if (!svgElement || !atDom || !dtDom) return null

  const dtMeasureIds = buildDtIdSet(dtDom)
  if (dtMeasureIds.size === 0) return null

  const atMeasureIds = []
  atDom.querySelectorAll('measure[corresp]').forEach(measure => {
    const atId = measure.getAttribute('xml:id')
    if (!atId) return

    const diplomaticIds = getDiplomaticCorrespIds(measure.getAttribute('corresp'))
    if (diplomaticIds.some(id => dtMeasureIds.has(id))) {
      atMeasureIds.push(atId)
    }
  })

  if (atMeasureIds.length === 0) return null

  const ranges = []
  atMeasureIds.forEach(atId => {
    const measureNode = svgElement.querySelector(`g.measure:not(.bounding-box)[data-id="${atId}"]`)
    if (!measureNode) return

    const range = extractNodeXRange(measureNode)
    if (range) ranges.push(range)
  })

  if (ranges.length === 0) return null

  const rawMin = Math.min(...ranges.map(range => range.min))
  const rawMax = Math.max(...ranges.map(range => range.max))

  const displaySvg = svgElement.querySelector('svg.definition-scale') || svgElement
  const pageMargin = displaySvg.querySelector('g.page-margin')
  const pageMarginTranslate = parseTranslatePoint(pageMargin?.getAttribute('transform')) || { x: 0, y: 0 }

  const renderedMin = rawMin + pageMarginTranslate.x
  const renderedMax = rawMax + pageMarginTranslate.x
  const renderedWidth = Math.max(1, renderedMax - renderedMin)

  const displayViewBox = parseViewBox(displaySvg.getAttribute('viewBox')) || getSvgViewBoxSize(displaySvg)
  const focusX = Math.floor(renderedMin - CURRENT_PAGE_REGION_PADDING)
  const focusWidth = Math.max(1, Math.ceil(renderedWidth + 2 * CURRENT_PAGE_REGION_PADDING))

  return {
    source: 'atMeasureCorresp',
    coordinateSpace: 'definition-scale-viewBox',
    dtMeasureCount: dtMeasureIds.size,
    atMeasureCount: ranges.length,
    contentXMin: Math.round(renderedMin),
    contentXMax: Math.round(renderedMax),
    contentWidth: Math.round(renderedWidth),
    pageMarginTranslateX: pageMarginTranslate.x,
    pageMarginTranslateY: pageMarginTranslate.y,
    focusViewBox: {
      x: focusX,
      y: displayViewBox.y,
      width: focusWidth,
      height: displayViewBox.height
    },
    focusViewBoxString: `${focusX} ${displayViewBox.y} ${focusWidth} ${displayViewBox.height}`,
    padding: CURRENT_PAGE_REGION_PADDING
  }
}

function alignCurrentPageRegionToVisibleLeft (svgElement, currentPageRegion) {
  if (!svgElement || !currentPageRegion) return null

  const displaySvg = svgElement.querySelector('svg.definition-scale') || svgElement
  const pageMargin = displaySvg.querySelector('g.page-margin')
  if (!pageMargin) return null

  const currentTranslation = parseTranslatePoint(pageMargin.getAttribute('transform')) || { x: 0, y: 0 }
  const deltaX = Math.round(CURRENT_PAGE_REGION_TARGET_X - currentPageRegion.contentXMin)
  const nextX = currentTranslation.x + deltaX

  if (deltaX !== 0) {
    pageMargin.setAttribute('transform', `translate(${nextX}, ${currentTranslation.y})`)
  }

  return {
    targetX: CURRENT_PAGE_REGION_TARGET_X,
    previousTranslateX: currentTranslation.x,
    translatedX: nextX,
    deltaX
  }
}

function computeBlockLayout (blockRanges) {
  const sorted = Array.from(blockRanges.entries()).sort((a, b) => a[0] - b[0])
  if (sorted.length === 0) return new Map()

  const overallMin = Math.min(...sorted.map(([, range]) => range.min))
  const overallMax = Math.max(...sorted.map(([, range]) => range.max))
  const originalCenter = (overallMin + overallMax) / 2

  const widths = sorted.map(([, range]) => Math.max(1, range.max - range.min))
  const totalWidth = widths.reduce((acc, width) => acc + width, 0) + Math.max(0, sorted.length - 1) * READING_ORDER_BLOCK_GAP
  let currentLeft = originalCenter - (totalWidth / 2)

  const offsets = new Map()
  sorted.forEach(([blockIndex, range], i) => {
    const width = widths[i]
    const originalBlockCenter = (range.min + range.max) / 2
    const targetCenter = currentLeft + (width / 2)
    offsets.set(blockIndex, Math.round(targetCenter - originalBlockCenter))
    currentLeft += width + READING_ORDER_BLOCK_GAP
  })

  return offsets
}

function buildBlockRangesFromDt (dtSvgElement, atDom, measureBlockMap) {
  const blockRanges = new Map()
  if (!dtSvgElement || !atDom || measureBlockMap.size === 0) return blockRanges

  const atToDtMeasureMap = buildAtToDtMeasureMap(atDom)
  measureBlockMap.forEach((blockIndex, atMeasureId) => {
    const dtMeasureId = atToDtMeasureMap.get(atMeasureId)
    if (!dtMeasureId) return

    const dtMeasure = dtSvgElement.querySelector(`g.measure:not(.bounding-box)[data-id="${dtMeasureId}"]`)
    if (!dtMeasure) return

    const range = extractNodeXRange(dtMeasure)
    if (!range) return

    if (!blockRanges.has(blockIndex)) {
      blockRanges.set(blockIndex, { min: range.min, max: range.max })
      return
    }

    const existing = blockRanges.get(blockIndex)
    existing.min = Math.min(existing.min, range.min)
    existing.max = Math.max(existing.max, range.max)
  })

  return blockRanges
}

function applyReadingOrderStageTransform (svgElement, atDom, dtSvgElement) {
  const measureBlockMap = buildReadingOrderBlockMap(atDom)
  if (measureBlockMap.size === 0) {
    return { adjustedCount: 0, adjustedMeasureIds: [], geometrySource: 'none' }
  }

  const measureNodes = Array.from(svgElement.querySelectorAll('g.measure:not(.bounding-box)[data-id]'))
  const blockRanges = buildBlockRangesFromDt(dtSvgElement, atDom, measureBlockMap)
  const hasDtRanges = blockRanges.size > 0
  let geometrySource = hasDtRanges ? 'dt' : 'ft'

  if (blockRanges.size === 0) {
    geometrySource = 'ft'
  }

  measureNodes.forEach(node => {
    const measureId = node.getAttribute('data-id')
    const blockIndex = measureBlockMap.get(measureId)
    if (!Number.isFinite(blockIndex)) return

    // If DT geometry exists for this block, keep DT extents authoritative.
    if (hasDtRanges && blockRanges.has(blockIndex)) return

    const range = extractNodeXRange(node)
    if (!range) return

    if (!blockRanges.has(blockIndex)) {
      blockRanges.set(blockIndex, { min: range.min, max: range.max })
      return
    }

    const existing = blockRanges.get(blockIndex)
    existing.min = Math.min(existing.min, range.min)
    existing.max = Math.max(existing.max, range.max)
  })

  if (blockRanges.size === 0) {
    return { adjustedCount: 0, adjustedMeasureIds: [], geometrySource }
  }

  const blockOffsets = computeBlockLayout(blockRanges)
  const adjustedMeasureIds = []

  measureNodes.forEach(node => {
    const measureId = node.getAttribute('data-id')
    const blockIndex = measureBlockMap.get(measureId)
    if (!Number.isFinite(blockIndex)) return

    const blockOffsetX = blockOffsets.get(blockIndex) || 0
    if (blockOffsetX === 0) return

    const anim = svgElement.ownerDocument.createElementNS(SVG_NS, 'animateTransform')
    anim.setAttribute('attributeName', 'transform')
    anim.setAttribute('attributeType', 'XML')
    anim.setAttribute('type', 'translate')
    anim.setAttribute('values', `0 0;0 0;${blockOffsetX} 0;0 0;0 0;0 0`)
    anim.setAttribute('dur', '5s')
    anim.setAttribute('repeatCount', 'indefinite')
    node.appendChild(anim)

    const existingClass = node.getAttribute('class') || ''
    node.setAttribute('class', `${existingClass} bw-fs-reading-order-shift`.trim())
    node.setAttribute('data-bw-reading-order-offset-x', String(blockOffsetX))
    adjustedMeasureIds.push(measureId)
  })

  return { adjustedCount: adjustedMeasureIds.length, adjustedMeasureIds, geometrySource }
}

function extractVerovioVersionFromDescText (descText = '') {
  const engravedMatch = descText.match(/Engraved by Verovio\s+(.+)$/i)
  if (engravedMatch && engravedMatch[1]) {
    return engravedMatch[1].trim()
  }

  const cachedMatch = descText.match(/Annotated Transcription rendered by Verovio\s+(.+?)\s+and Diplomatic Transcription/i)
  if (cachedMatch && cachedMatch[1]) {
    return cachedMatch[1].trim()
  }

  return null
}

function upsertFluidSystemsProvenanceDesc (svgElement, { liquifierVersion, thulemeierVersion }) {
  const descNodes = Array.from(svgElement.querySelectorAll('desc'))
  const nonMetadataDescNodes = descNodes.filter(desc => desc.getAttribute('id') !== FLUID_SYSTEMS_DESC_ID)

  const preferredDesc = nonMetadataDescNodes.find(desc => {
    const text = desc.textContent || ''
    return text.includes('Engraved by Verovio') || text.includes('Annotated Transcription rendered by Verovio')
  }) || nonMetadataDescNodes[0] || null

  const verovioVersion = extractVerovioVersionFromDescText(preferredDesc?.textContent || '') || 'unknown'
  const resolvedLiquifierVersion = liquifierVersion || LIQUIFIER_VERSION || 'unknown'
  const resolvedThulemeierVersion = thulemeierVersion || 'unknown'

  const text = `Cached Fluid Transcription rendered by Liquifier ${resolvedLiquifierVersion}, based on Annotated Transcription rendered by Verovio ${verovioVersion} and Diplomatic Transcription rendered by Thulemeier ${resolvedThulemeierVersion}.`

  if (preferredDesc) {
    preferredDesc.textContent = text
    return preferredDesc
  }

  const desc = svgElement.ownerDocument.createElementNS(SVG_NS, 'desc')
  desc.textContent = text
  svgElement.insertBefore(desc, svgElement.firstChild)
  return desc
}

/**
 * Stamp fluidSystems provenance and reading-order overlay metadata into output SVG.
 * @param {SVGElement} svgElement - Fluid SVG root element
 * @param {Object} params - Metadata source bundle
 * @param {Object} params.triple - File tuple containing page metadata
 * @param {string} [params.systemId] - Single DT system id (legacy single-system path)
 * @param {string[]} [params.systemIds] - DT system ids used in the output
 * @param {Document} [params.atDom] - AT MEI DOM used for reading-order grouping
 * @param {Document} [params.dtDom] - DT MEI DOM used for current-page region mapping
 * @param {SVGElement} [params.dtSvgElement] - DT SVG root for geometry extraction
 * @param {string} [params.liquifierVersion] - Liquifier version string for provenance description
 * @param {string} [params.thulemeierVersion] - Thulemeier version string for provenance description
 * @returns {SVGElement} The same SVG element with updated metadata attributes/desc payload
 */
export function applyFluidSystemsOutputMetadata (svgElement, { triple, systemId, systemIds, atDom, dtDom, dtSvgElement, liquifierVersion, thulemeierVersion }) {
  const classList = (svgElement.getAttribute('class') || '').split(/\s+/).filter(Boolean)
  const filteredClassList = classList.filter(className => !className.startsWith('bw-fs-state-'))

  if (filteredClassList.length > 0) {
    svgElement.setAttribute('class', filteredClassList.join(' '))
  } else {
    svgElement.removeAttribute('class')
  }
  svgElement.removeAttribute('data-bw-fs-states')

  upsertFluidSystemsProvenanceDesc(svgElement, {
    liquifierVersion,
    thulemeierVersion
  })

  const readingOrder = applyReadingOrderStageTransform(svgElement, atDom, dtSvgElement)
  const mappedAtIds = buildMappedAtIdSet(atDom, buildDtIdSet(dtDom))
  const interventionsRegionBeforeAlignment = computeMappedNotePhaseRegion(svgElement, mappedAtIds, 5)
  const regionBeforeAlignment = interventionsRegionBeforeAlignment || computeCurrentPageRegion(svgElement, atDom, dtDom)
  const currentPageRegionAlignment = alignCurrentPageRegionToVisibleLeft(svgElement, regionBeforeAlignment)
  const findingRegion = computeMappedNotePhaseRegion(svgElement, mappedAtIds, 0)
  const interventionsRegion = computeMappedNotePhaseRegion(svgElement, mappedAtIds, 5)
  const currentPageRegion = computeCurrentPageRegion(svgElement, atDom, dtDom)

  const vb = getSvgViewBoxSize(svgElement)
  const metadata = {
    currentPageId: triple.page,
    overlayOffsetX: 0,
    overlayOffsetY: 0,
    overlayWidth: vb.width,
    overlayHeight: vb.height,
    svgUnits: 'viewBox',
    dtSystemsUsed: Array.isArray(systemIds) ? systemIds : (systemId ? [systemId] : []),
    readingOrderAdjustedMeasures: readingOrder.adjustedMeasureIds,
    readingOrderAdjustedCount: readingOrder.adjustedCount,
    readingOrderGeometrySource: readingOrder.geometrySource,
    atLeftAnchored: true,
    currentPageRegionAlignment,
    phaseRegions: {
      finding: findingRegion,
      interventions: interventionsRegion
    },
    currentPageRegion
  }

  const doc = svgElement.ownerDocument
  let desc = svgElement.querySelector(`desc#${FLUID_SYSTEMS_DESC_ID}`)
  if (!desc) {
    desc = doc.createElementNS('http://www.w3.org/2000/svg', 'desc')
    desc.setAttribute('id', FLUID_SYSTEMS_DESC_ID)
    svgElement.insertBefore(desc, svgElement.firstChild)
  }
  desc.textContent = JSON.stringify(metadata)

  return svgElement
}

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

      const fluidSvg = generateFluidTranscription(dtSystemSvg, atSystemSvg, data.atDom, logger, generationOptions)

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
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
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
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
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
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
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
 * Uses Thulemeier library to render diplomatic transcripts with merged source information
 *
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance (not used for DT rendering)
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 */
/**
 * Render Diplomatic Transcript SVG
 * Renders both the full DT and individual system files
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
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
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
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
 * Render Fluid Systems SVG
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 */
export async function renderFluidSystemsSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, dtDate, fsSvgPath, fsSvgDate, dtSvgPath } = triple

  if (!shouldRender(recreate, [atDate, dtDate], fsSvgDate)) {
    logger.info('Skipping Fluid Systems for ' + fsSvgPath)
    return
  }

  logger.info('Rendering Fluid Systems for system pairs...')

  try {
    if (!fs.existsSync(dtSvgPath)) {
      logger.warn(`Missing DT SVG for fluid systems generation (${dtSvgPath})`)
      return
    }

    const dom = new JSDOM()
    const parser = new dom.window.DOMParser()
    const serializer = new dom.window.XMLSerializer()

    const dtSvg = parser.parseFromString(fs.readFileSync(dtSvgPath, 'utf8'), 'image/svg+xml')

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

    // Keep the canonical AT render as the geometry base to avoid side effects in clef handling.
    const atWithSbIndicators = addSbIndicators(null, data.atDom.cloneNode(true))
    const renderDom = prepareAtDomForRendering(atWithSbIndicators, data.dtDom, pageDimensions)
    const atSvgString = renderContinuousAt(renderDom, verovio, 'annotated', pageDimensions)
    const atSvg = parser.parseFromString(atSvgString, 'image/svg+xml')

    const fluidSvg = generateFluidTranscription(dtSvg, atSvg, data.atDom, logger, {
      stateModel: 'fluidSystems',
      choiceVerticalOffsets
    })
    anchorFluidSystemsToAtLeft(fluidSvg)
    const thulemeierVersion = await getThulemeierVersion()

    const systemIds = Array.from(data.dtDom.querySelectorAll('draft > system, draft > bw\\:system'))
      .map(system => system.getAttribute('xml:id'))
      .filter(Boolean)

    applyFluidSystemsOutputMetadata(fluidSvg, {
      triple,
      systemIds,
      atDom: data.atDom,
      dtDom: data.dtDom,
      dtSvgElement: dtSvg.documentElement || dtSvg,
      liquifierVersion: LIQUIFIER_VERSION,
      thulemeierVersion
    })

    const fluidSvgString = serializer.serializeToString(fluidSvg)
    await writeData(fluidSvgString, fsSvgPath)
    logger.info('Fluid Systems generation complete: 1 succeeded, 0 failed')
  } catch (err) {
    logger.error(`Error rendering fluid systems: ${err.message}`)
  }
}

/**
 * Render Fluid Transcript HTML
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
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
