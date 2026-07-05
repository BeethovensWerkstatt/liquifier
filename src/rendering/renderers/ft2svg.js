import { DOMParser, XMLSerializer, DOMImplementation } from 'xmldom-qsa'

// preliminaries
import { shouldRender } from '../../utils/rendering.js'
import { appendNewElement, closestElement } from '../../utils/dom.js'

// AT preparations
import { prepareEditedAtDom } from '../../preparation/editedAnnotatedTranscripts.js'
import { prepareAtForVerovio, addSystemLabelBlocks } from '../../preparation/annotatedTranscripts.js'
import { adjustAtStaffLines } from '../../preparation/fluidTranscripts.js'
import { renderContinuousAt } from '../verovioHandler.js'
import { resolveMatchedStaffLineContextForCurrentDt } from './fluidTranscriptsOld/staffLineContext.js'

// DT preparations
// import { buildCurrentDtSvgForFluidTranscripts } from '../dt2svg.js'
import { prepareDtForThulemeier } from '../../preparation/mei.js'
import { liquifyMusic } from '../../preparation/liquify.js'
import { renderDiplomaticTranscript } from '../thulemeierHandler.js'
/*
// FT preparation
import { generateFluidTranscription } from '../../../preparation/fluidTranscripts.js'
*/

// File handling
import { writeData } from '../../filehandlers/filehandler.js'

import { getRectFromFragment, getOuterBoundingRect } from '../../utils/trigonometry.js'
import { computeApproxBBox } from '../../utils/svgGeometry.js'
import { resolvePathFromDocumentReference, readTextFromDocumentReference } from '../../utils/utils.js'

import { constants } from '../../config.mjs'
// eslint-disable-next-line
import pkg from '../../../package.json' with { type: 'json' }
const appVersion = pkg.version

/**
 * Add a translate animation to one SVG element for the FT renderer's eight-step sequence.
 *
 * Zero-only translations are skipped so the output does not accumulate no-op
 * `animateTransform` nodes.
 *
 * @param {Element} node - SVG element that receives the animation.
 * @param {string[]} [values=[]] - Translate values in `x y` form for each phase.
 * @returns {void}
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

  const reverse = constants.ftRendererReverseAnimations ? values.slice(0, -1).reverse() : []
  anim.setAttribute('values', values.concat(reverse).join(';'))
  anim.setAttribute('repeatCount', constants.ftRendererAnimationRepeatCount)
  anim.setAttribute('dur', constants.ftRendererAnimationDuration)
}

/**
 * Add a generic SVG attribute animation for the FT renderer's eight-step sequence.
 *
 * @param {Element} node - SVG element that receives the animation.
 * @param {string} attribute - Animated SVG attribute name.
 * @param {string[]} [values=[]] - Phase values for the given attribute.
 * @returns {void}
 */
const addTransform = (node, attribute, values = []) => {
  const anim = appendNewElement(node, 'animate', 'http://www.w3.org/2000/svg')
  anim.setAttribute('attributeName', attribute)

  const reverse = constants.ftRendererReverseAnimations ? values.slice(0, -1).reverse() : []
  anim.setAttribute('values', values.concat(reverse).join(';'))
  anim.setAttribute('repeatCount', constants.ftRendererAnimationRepeatCount)
  anim.setAttribute('dur', constants.ftRendererAnimationDuration)
}

/**
 * Resolve the AT id for a rendered SVG node, falling back to the nearest annotated ancestor.
 *
 * @param {Element|null|undefined} element - Animated SVG element.
 * @param {string} fallbackId - Descriptor-level fallback id.
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
 * Apply one unmatched-material class while removing competing classification classes.
 *
 * @param {Element|null|undefined} element - Element to classify.
 * @param {string} className - Classification class to apply.
 * @returns {void}
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
 * Determine which unmatched-material class should be used for one animation descriptor.
 *
 * @param {Object} descriptor - Animation descriptor.
 * @param {Map<string, string>} unmatchedClassByAtId - AT id to unmatched class mapping.
 * @returns {string} Classification class name.
 */
function resolveUnmatchedClassForDescriptor (descriptor, unmatchedClassByAtId) {
  const atId = resolveAtIdForClassification(descriptor.element, descriptor.id)
  if (!atId) return 'supplied'
  return unmatchedClassByAtId.get(atId) || 'supplied'
}

/**
 * Normalize a file reference to its basename so `@corresp` matching stays stable.
 *
 * @param {string} [value=''] - Raw file reference.
 * @returns {string} Normalized basename.
 */
function normalizeFileBasename (value = '') {
  const normalized = String(value).trim().replace(/\\/g, '/')
  if (!normalized) return ''
  const parts = normalized.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * Split one `@corresp` token into file-part and target-id components.
 *
 * @param {string} [token=''] - Raw `@corresp` token.
 * @returns {{fileRef: string, targetId: string}|null} Parsed token or null.
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
 * Return whether one `@corresp` file reference should be treated as DT material.
 *
 * @param {string} [fileRef=''] - File part from a `@corresp` token.
 * @returns {boolean} Whether the reference points to a diplomatic transcript.
 */
function isDiplomaticCorrespReference (fileRef = '') {
  if (fileRef === '') return true
  return fileRef.includes('/diplomaticTranscripts/') || fileRef.endsWith('_dt.xml')
}

/**
 * Return whether one DT file reference belongs to the currently rendered DT file.
 *
 * @param {string} [fileRef=''] - File part from a `@corresp` token.
 * @param {string} [currentDtBasename=''] - Basename of the current DT file.
 * @returns {boolean} Whether the token belongs to the active DT context.
 */
function isCurrentDtReference (fileRef = '', currentDtBasename = '') {
  if (fileRef === '') return true
  if (!currentDtBasename) return true
  return normalizeFileBasename(fileRef) === currentDtBasename
}

/**
 * Build AT->DT correspondence mappings and unmatched-class hints for the current DT file.
 *
 * @param {Document} atMeiDom - Edited or plain AT MEI DOM.
 * @param {Object} options - Extraction options.
 * @param {string} options.currentDtReference - Current DT file path or basename.
 * @returns {{correspMappings: Map<string, string[]>, unmatchedClassByAtId: Map<string, string>}}
 */
function extractCorrespContext (atMeiDom, { currentDtReference = '' } = {}) {
  const correspMappings = new Map()
  const unmatchedClassByAtId = new Map()
  const currentDtBasename = normalizeFileBasename(currentDtReference)

  atMeiDom.querySelectorAll('[corresp]').forEach(element => {
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
 * Resolve one partial animation descriptor into the FT renderer's eight-step phase sequence.
 *
 * The first two steps are renderer-local asset phases:
 * 1. facsimile only
 * 2. facsimile + shapes
 *
 * The remaining six steps keep the established FT musical states unchanged.
 *
 * @param {Object} descriptor - Animation descriptor emitted by liquify modules.
 * @param {Map<string, string>} [unmatchedClassByAtId=new Map()] - AT id to unmatched class mapping.
 * @returns {void}
 */
const setAnimationForFtWithAssets = (descriptor, unmatchedClassByAtId = new Map()) => {
  const { element, id, localName, states } = descriptor

  const digitalFacsimile = states.digitalFacsimile || states.finding || null
  const writingZone = states.writingZone || digitalFacsimile || states.finding || null
  const finding = states.finding || null
  const normalization = states.normalization || finding
  const readingOrder = states.readingOrder || normalization
  const regulation = states.regulation || states.supplements || states.interventions || normalization
  const supplements = states.supplements || regulation
  const interventions = states.interventions || supplements

  const allStates = [digitalFacsimile, writingZone, finding, normalization, readingOrder, regulation, supplements, interventions]
  const hasNullStates = allStates.some(state => state === null)

  const validStates = allStates.filter(state => state !== null)

  if (validStates.length === 0) {
    console.warn(`[setAnimationForFtWithAssets] No valid states for element ${id} (${localName})`)
    return
  }

  const animationType = validStates[0].type

  if (hasNullStates && animationType !== 'opacity') {
    const introVisibilityStates = [null, null, finding, normalization, readingOrder, regulation, supplements, interventions]
    const opacityValues = introVisibilityStates.map(state => (state === null ? '0' : '1'))
    element.setAttribute('opacity', opacityValues[0])

    let unmatchedClass = null
    if (finding === null || normalization === null) {
      unmatchedClass = resolveUnmatchedClassForDescriptor(descriptor, unmatchedClassByAtId)
      applyClassificationClass(element, unmatchedClass)
      if (unmatchedClass === 'supplied') {
        opacityValues[5] = '0'
      }
      if (unmatchedClass === 'supplied') {
        element.setAttribute('fill', '#999999')
        element.setAttribute('stroke', '#999999')
      } else if (unmatchedClass === 'otherWz') {
        element.setAttribute('fill', '#555555')
        element.setAttribute('stroke', '#555555')
      }
    }

    addTransform(element, 'opacity', opacityValues)
  }

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
 * Parse one simple line path in `M x y L x y` form.
 *
 * @param {string} d - SVG path data.
 * @returns {{start: {x: number, y: number}, end: {x: number, y: number}}|null} Parsed endpoints.
 */
const parseLinePath = (d) => {
  const match = String(d || '').match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
  if (!match) return null

  return {
    start: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
    end: { x: parseFloat(match[3]), y: parseFloat(match[4]) }
  }
}

/**
 * Resolve one inline rotate transform with transform origin.
 *
 * @param {string} style - Inline style string.
 * @returns {{angle: number, origin: {x: number, y: number}}|null} Parsed rotation metadata.
 */
const parseRotationStyle = (style = '') => {
  const rotateMatch = String(style).match(/rotate\(\s*([\d.-]+)deg\s*\)/)
  const originMatch = String(style).match(/transform-origin:\s*([\d.-]+)px\s+([\d.-]+)px/)

  if (!rotateMatch || !originMatch) return null

  return {
    angle: parseFloat(rotateMatch[1]) || 0,
    origin: {
      x: parseFloat(originMatch[1]) || 0,
      y: parseFloat(originMatch[2]) || 0
    }
  }
}

/**
 * Rotate one point around the parsed DT transform origin.
 *
 * @param {{x: number, y: number}} point - DT point.
 * @param {{angle: number, origin: {x: number, y: number}}|null} rotation - Parsed rotation metadata.
 * @returns {{x: number, y: number}} Rotated point.
 */
const applyRotationToPoint = (point, rotation) => {
  if (!rotation || rotation.angle === 0) return point

  const radians = rotation.angle * Math.PI / 180
  const dx = point.x - rotation.origin.x
  const dy = point.y - rotation.origin.y

  return {
    x: rotation.origin.x + (dx * Math.cos(radians)) - (dy * Math.sin(radians)),
    y: rotation.origin.y + (dx * Math.sin(radians)) + (dy * Math.cos(radians))
  }
}

/**
 * Find the nearest ancestor carrying a rotate transform in its inline style.
 *
 * @param {Element|null|undefined} element - Starting element.
 * @returns {Element|null} Rotated ancestor or null.
 */
const getClosestRotatedAncestor = (element) => {
  let current = element?.parentNode || null

  while (current && current.nodeType === 1) {
    const style = current.getAttribute?.('style') || ''
    if (style.includes('rotate(')) return current
    current = current.parentNode
  }

  return null
}

/**
 * Convert one DT staff-line path into AT-local coordinates, including DT rastrum rotation.
 *
 * @param {string} atD - AT line path data.
 * @param {Element} dtPath - DT line path element.
 * @param {Function} getNewPos - DT-to-AT point converter.
 * @returns {string} DT line geometry expressed in AT-local coordinates.
 */
const convertStaffLineD = (atD, dtPath, getNewPos) => {
  const atLine = parseLinePath(atD)
  const dtLine = parseLinePath(dtPath?.getAttribute('d'))

  if (!atLine || !dtLine) return atD

  const rotatedAncestor = getClosestRotatedAncestor(dtPath)
  const rotation = parseRotationStyle(rotatedAncestor?.getAttribute?.('style') || '')
  const dtStart = applyRotationToPoint(dtLine.start, rotation)
  const dtEnd = applyRotationToPoint(dtLine.end, rotation)

  const newStart = getNewPos(atLine.start, dtStart)
  const newEnd = getNewPos(atLine.end, dtEnd)

  return `M${newStart.x} ${newStart.y} L${newEnd.x} ${newEnd.y}`
}

/**
 * Collect the x-range of one DT system's visible content, excluding rastrum lines.
 *
 * @param {Element} system - DT system group.
 * @returns {{min: number, max: number}|null} Content x-range or null.
 */
const getDtSystemContentXRange = (system) => {
  if (!system) return null

  let min = Infinity
  let max = -Infinity
  const directChildren = Array.from(system.childNodes || []).filter(child => child?.nodeType === 1)

  directChildren.forEach(child => {
    const classes = (child.getAttribute?.('class') || '').split(/\s+/)
    if (classes.includes('rastrum') || classes.includes('bounding-box')) return

    const bbox = computeApproxBBox(child)
    if (!bbox) return

    min = Math.min(min, bbox.x)
    max = Math.max(max, bbox.x + bbox.width)
  })

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { min, max }
}

/**
 * Clamp one simple DT staff-line path to a target x-range.
 *
 * @param {Element} line - DT rastrum path element.
 * @param {number} minX - New minimum x value.
 * @param {number} maxX - New maximum x value.
 * @returns {void}
 */
const trimDtStaffLinePath = (line, minX, maxX) => {
  const parsed = parseLinePath(line?.getAttribute('d'))
  if (!parsed) return

  const originalMinX = Math.min(parsed.start.x, parsed.end.x)
  const originalMaxX = Math.max(parsed.start.x, parsed.end.x)
  const clampedMinX = Math.max(originalMinX, minX)
  const clampedMaxX = Math.min(originalMaxX, maxX)

  if (!Number.isFinite(clampedMinX) || !Number.isFinite(clampedMaxX) || clampedMaxX <= clampedMinX) {
    return
  }

  line.setAttribute('d', `M${clampedMinX} ${parsed.start.y} L${clampedMaxX} ${parsed.end.y}`)
}

/**
 * Shorten DT rastrum lines per system using the system content width plus a side margin.
 *
 * @param {SVGElement} dtLayer - DT layer inside the FT SVG.
 * @param {number} sideMargin - Margin added to both sides of the detected content range.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance.
 * @returns {void}
 */
const trimDtStaffLinesToContent = (dtLayer, sideMargin, logger) => {
  const dtSystems = Array.from(dtLayer.querySelectorAll('g.system:not(.bounding-box)'))
  if (dtSystems.length === 0) return

  const rastrumLinesById = new Map()
  Array.from(dtLayer.querySelectorAll('g.rastrum[data-id]')).forEach(rastrum => {
    const rastrumId = rastrum.getAttribute('data-id')
    if (!rastrumId) return

    const lines = Array.from(rastrum.childNodes || []).filter(child => child?.nodeType === 1 && child.localName === 'path')
    rastrumLinesById.set(rastrumId, lines)
  })

  dtSystems.forEach(system => {
    const contentRange = getDtSystemContentXRange(system)
    if (!contentRange) return

    const minX = contentRange.min - sideMargin
    const maxX = contentRange.max + sideMargin
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) return

    const nestedLines = Array.from(system.querySelectorAll('.rastrum:not(.bounding-box) > path'))
    if (nestedLines.length > 0) {
      nestedLines.forEach(line => trimDtStaffLinePath(line, minX, maxX))
      return
    }

    const seenRastrumIds = new Set()
    Array.from(system.querySelectorAll('g.staff[data-rastrum]')).forEach(staff => {
      const rastrumRef = (staff.getAttribute('data-rastrum') || '').trim()
      const rastrumId = rastrumRef.split(/\s+/)[0]
      if (!rastrumId || seenRastrumIds.has(rastrumId)) return

      seenRastrumIds.add(rastrumId)
      const lines = rastrumLinesById.get(rastrumId) || []
      lines.forEach(line => trimDtStaffLinePath(line, minX, maxX))
    })
  })

  logger.debug?.('[trimDtStaffLinesToContent] Trimmed DT staff lines to per-system content ranges')
}

/**
 * Group FT staff lines by AT reading-order block.
 *
 * @param {SVGElement[]} staffLines - AT staff lines.
 * @returns {Map<number, SVGElement[]>} Staff lines grouped by block index.
 */
const groupFtStaffLinesByBlock = (staffLines) => {
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
 * Group DT staff lines by AT block using explicit DT system ids.
 *
 * @param {SVGElement} dtLayer - DT layer inside the FT SVG.
 * @param {Set<number>|null} matchedBlocks - AT blocks belonging to the current DT context.
 * @param {Map<number, string>|null} blockToDtSystemId - Explicit AT block -> DT system id mapping.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance.
 * @returns {Map<number, SVGElement[]>} DT staff lines grouped by AT block.
 */
const groupDtStaffLinesByMatchedBlocks = (dtLayer, matchedBlocks, blockToDtSystemId, logger) => {
  const byBlock = new Map()
  if (!(matchedBlocks instanceof Set) || matchedBlocks.size === 0) return byBlock
  if (!(blockToDtSystemId instanceof Map) || blockToDtSystemId.size === 0) {
    logger.warn('[animateFtStaffLines] Missing strict AT block -> DT system mapping; falling back to DT document order.')
    return byBlock
  }

  const sortedBlocks = Array.from(matchedBlocks).sort((a, b) => a - b)
  const dtSystems = Array.from(dtLayer.querySelectorAll('g.system:not(.bounding-box)'))
  const rastrumLinesById = new Map()
  const dtSystemById = new Map()

  dtSystems.forEach(system => {
    const systemId = system.getAttribute('data-id')
    if (!systemId) return
    dtSystemById.set(systemId, system)
  })

  Array.from(dtLayer.querySelectorAll('g.rastrum[data-id]')).forEach(rastrum => {
    const classes = (rastrum.getAttribute('class') || '').split(/\s+/)
    if (classes.includes('bounding-box')) return

    const rastrumId = rastrum.getAttribute('data-id')
    if (!rastrumId) return

    const lines = Array.from(rastrum.childNodes || []).filter(child => child?.nodeType === 1 && child.localName === 'path')
    rastrumLinesById.set(rastrumId, lines)
  })

  if (dtSystems.length > 0) {
    sortedBlocks.forEach(blockIndex => {
      const systemId = blockToDtSystemId.get(blockIndex)
      const system = systemId ? dtSystemById.get(systemId) : null
      if (!system) {
        logger.warn(`[animateFtStaffLines] Missing DT system '${systemId || 'unknown'}' for AT block ${blockIndex}.`)
        return
      }

      const nestedLines = Array.from(system.querySelectorAll('.rastrum:not(.bounding-box) > path'))
      if (nestedLines.length > 0) {
        byBlock.set(blockIndex, nestedLines)
        return
      }

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

  const dtLines = Array.from(dtLayer.querySelectorAll('.rastrum:not(.bounding-box) > path'))
  if (sortedBlocks.length === 1) {
    byBlock.set(sortedBlocks[0], dtLines)
  } else if (sortedBlocks.length > 1 && dtLines.length > 0) {
    logger.warn('[animateFtStaffLines] DT has no system groups; cannot distribute DT staff lines across multiple matched blocks reliably.')
  }

  return byBlock
}

/**
 * Animate AT staff lines from DT rastrum geometry.
 *
 * @param {SVGElement} atLayer - AT layer inside the FT SVG.
 * @param {SVGElement} dtLayer - DT layer inside the FT SVG.
 * @param {Object} tools - FT animation helpers.
 * @param {Function} tools.getNewPos - DT-to-AT point converter.
 * @param {Function} tools.setAnimation - Phase-aware animation setter.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} tools.logger - Logger instance.
 * @returns {void}
 */
const animateFtStaffLines = (atLayer, dtLayer, { getNewPos, setAnimation, logger }, matchedStaffLineContext = null) => {
  const ftStaffLines = Array.from(atLayer.querySelectorAll('path.rastrum'))
  const dtStaffLines = Array.from(dtLayer.querySelectorAll('.rastrum:not(.bounding-box) > path'))

  if (ftStaffLines.length === 0) {
    logger.warn('[animateFtStaffLines] Missing FT staff lines; skipping staff-line animation')
    return
  }

  if (dtStaffLines.length === 0) {
    logger.warn('[animateFtStaffLines] Missing DT staff lines; skipping staff-line animation')
    return
  }

  const matchedBlocks = matchedStaffLineContext?.matchedStaffLineBlocks || null
  const blockToDtSystemId = matchedStaffLineContext?.blockToDtSystemId || null
  const ftByBlock = groupFtStaffLinesByBlock(ftStaffLines)
  const dtByBlock = groupDtStaffLinesByMatchedBlocks(dtLayer, matchedBlocks, blockToDtSystemId, logger)
  const hasStrictBlockMapping = dtByBlock.size > 0 && ftByBlock.size > 0

  if (hasStrictBlockMapping) {
    Array.from(matchedBlocks).sort((a, b) => a - b).forEach(blockIndex => {
      const ftLines = ftByBlock.get(blockIndex) || []
      const dtLinesForBlock = dtByBlock.get(blockIndex) || []

      if (ftLines.length === 0 || dtLinesForBlock.length === 0) {
        logger.warn(`[animateFtStaffLines] Missing FT or DT staff lines for block ${blockIndex}; skipping this block.`)
        return
      }

      const sharedCount = Math.min(ftLines.length, dtLinesForBlock.length)
      for (let index = 0; index < sharedCount; index++) {
        const ftLine = ftLines[index]
        const dtLine = dtLinesForBlock[index]
        const atD = ftLine.getAttribute('d')
        const dtAsAtD = convertStaffLineD(atD, dtLine, getNewPos)

        setAnimation({
          element: ftLine,
          id: `staff-line-block-${blockIndex}-${index}`,
          localName: 'staff-line',
          states: {
            digitalFacsimile: { type: 'd', val: dtAsAtD },
            writingZone: { type: 'd', val: dtAsAtD },
            finding: { type: 'd', val: dtAsAtD },
            normalization: { type: 'd', val: dtAsAtD },
            readingOrder: { type: 'd', val: dtAsAtD },
            regulation: { type: 'd', val: atD },
            supplements: { type: 'd', val: atD },
            interventions: { type: 'd', val: atD }
          }
        })
      }
    })

    return
  }

  const targetCount = Math.max(ftStaffLines.length, dtStaffLines.length)
  const expandedFtLines = Array.from({ length: targetCount }).map((_, index) => {
    const baseLine = ftStaffLines[index % ftStaffLines.length]
    if (index < ftStaffLines.length) return baseLine

    const clone = baseLine.cloneNode(true)
    clone.setAttribute('data-bw-staff-clone', String(index))
    baseLine.parentNode.appendChild(clone)
    return clone
  })

  expandedFtLines.forEach((ftLine, index) => {
    const dtLine = dtStaffLines[index % dtStaffLines.length]
    if (!dtLine) return

    const atD = ftLine.getAttribute('d')
    const dtAsAtD = convertStaffLineD(atD, dtLine, getNewPos)

    setAnimation({
      element: ftLine,
      id: `staff-line-${index}`,
      localName: 'staff-line',
      states: {
        digitalFacsimile: { type: 'd', val: dtAsAtD },
        writingZone: { type: 'd', val: dtAsAtD },
        finding: { type: 'd', val: dtAsAtD },
        normalization: { type: 'd', val: dtAsAtD },
        readingOrder: { type: 'd', val: dtAsAtD },
        regulation: { type: 'd', val: atD },
        supplements: { type: 'd', val: atD },
        interventions: { type: 'd', val: atD }
      }
    })
  })
}

/**
 * Build the liquify helper bundle for the FT renderer's single-DOM setup.
 *
 * This adapter keeps `liquifyMusic()` unchanged by exposing the same helper
 * surface it already expects, while translating DT coordinates into the local
 * coordinate space of the transformed AT layer.
 *
 * @param {Object} params - Helper construction parameters.
 * @param {SVGElement} params.ftSvgDom - Root FT SVG element.
 * @param {SVGElement} params.atLayer - AT layer inside the FT SVG.
 * @param {SVGElement} params.dtLayer - DT layer inside the FT SVG.
 * @param {Document} params.atMeiDom - AT MEI DOM aligned with the rendered AT layer.
 * @param {string} params.currentDtReference - Current DT file path or basename.
 * @param {number} params.atScaling - Applied AT scale inside the FT SVG.
 * @param {number} params.atHorizontalPosition - Applied AT x translation inside the FT SVG.
 * @param {number} params.atVerticalShift - Applied AT y translation inside the FT SVG.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} params.logger - Logger instance.
 * @returns {{
 *   getNewPos: Function,
 *   convertD: Function,
 *   scaleFactor: number,
 *   correspMappings: Map<string, string[]>,
 *   stateModel: string,
 *   getChoiceVerticalOffset: Function,
 *   applyUnmatchedClass: Function,
 *   setAnimation: Function,
 *   logger: Object
 * }} Liquify helper bundle for the current FT render.
 */
const prepareAssets = ({
  ftSvgDom,
  atLayer,
  dtLayer,
  atMeiDom,
  currentDtReference,
  atScaling,
  atHorizontalPosition,
  atVerticalShift,
  logger
}) => {
  const { correspMappings, unmatchedClassByAtId } = extractCorrespContext(atMeiDom, {
    currentDtReference
  })

  /**
   * Read the AT content offset introduced by the inner `.page-margin` wrapper.
   *
   * Liquify modules work in the local coordinate space inside that wrapper, so
   * DT root coordinates must be converted through both AT transforms.
   *
   * @returns {{x: number, y: number}} Inner AT translation in AT-local units.
   */
  const getAtContentOffset = () => {
    const pageMargin = atLayer.querySelector('.page-margin')
    const transform = pageMargin?.getAttribute('transform') || ''
    const match = transform.match(/translate\(\s*([\d.-]+)(?:\s*,\s*|\s+)([\d.-]+)\s*\)/)

    if (!match) {
      return { x: 0, y: 0 }
    }

    return {
      x: parseFloat(match[1]) || 0,
      y: parseFloat(match[2]) || 0
    }
  }

  const atContentOffset = getAtContentOffset()

  /**
   * Apply one eight-phase opacity track to a non-musical FT layer.
   *
   * @param {Element|null} element - Layer root.
   * @param {string[]} values - One opacity value per FT phase.
   * @returns {void}
   */
  const setLayerOpacity = (element, values) => {
    if (!element) return
    element.setAttribute('opacity', values[0])
    addTransform(element, 'opacity', values)
  }

  // The renderer-owned layers establish the two asset phases before musical animation starts.
  setLayerOpacity(ftSvgDom.querySelector('.facsimileBg'), ['1', '1', '0.5', '0', '0', '0', '0', '0'])
  setLayerOpacity(ftSvgDom.querySelector('.shapes'), ['0', '1', '0', '0', '0', '0', '0', '0'])
  setLayerOpacity(dtLayer, ['0', '0', '1', '1', '1', '1', '1', '1'])
  setLayerOpacity(atLayer, ['0', '0', '1', '1', '1', '1', '1', '1'])

  /**
   * Convert one DT point in FT root coordinates into the local coordinates of the transformed AT layer.
   *
   * @param {{x: number, y: number}} [at={ x: 0, y: 0 }] - AT-local fallback point.
   * @param {{x: number, y: number}} [dt={ x: 0, y: 0 }] - DT point in FT root coordinates.
   * @returns {{x: number, y: number}} DT point converted into AT-local coordinates.
   */
  const getNewPos = (at = { x: 0, y: 0 }, dt = { x: 0, y: 0 }) => {
    // Invert the outer AT transform and the inner page-margin translate so the
    // result lands in the same local space as the AT notehead/stem coordinates.
    const newPos = {
      x: Math.round(((dt.x - atHorizontalPosition) / atScaling) - atContentOffset.x),
      y: Math.round(((dt.y - atVerticalShift) / atScaling) - atContentOffset.y)
    }

    logger.debug(`[Position Diff] AT: (${at.x}, ${at.y}), DT: (${dt.x}, ${dt.y}) => newPos: (${newPos.x}, ${newPos.y})`)
    return newPos
  }

  /**
   * Convert one DT path into AT-local coordinates while preserving AT path command structure.
   *
   * @param {string} atD - AT path data used as the structural template.
   * @param {string} dtD - DT path data used as the coordinate source.
   * @returns {string} DT geometry expressed in AT-local coordinates.
   */
  const convertD = (atD, dtD) => {
    const atCoords = []
    const dtCoords = []
    const coordRegex = /([-\d.]+)[,\s]+([-\d.]+)/g

    let match
    while ((match = coordRegex.exec(atD)) !== null) {
      atCoords.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) })
    }

    coordRegex.lastIndex = 0
    while ((match = coordRegex.exec(dtD)) !== null) {
      dtCoords.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) })
    }

    const newCoords = atCoords.map((atPos, index) => {
      const dtPos = dtCoords[index] || atPos
      return getNewPos(atPos, dtPos)
    })

    let coordIndex = 0
    return atD.replace(coordRegex, () => {
      const coord = newCoords[coordIndex++]
      return `${coord.x} ${coord.y}`
    })
  }

  /**
   * Apply the unmatched-material class associated with one AT id.
   *
   * @param {Element} element - Element to classify.
   * @param {string} atId - AT id used for lookup.
   * @returns {string} Applied class name.
   */
  const applyUnmatchedClass = (element, atId) => {
    const className = unmatchedClassByAtId.get(atId) || 'supplied'
    applyClassificationClass(element, className)
    return className
  }

  return {
    getNewPos,
    convertD,
    scaleFactor: atScaling !== 0 ? (1 / atScaling) : 1,
    correspMappings,
    stateModel: 'fluidTranscripts',
    getChoiceVerticalOffset: () => 0,
    applyUnmatchedClass,
    setAnimation: descriptor => setAnimationForFtWithAssets(descriptor, unmatchedClassByAtId),
    logger
  }
}

/**
 * Render Fluid Transcript SVG.
 * @param {*} params - Rendering parameters.
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom, reconstructionDom).
 * @param {Object} params.triple - File paths and dates.
 * @param {Object} params.verovio - Verovio toolkit instance.
 * @param {Object} params.pageDimensions - Page dimensions for rendering.
 * @param {boolean} params.recreate - Force recreation flag.
 * @param {Object} params.logger - Logger instance.
 * @returns {Promise<*>} Promise resolving when rendering completes.
 */
export async function renderFluidTranscriptsSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  if (shouldRender(recreate, [triple.dtDate], triple.dtSvgDate)) {
    logger.info('Rendering Fluid Transcripts for ' + triple.fsSvgPath)

    try {
      const layoutInfo = extractLayoutInfo(data, pageDimensions, logger, triple.sourceFullPath)
      const currentPage = layoutInfo.pages.find(page => page.current)

      // get first draft of FT, which holds Facsimile and Shapes, and will get transcriptions inserted
      const ftSvgDom = initializeFtSvg(layoutInfo, data.dtDom)
      
      // handle diplomatic transcription
      const dtSvgDom = await prepareDtForFt(data.dtDom, data.sourceDom, data, layoutInfo, logger, triple.sourceFullPath)
      // result is also available as data.dtSvgDom = dtSvgDom
      
      // copy DT content into FT SVG
      Array.from(dtSvgDom.documentElement.childNodes).forEach(child => {
        ftSvgDom.querySelector('.diplomatic').appendChild(child)
      })

      const dtStaffLineSideMargin = constants.ftRendererDtStaffLineSideMarginMm * currentPage.vrvMeiUnit * constants.verovioGeneralScaling
      trimDtStaffLinesToContent(ftSvgDom.querySelector('.diplomatic'), dtStaffLineSideMargin, logger)

      // This adds the page rotation to individual rastrums, which _should_ be wrong, but seemed necessary at some point?!
      /* ftSvgDom.querySelectorAll('.diplomatic .rastrum[style*="transform: rotate("]').forEach(element => {
        const baseDeg = currentPage.fragment?.rotate?.deg || 0
        const style = element.getAttribute('style') || ''
        const rotateMatch = style.match(/transform:\s*rotate\((-?[\d.]+)deg\)/)

        if (!rotateMatch) {
          return
        }

        const rotateAngle = baseDeg + parseFloat(rotateMatch[1])
        element.setAttribute('style', style.replace(rotateMatch[0], 'transform: rotate(' + rotateAngle + 'deg)'))
      })
      ftSvgDom.querySelector('.diplomatic').removeAttribute('transform') */

      // handle annotated transcription
      const atSvgDom = await prepareAtForFt(data.atDom, data.dtDom, data, verovio, pageDimensions, layoutInfo, logger, triple)
      // result is also available as data.atSvgDom = atSvgDom
      // data.editedAtDom is also available for later use in FT processing

      const transcriptionGroup = ftSvgDom.querySelector('.transcription')
      transcriptionGroup.appendChild(atSvgDom.documentElement.querySelector('desc'))
      transcriptionGroup.appendChild(atSvgDom.documentElement.querySelector('defs'))
      transcriptionGroup.appendChild(atSvgDom.documentElement.querySelector('.page-margin'))

      const getAtStaffLinePaths = () => {
        const normalizedPaths = ftSvgDom.querySelectorAll('.transcription path.rastrum')
        if (normalizedPaths.length > 0) return normalizedPaths
        return ftSvgDom.querySelectorAll('.transcription .staff > path')
      }

      // determines conversion factor between DT and AT based on rastrum heights
      const getAtScaling = () => {
        const dtRastrumPaths = ftSvgDom.querySelector('.diplomatic .rastrum').querySelectorAll('path')
        const dtRastrumHeight = parseFloat(dtRastrumPaths[4].getAttribute('d').split(' ')[1]) - parseFloat(dtRastrumPaths[0].getAttribute('d').split(' ')[1])
        const atRastrumPaths = getAtStaffLinePaths()
        const atRastrumHeight = parseFloat(atRastrumPaths[4].getAttribute('d').split(' ')[1]) - parseFloat(atRastrumPaths[0].getAttribute('d').split(' ')[1])
        return dtRastrumHeight / atRastrumHeight * currentPage.vrvMeiUnit / constants.verovioPixelPerVu
      }
      const atScaling = getAtScaling()

      // determine vertical position of AT
      const getAtVerticalShift = () => {
        const dtAllRastrumPaths = ftSvgDom.querySelectorAll('.diplomatic .rastrum > path')
        const dtTopRastrumY = parseFloat(dtAllRastrumPaths[0].getAttribute('d').split(' ')[1])
        const dtBottomRastrumY = parseFloat(dtAllRastrumPaths[dtAllRastrumPaths.length - 1].getAttribute('d').split(' ')[1])

        const dtBbox = computeApproxBBox(ftSvgDom.querySelector('.diplomatic .draft'))

        const atAllRastrumPaths = getAtStaffLinePaths()
        const atTopRastrumY = parseFloat(atAllRastrumPaths[0].getAttribute('d').split(' ')[1])
        const atBottomRastrumY = parseFloat(atAllRastrumPaths[atAllRastrumPaths.length - 1].getAttribute('d').split(' ')[1])

        const dtCenterY = dtBbox.y + dtBbox.height / 2
        const atCenterY = (atTopRastrumY + atBottomRastrumY) / 2

        return (dtCenterY - atCenterY) * layoutInfo.pages.find(page => page.current).vrvMeiUnit / constants.verovioPixelPerVu
      }
      const atVerticalShift = getAtVerticalShift()

      // determine horizontal position of AT
      const getAtHorizontalPosition = () => {
        const atWidth = parseFloat(atSvgDom.documentElement.getAttribute('width'))
        const dtXCoordinates = retrieveHorizontalPositionFromDt(data.dtDom, layoutInfo)

        let atX = 0
        if ((atWidth + dtXCoordinates.minX) < pageDimensions.width) {
          atX = dtXCoordinates.minX
        } else if (atWidth < pageDimensions.width) {
          atX = pageDimensions.width - atWidth
        } if (atWidth > pageDimensions.width) {
          // adjust width of FT document to fit the AT in
          atX = 0
          const vrvUnit = currentPage.vrvMeiUnit
          ftSvgDom.setAttribute('width', (atWidth * constants.ftStaticScaling) + 'mm')
          const oldViewBox = ftSvgDom.getAttribute('viewBox').split(' ')
          const viewBoxWidth = Math.round(atWidth * constants.verovioGeneralScaling * vrvUnit)
          ftSvgDom.setAttribute('viewBox', oldViewBox[0] + ' ' + oldViewBox[1] + ' ' + viewBoxWidth + ' ' + oldViewBox[3])

          // decide if other components (DT, facsimile, shapes) need to be repositioned horizontally
          const wzBegin = ftSvgDom.querySelector('g.pb[data-corresp$="#' + currentPage.id + '"] + g.writingZone > rect.pageLabelBox')
          const wzBeginX = wzBegin ? parseFloat(wzBegin.getAttribute('x')) : 0
          
          const dtScaling = 1 // parseFloat(ftSvgDom.querySelector('.diplomatic').getAttribute('transform').match(/scale\((.*)\)/)[1])
          
          if (wzBeginX > 0) {
            ftSvgDom.querySelectorAll('.facsimileBg, .shapes').forEach(layer => {
              layer.setAttribute('transform', 'translate(' + wzBeginX * atScaling + ',0)')
            })
            ftSvgDom.querySelector('.diplomatic').setAttribute('transform', 'scale(' + dtScaling + ') translate(' + (wzBeginX / dtScaling * atScaling) + ',0)')
          }

        }
        atX = atX * currentPage.vrvMeiUnit * constants.verovioGeneralScaling

        return atX
      }
      const atHorizontalPosition = getAtHorizontalPosition()
      
      // apply positioning to AT
      transcriptionGroup.setAttribute('transform', 'translate(' + atHorizontalPosition + ',' + atVerticalShift + ') scale(' + atScaling + ')')

      const tools = prepareAssets({
        ftSvgDom,
        atLayer: transcriptionGroup,
        dtLayer: ftSvgDom.querySelector('.diplomatic'),
        atMeiDom: data.editedAtDom || data.atDom,
        currentDtReference: triple.dtFullPath || triple.dt || '',
        atScaling,
        atHorizontalPosition,
        atVerticalShift,
        logger
      })

      const matchedStaffLineContext = resolveMatchedStaffLineContextForCurrentDt(data.atDom, data.dtDom, logger)

      animateFtStaffLines(transcriptionGroup, ftSvgDom.querySelector('.diplomatic'), tools, matchedStaffLineContext)
      liquifyMusic(transcriptionGroup, ftSvgDom.querySelector('.diplomatic'), data.editedAtDom || data.atDom, tools)
      
      // hide unmodified DT, as it is now included in FT transformation
      ftSvgDom.querySelector('.diplomatic').setAttribute('style', 'display: none;')

      // remove bboxes
      ftSvgDom.querySelectorAll('.rastrum.bounding-box').forEach(bbox => bbox.parentNode.removeChild(bbox))

      // hide system and page labels
      ftSvgDom.querySelectorAll('.pageLabelBox, .sysPreview, .pageBg, .pageLabel, .sysLabel').forEach((elem, i) => {
        addTransform(elem, 'opacity', ['0', '0', '0', '0', '0', '0', '1', '1'])
      })

      const ftSvgString = new XMLSerializer().serializeToString(ftSvgDom)
      await writeData(ftSvgString, triple.fsSvgPath)
      logger.info('Successfully rendered ' + triple.fsSvgPath)
    } catch (error) {
      logger.error('Error rendering Fluid transcript: ' + error.message)
      logger.debug('Source file: ' + triple.sourceFullPath)
      throw error
    }
  }
}

/**
 * Renders a diplomatic transcript SVG using the Thulemeier renderer.
 * @param {Document} dtDom – DOM document of the diplomatic transcript.
 * @param {Document} sourceDom – DOM document of the source file, used for context in preparation.
 * @param {Object} data - Object containing source data, including atDom, dtDom, sourceDom, and reconstructionDom. Used to insert the resulting SVG
 * @param {Object} logger - Logger instance for logging messages and errors.
 * @param {string} path - File path for logging purposes.
 * @returns {Promise<Document>} Promise resolving to the prepared diplomatic transcript SVG DOM.
 */
const prepareDtForFt = async (dtDom, sourceDom, data, layoutInfo, logger, path) => {
  const parser = new DOMParser()

  try {
    const preparedDt = prepareDtForThulemeier({ dtDom, sourceDom })

    if (!preparedDt) {
      logger.warn('Could not prepare diplomatic transcript - skipping ' + path)
      return
    }

    const vrvUnit = layoutInfo.pages.find(page => page.current).vrvMeiUnit
    const baseScaling = constants.verovioGeneralScaling * vrvUnit
    const extraOptions = { baseScaling, mode: 'singleDraftStandalone' }

    const dtSvgString = await renderDiplomaticTranscript(preparedDt, extraOptions)
    const dtSvgDom = parser.parseFromString(dtSvgString, 'image/svg+xml')

    data.dtSvgDom = dtSvgDom
    return dtSvgDom
  } catch (error) {
    logger.error('Error rendering diplomatic transcript: ' + error.message + '. ' + error.stack)
    logger.debug('Source file: ' + path)
    throw error
  }
}

/**
 * Retrieves the horizontal position of the content in the DT by analyzing the x and x2 attributes of elements in relation to their staff and rastrum positions.
 * @param {Document} dtDom - The DOM document of the diplomatic transcript, used to analyze the positions of elements.
 * @param {Object} layoutInfo - The layout information extracted from the source document, including rastrum positions and page dimensions, used to calculate the horizontal position.
 * @return {Object} An object containing the minimum x position (minX), maximum x position (maxX), and the width of the content (width) in the DT, calculated based on the positions of elements in relation to their staff and rastrum positions.
 * This function iterates through all staff elements in the DT, retrieves their corresponding rastrum positions from the layout information, and analyzes the x and x2 attributes of elements within each staff to determine the overall horizontal position of the content in the DT. The resulting minX, maxX, and width values can be used for positioning the AT content in relation to the DT content in the FT SVG.
 */ 
const retrieveHorizontalPositionFromDt = (dtDom, layoutInfo) => {
  let minX = Infinity
  let maxX = -Infinity

  dtDom.querySelectorAll('staff').forEach(staff => {
    const staffN = staff.getAttribute('n')
    const staffDef = closestElement(staff, '*|system').querySelector('staffDef[n="' + staffN + '"]')
    const rastrumId = staffDef.getAttribute('decls').split('#')[1]
    const rastrum = layoutInfo.pages.find(page => page.current).rastrums.find(r => r.id === rastrumId)

    const rastrumX = rastrum.x
    closestElement(staff, 'section').querySelectorAll('staff[n="' + staffN + '"] *[x], *[staff="' + staffN + '"]').forEach(elem => {
      if (elem.hasAttribute('x')) {
        const x = parseFloat(elem.getAttribute('x')) + rastrumX
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
      if (elem.hasAttribute('x2')) {
        const x2 = parseFloat(elem.getAttribute('x2')) + rastrumX
        if (x2 < minX) minX = x2
        if (x2 > maxX) maxX = x2
      }
    })
  })
  const width = maxX - minX
  return { minX, maxX, width }
}

/**
 * Renders an annotated transcript SVG using Verovio, including all necessary preparations and adjustments
 * @param {Document} atDom - DOM document of the annotated transcript.
 * @param {Document} dtDom - DOM document of the diplomatic transcript, used for context in preparation.
 * @param {Object} data - Object containing source data, including atDom, dtDom, sourceDom, and reconstructionDom. Used to insert the resulting SVG.
 * @param {Object} verovio - Verovio toolkit instance.
 * @param {{width?: number, height?: number}} pageDimensions - Rendering page dimensions.
 * @param {Object} layoutInfo - Layout information for rendering.
 * @param {Object} logger - Logger instance for logging messages and errors.
 * @param {string} path - File path for logging purposes.
 * @return {Promise<Document>} Promise resolving to the prepared annotated transcript SVG DOM.
 */
const prepareAtForFt = async (atDom, dtDom, data, verovio, pageDimensions, layoutInfo, logger, triple) => {
  try {
    const editedAtDom = prepareEditedAtDom(atDom, dtDom)
    // formerly known as addSbIndicators(atDom)
    editedAtDom.querySelectorAll('annot[class="#bw_writingZoneBegin]').forEach((annot) => {
      annot.setAttribute('type', 'writingZoneBegin')
    })

    // Verovio expects dots as attributes, so we need to convert, also no <supplied> in <scoreDef>
    prepareAtForVerovio(editedAtDom)

    const vrvOptions = {
      breaks: 'none',
      mmOutput: true,
      unit: layoutInfo.pages.find(page => page.current).vrvMeiUnit,
      scale: 100,
      svgBoundingBoxes: false
    }

    const atSvgString = renderContinuousAt(editedAtDom, verovio, 'fluid', pageDimensions, vrvOptions)
    const parser = new DOMParser()
    const atSvgDom = parser.parseFromString(atSvgString, 'image/svg+xml')

    const mod = addSystemLabelBlocks(atSvgDom, editedAtDom, data.dtDom, data.sourceDom, data.reconstructionDom, triple)
    adjustAtStaffLines(mod, editedAtDom)
    
    data.atSvgDom = mod // store the rendered AT SVG DOM for later use in FT processing
    data.editedAtDom = editedAtDom // store the edited AT DOM for later use in FT processing
    return mod
    //
  } catch (error) {
    logger.error('Error preparing annotated transcript for Fluid Transcripts: ' + error.message)
    logger.debug('Source file: ' + triple.sourceFullPath)
    throw error
  }
}

/**
 * A generic helper function that will compile all relevant information
 * @param {Object} data – The object holding all relevant files.
 * @param {Object} pageDimensions – The dimensions of the page for layout reference.
 * @param {*} logger – Logger instance for logging messages and errors.
 * @returns {Object} An object containing all extracted layout information necessary for FT synthesis and overlay injection.
 */
const extractLayoutInfo = (data, pageDimensions, logger, sourceFullPath) => {
  const layoutInfo = {}
  try {
    const currentPageId = data.dtDom.querySelector('pb').getAttribute('target').split('#')[1]
    const allPageIds = []
    data.atDom.querySelectorAll('pb').forEach(pb => {
      allPageIds.push(pb.getAttribute('corresp').split('#')[1])
    })
    const pages = allPageIds.map(pageId => {
      const pageInfo = {
        id: pageId,
        current: false
      }
      if (pageId === currentPageId) {
        pageInfo.current = true
        pageInfo.position = pageDimensions.position // 'outer.recto' etc.
        pageInfo.mm = {
          width: pageDimensions.width,
          height: pageDimensions.height
        }
        const surface = data.sourceDom.querySelector('surface[xml\\:id="' + pageId + '"]')
        const graphic = surface.querySelector('graphic[type = "facsimile"]')
        pageInfo.px = {
          width: parseFloat(graphic.getAttribute('width')),
          height: parseFloat(graphic.getAttribute('height'))
        }
        const iiif = graphic.getAttribute('target')
        pageInfo.iiif = iiif

        const shapes = surface.querySelector('graphic[type = "shapes"]')
        pageInfo.shapes = shapes?.getAttribute('target') || ''
        pageInfo.shapesPath = resolvePathFromDocumentReference(pageInfo.shapes, sourceFullPath)
        pageInfo.shapesContent = readTextFromDocumentReference(pageInfo.shapes, sourceFullPath)

        const fragment = getRectFromFragment(iiif)
        const outerRectMm = getOuterBoundingRect(0, 0, pageInfo.mm.width, pageInfo.mm.height, fragment.rotate.deg)
        const ratio = fragment.outer.w / outerRectMm.w

        // console.log(334, 'ratio', ratio)
        // console.log(334.1, 'fragment', fragment)
        // console.log(334.2, 'outerRectMm', outerRectMm)
        // console.log(334.3, 'pageInfo', pageInfo)
        // console.log(334.4, 'pageDimensions', pageDimensions)
      
        pageInfo.utils = {}
        pageInfo.utils.mmToPx = (mm) => mm * ratio
        pageInfo.utils.pxToMm = (px) => px / ratio
        pageInfo.mm2PxRatio = ratio
        pageInfo.fragment = fragment

        pageInfo.px.iiifPlacement = {
          x: fragment.outer.ul.x * -1,
          y: fragment.outer.ul.y * -1,
          w: fragment.outer.w,
          h: fragment.outer.h
        }

        const layout = data.sourceDom.querySelector('layout[xml\\:id="' + surface.getAttribute('decls').split('#')[1] + '"]')
        const rastrums = layout.querySelectorAll('rastrum')
        pageInfo.rastrums = []
        rastrums.forEach(rastrum => {
          const rastrumInfo = {
            id: rastrum.getAttribute('xml:id'),
            systems: parseInt(rastrum.getAttribute('systems')),
            h: parseFloat(rastrum.getAttribute('system.height')),
            w: parseFloat(rastrum.getAttribute('width')),
            x: parseFloat(rastrum.getAttribute('system.leftmar')),
            y: parseFloat(rastrum.getAttribute('system.topmar')),
            rotate: parseFloat(rastrum.getAttribute('rotate')) || 0
          }
          pageInfo.rastrums.push(rastrumInfo)
        })

        pageInfo.avgRastrumMmHeight = pageInfo.rastrums.reduce((sum, r) => sum + r.h, 0) / pageInfo.rastrums.length
        pageInfo.vrvMeiUnit = pageInfo.avgRastrumMmHeight * 1.25
      }
      return pageInfo
    })
    layoutInfo.pages = pages
  } catch (error) {
    logger.error('Error extracting layout information for Fluid Transcripts: ' + error.message + '. ' + error.stack)
  }
  
  return layoutInfo
}

/**
 * Creates the SVG file for the Fluid Transcripts, populates it with the facsimile and shapes layers, and inserts the placeholders for diplomatic and annotated transcripts
 * @param {Object} layoutInfo - The layout information extracted from the source document, including rastrum positions and page dimensions, used to calculate the horizontal position.
 * @param {Document} dtDom - DOM document of the diplomatic transcript, used for context in preparation.
 * @returns {Document} The initialized SVG DOM for the Fluid Transcripts, containing the facsimile and shapes layers, and placeholders for diplomatic and annotated transcripts.
 * This function creates a new SVG document, sets its dimensions and viewBox based on the layout information, and populates it with a facsimile layer (using the IIIF image) and a shapes layer (if available). It also includes placeholder groups for the diplomatic and annotated transcripts, which will be populated later in the rendering process. The resulting SVG DOM serves as the base for synthesizing the final Fluid Transcript SVG with all content layers properly positioned and scaled.
 */
const initializeFtSvg = (layoutInfo, dtDom) => {
  const vrvPixelPerVu = constants.verovioPixelPerVu
  const vrvGeneralScaling = constants.verovioGeneralScaling

  const document = new DOMImplementation().createDocument('http://www.w3.org/2000/svg', 'svg')
  const svg = document.documentElement
  const currentPage = layoutInfo.pages.find(page => page.current)

  const vrvUnit = currentPage.vrvMeiUnit
  svg.setAttribute('width', (+currentPage.mm.width * constants.ftStaticScaling) + 'mm')
  svg.setAttribute('height', (+currentPage.mm.height * constants.ftStaticScaling) + 'mm')

  const viewBoxWidth = Math.round(currentPage.mm.width * vrvGeneralScaling * vrvUnit)
  const viewBoxHeight = Math.round(currentPage.mm.height * vrvGeneralScaling * vrvUnit)
  
  svg.setAttribute('viewBox', '0 0 ' + viewBoxWidth + ' ' + viewBoxHeight)
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('version', '1.1')
  svg.setAttribute('overflow', 'visible')

  // Add metadata
  const desc = document.createElementNS('http://www.w3.org/2000/svg', 'desc')
  desc.textContent = 'Fluid Transcription SVG generated by Liquifier version ' + appVersion + ' on ' + new Date().toISOString()
  svg.appendChild(desc)

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')

  // Add default CSS styles
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.setAttribute('type', 'text/css')

  // Default CSS rules
  const defaultCSS = `
    .rastrum {
      fill: none;
    }

    .deletionBack {
      fill: #00000033;
    }

    .deletionLine {
      stroke: #000000;
    }

    path {
      stroke: #000;
    }

    .supplied * {
      stroke: #666666;
      fill: #666666;
    }
  `
  style.textContent = defaultCSS
  defs.appendChild(style)

  svg.appendChild(defs)

  // Start building content structure
  const contentGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  contentGroup.setAttribute('class', 'content')

  // TODO: it is a bit odd to use vrvPixelPerVu here, this needs to be clarified. However, it gives the most reasonable positions for the time being. 
  const pageX = currentPage.utils.pxToMm(currentPage.px.iiifPlacement.x) * vrvGeneralScaling * vrvPixelPerVu
  const pageY = currentPage.utils.pxToMm(currentPage.px.iiifPlacement.y) * vrvGeneralScaling * vrvPixelPerVu
  const pageW = currentPage.utils.pxToMm(currentPage.px.width) * vrvGeneralScaling * vrvUnit
  const pageH = currentPage.utils.pxToMm(currentPage.px.height) * vrvGeneralScaling * vrvUnit

  // Add Page Facsimile
  const facsimileGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  facsimileGroup.setAttribute('class', 'facsimileBg')
  contentGroup.appendChild(facsimileGroup)

  const image = document.createElementNS('http://www.w3.org/2000/svg', 'image')
  image.setAttribute('class', 'facsimileImage')
  image.setAttribute('x', String(pageX))
  image.setAttribute('y', String(pageY))
  image.setAttribute('width', String(pageW))
  image.setAttribute('height', String(pageH))
  image.setAttribute('href', currentPage.iiif.split('#')[0] + '/full/full/0/default.jpg')
  
  // temporary fix for speeding up development
  if (currentPage.iiif.includes('_Mh_60_05.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK01.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_06.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK02.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_07.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK03.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_08.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK04.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_09.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK05.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_10.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK06.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_11.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK07.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_12.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK08.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_13.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK11.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_14.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK12.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_15.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK13.jpg')
  } else if (currentPage.iiif.includes('_Mh_60_16.jpg#')) {
    image.setAttribute('href', 'http://localhost:8080/NK14.jpg')
  }

  image.setAttribute('preserveAspectRatio', 'none')
  image.setAttribute('opacity', '1')
  
  facsimileGroup.appendChild(image)

  // Debug: Add dot raster
  const addDebugDots = () => {
    const rasterGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    rasterGroup.setAttribute('class', 'raster')
    contentGroup.appendChild(rasterGroup)

    for (let x = 0; x <= 30; x += 1) {
      for (let y = 0; y <= 23; y += 1) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        dot.setAttribute('cx', x * 10 * vrvGeneralScaling * vrvUnit)
        dot.setAttribute('cy', y * 10 * vrvGeneralScaling * vrvUnit)
        dot.setAttribute('r', 25)
        dot.setAttribute('fill', '#ff0000cc ')
        if (x % 5 === 0 || y % 5 === 0) {
          dot.setAttribute('fill', '#0000ffcc ')
        }
        rasterGroup.appendChild(dot)
      }
    }

    const dot1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    dot1.setAttribute('cx', 53 * vrvGeneralScaling * vrvUnit)
    dot1.setAttribute('cy', 13 * vrvGeneralScaling * vrvUnit)
    dot1.setAttribute('r', 25)
    dot1.setAttribute('fill', '#00ff00cc ')
    rasterGroup.appendChild(dot1)

    const dot2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    dot2.setAttribute('cx', 51.5 * vrvGeneralScaling * vrvUnit)
    dot2.setAttribute('cy', 24 * vrvGeneralScaling * vrvUnit)
    dot2.setAttribute('r', 25)
    dot2.setAttribute('fill', '#00ff00cc ')
    rasterGroup.appendChild(dot2)

    const dot3 = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    dot3.setAttribute('cx', 21 * vrvGeneralScaling * vrvUnit)
    dot3.setAttribute('cy', 14.2 * vrvGeneralScaling * vrvUnit)
    dot3.setAttribute('r', 25)
    dot3.setAttribute('fill', '#00ff00cc ')
    rasterGroup.appendChild(dot3)
  }
  // addDebugDots()
    
  // Add shapes layer if shapes graphic is available
  const shapesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  shapesGroup.setAttribute('class', 'shapes')
  contentGroup.appendChild(shapesGroup)

  const shapesDoc = new DOMParser().parseFromString(currentPage.shapesContent || '<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/svg+xml')
  const shapesRoot = shapesDoc.documentElement
  shapesRoot.setAttribute('x', String(pageX))
  shapesRoot.setAttribute('y', String(pageY))
  shapesRoot.setAttribute('width', String(pageW))
  shapesRoot.setAttribute('height', String(pageH))
  
  if (currentPage.fragment?.rotate?.deg !== 0) {
    const rotateAngle = currentPage.fragment.rotate.deg * -1
    const rotateCenterX = currentPage.utils.pxToMm(currentPage.fragment.rotate.handle.x) * vrvGeneralScaling * vrvUnit
    const rotateCenterY = currentPage.utils.pxToMm(currentPage.fragment.rotate.handle.y) * vrvGeneralScaling * vrvUnit
    image.setAttribute('transform', `rotate(${rotateAngle} ${rotateCenterX} ${rotateCenterY})`)
    shapesRoot.setAttribute('transform', `rotate(${rotateAngle} ${rotateCenterX} ${rotateCenterY})`)
  }

  shapesGroup.appendChild(shapesRoot)

  // remove shapes from other writing zones
  const firstFacsId = dtDom.querySelector('*[facs]').getAttribute('facs').split(' ')[0].split('#')[1]
  const wzShapeGroupId = shapesGroup.querySelector('#' + firstFacsId).parentNode.parentNode.getAttribute('id')
  shapesGroup.querySelectorAll('.shapes .writingZone, .shapes .unassigned').forEach(wz => {
    if (wz.getAttribute('id') !== wzShapeGroupId) {
      wz.parentNode.removeChild(wz)
    }
  })
  // adjust colors of highlighted wz
  shapesGroup.querySelectorAll('.shapes .writingZone path').forEach(path => {
    path.setAttribute('opacity', '1')
    path.setAttribute('fill', '#00b7ff')
    path.setAttribute('style', 'stroke: #028cc2; stroke-width: 2px;')
  })

  // Add AT
  const transcriptionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  transcriptionGroup.setAttribute('class', 'transcription')
  // transcriptionGroup.setAttribute('transform', 'scale(' + (constants.ftStaticScaling * vrvUnit) + ')')
  contentGroup.appendChild(transcriptionGroup)

  // Add DT
  const diplomaticGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  diplomaticGroup.setAttribute('class', 'diplomatic')
  
  contentGroup.appendChild(diplomaticGroup)

  svg.appendChild(contentGroup)

  return svg
}
