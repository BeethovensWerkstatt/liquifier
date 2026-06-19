import fs from 'fs'
import path from 'path'

import { getOuterBoundingRect } from '../../../utils/trigonometry.js'
import { parseViewBox, parseTranslatePoint, extractNodeXRange } from './svgShared.js'

/**
 * Anchors fluid transcripts viewBox to the AT left edge.
 *
 * @param {SVGElement|Document} fluidSvgDocument - Fluid transcripts SVG document.
 * @returns {{newX: number, newWidth: number}|null} Updated x-domain info.
 */
export function anchorFluidTranscriptsToAtLeft (fluidSvgDocument) {
  const rootSvg = fluidSvgDocument.documentElement || fluidSvgDocument
  const displaySvg = rootSvg.querySelector('svg.definition-scale') || rootSvg
  if (displaySvg.getAttribute('data-bw-focused-viewbox') === 'true') {
    return null
  }
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
 * Resolve facsimile/shapes context for one DT page.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {Document} params.dtDom - Diplomatic transcript MEI DOM.
 * @param {Document} params.sourceDom - Source MEI DOM.
 * @param {Object} params.triple - Path tuple for current render run.
 * @returns {Object|null} Overlay context for facsimile injection.
 */
export function resolveFluidTranscriptsOverlayContext ({ dtDom, sourceDom, triple }) {
  const pb = dtDom?.querySelector('pb[target], pb[corresp]')
  if (!pb) return null

  const pbRef = parseTargetReference(pb.getAttribute('target') || pb.getAttribute('corresp'))
  const surfaceId = pbRef?.fragment || ''
  if (!surfaceId) return null

  const surface = Array.from(sourceDom?.querySelectorAll('surface') || []).find(s => s.getAttribute('xml:id') === surfaceId)
  if (!surface) return null

  const facsimileGraphic = surface.querySelector('graphic[type="facsimile"]')
  if (!facsimileGraphic) return null

  const shapesGraphic = surface.querySelector('graphic[type="shapes"]')
  const pageMm = resolvePageDimensionsMmForSurface(sourceDom, surfaceId)
  if (!pageMm) return null

  const widthPx = Number.parseFloat(facsimileGraphic.getAttribute('width') || '')
  const heightPx = Number.parseFloat(facsimileGraphic.getAttribute('height') || '')
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) return null

  const facsimileTarget = facsimileGraphic.getAttribute('target') || ''
  const parsedUri = parseFacsimileUri(facsimileTarget, widthPx, heightPx)
  const mediaFragMm = getOuterBoundingRect(0, 0, pageMm.width, pageMm.height, parsedUri.fragment.rotate)
  const ratio = parsedUri.fragment.w / mediaFragMm.w
  if (!Number.isFinite(ratio) || ratio <= 0) return null

  const imageMm = {
    x: mediaFragMm.x - (parsedUri.fragment.x / ratio),
    y: mediaFragMm.y - (parsedUri.fragment.y / ratio),
    width: widthPx / ratio,
    height: heightPx / ratio
  }

  let shapesAbsolutePath = null
  if (shapesGraphic) {
    const shapesTarget = shapesGraphic.getAttribute('target') || ''
    if (!/^https?:\/\//i.test(shapesTarget) && triple?.dtFullPath) {
      const sourceRef = parseTargetReference(dtDom.querySelector('source[target]')?.getAttribute('target'))
      const sourceMeiPath = sourceRef?.path
        ? path.resolve(path.dirname(triple.dtFullPath), sourceRef.path)
        : null
      if (sourceMeiPath) {
        shapesAbsolutePath = path.resolve(path.dirname(sourceMeiPath), shapesTarget)
      }
    }
  }

  return {
    surfaceId,
    facsimile: {
      href: parsedUri.href,
      widthPx,
      heightPx,
      fragment: parsedUri.fragment,
      pageMm,
      mediaFragMm,
      imageMm,
      ratioPxPerMm: ratio,
      mmPerPx: 1 / ratio
    },
    shapes: {
      absolutePath: shapesAbsolutePath
    }
  }
}

/**
 * Resolves AT-stream-relative facsimile placement offsets.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {Object} params.overlayContext - Resolved facsimile context.
 * @param {Object} params.positionalData - Positional data containing AT page stream info.
 * @param {SVGElement|Document} [params.fluidSvg] - Fluid SVG for staff-line center extraction.
 * @param {Document} [params.dtDom] - DT MEI DOM for writing-zone resolution.
 * @param {Document} [params.sourceDom] - Source MEI DOM containing surface zones.
 * @returns {{xOffsetMm: number, yOffsetMm: number, xOffsetUnits: number, yOffsetUnits: number, unitsPerMm: number}} Placement offsets.
 */
/* export function resolveFluidTranscriptsOverlayPlacement ({ overlayContext, positionalData, fluidSvg, dtDom, sourceDom }) {
  const unitsPerMm = 90
  if (!overlayContext?.facsimile) {
    return { xOffsetMm: 0, yOffsetMm: 0, xOffsetUnits: 0, yOffsetUnits: 0, unitsPerMm }
  }

  const pages = Array.isArray(positionalData?.pages) ? positionalData.pages : []
  const activePage = pages.find(page => page?.currentPage)

  const xOffsetMm = Number.isFinite(activePage?.precedingWidth) ? activePage.precedingWidth : 0

  const atCenterYMm = resolveAtStaffLineCenterMm({ fluidSvg, positionalData, unitsPerMm })
  const dtWritingZoneCenterYMm = resolveDtWritingZoneCenterMm({ overlayContext, dtDom, sourceDom })

  const facsimileMediaCenterYMm = Number.isFinite(overlayContext.facsimile.mediaFragMm?.y) && Number.isFinite(overlayContext.facsimile.mediaFragMm?.h)
    ? overlayContext.facsimile.mediaFragMm.y + (overlayContext.facsimile.mediaFragMm.h / 2)
    : null

  const pageHeightMm = Number.isFinite(overlayContext.facsimile.pageMm?.height) ? overlayContext.facsimile.pageMm.height : 232
  const pageTopMm = Number.isFinite(overlayContext.facsimile.imageMm?.y) ? overlayContext.facsimile.imageMm.y : null
  const facsimileEnvelopeCenterYMm = Number.isFinite(pageTopMm)
    ? pageTopMm + 10 + (pageHeightMm / 2)
    : null

  const facsimileCenterYMm = Number.isFinite(dtWritingZoneCenterYMm)
    ? dtWritingZoneCenterYMm
    : Number.isFinite(facsimileMediaCenterYMm)
      ? facsimileMediaCenterYMm
      : facsimileEnvelopeCenterYMm

  const yOffsetMm = Number.isFinite(atCenterYMm) && Number.isFinite(facsimileCenterYMm)
    ? atCenterYMm - facsimileCenterYMm
    : 0

  return {
    xOffsetMm,
    yOffsetMm,
    xOffsetUnits: xOffsetMm * unitsPerMm,
    yOffsetUnits: yOffsetMm * unitsPerMm,
    unitsPerMm
  }
} */

/**
 * Logs fluid transcripts dimension diagnostics in millimeters.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {SVGElement|Document} params.dtSvg - Thulemeier DT SVG output.
 * @param {Object|null} params.overlayContext - Resolved facsimile context.
 * @param {{info: Function, warn: Function}} params.logger - Logger instance.
 * @param {number} [params.unitsPerMm=90] - SVG units per millimeter.
 * @returns {void} No return value.
 */
export function logFluidTranscriptsDimensionDiagnostics ({ dtSvg, overlayContext, logger, unitsPerMm = 90 }) {
  const dtRoot = dtSvg?.documentElement || dtSvg
  const dtViewBox = parseViewBox(dtRoot?.getAttribute?.('viewBox'))

  const dtMm = dtViewBox && Number.isFinite(unitsPerMm) && unitsPerMm > 0
    ? {
        x: dtViewBox.x / unitsPerMm,
        y: dtViewBox.y / unitsPerMm,
        width: dtViewBox.width / unitsPerMm,
        height: dtViewBox.height / unitsPerMm
      }
    : null

  if (!dtMm) {
    logger.warn('[renderFluidTranscriptsSvg][dims] Could not derive DT full-page dimensions from DT SVG viewBox.')
  } else {
    logger.info(
      `[renderFluidTranscriptsSvg][dims] dtFullPageMm x=${roundDiagnosticValue(dtMm.x)} y=${roundDiagnosticValue(dtMm.y)} width=${roundDiagnosticValue(dtMm.width)} height=${roundDiagnosticValue(dtMm.height)}`
    )
  }

  if (!overlayContext?.facsimile) {
    logger.warn('[renderFluidTranscriptsSvg][dims] Missing overlayContext.facsimile; cannot log facsimile mm diagnostics.')
    return
  }

  const facsimilePageMm = overlayContext.facsimile.pageMm || null
  const pixelImageMm = overlayContext.facsimile.imageMm || null
  const widthPx = overlayContext.facsimile.widthPx
  const heightPx = overlayContext.facsimile.heightPx

  logger.info(
    `[renderFluidTranscriptsSvg][dims] facsimilePageMm width=${roundDiagnosticValue(facsimilePageMm?.width)} height=${roundDiagnosticValue(facsimilePageMm?.height)}`
  )
  logger.info(
    `[renderFluidTranscriptsSvg][dims] pixelImageMm x=${roundDiagnosticValue(pixelImageMm?.x)} y=${roundDiagnosticValue(pixelImageMm?.y)} width=${roundDiagnosticValue(pixelImageMm?.width)} height=${roundDiagnosticValue(pixelImageMm?.height)} (sourcePx ${roundDiagnosticValue(widthPx)}x${roundDiagnosticValue(heightPx)})`
  )
  logger.info(
    `[renderFluidTranscriptsSvg][dims] facsimileScale mmPerPx=${roundDiagnosticValue(overlayContext.facsimile.mmPerPx)} ratioPxPerMm=${roundDiagnosticValue(overlayContext.facsimile.ratioPxPerMm)}`
  )

  const widthRatioDtToPage = Number.isFinite(dtMm?.width) && Number.isFinite(facsimilePageMm?.width) && facsimilePageMm.width > 0
    ? dtMm.width / facsimilePageMm.width
    : null
  const heightRatioDtToPage = Number.isFinite(dtMm?.height) && Number.isFinite(facsimilePageMm?.height) && facsimilePageMm.height > 0
    ? dtMm.height / facsimilePageMm.height
    : null
  const widthRatioImageToPage = Number.isFinite(pixelImageMm?.width) && Number.isFinite(facsimilePageMm?.width) && facsimilePageMm.width > 0
    ? pixelImageMm.width / facsimilePageMm.width
    : null
  const heightRatioImageToPage = Number.isFinite(pixelImageMm?.height) && Number.isFinite(facsimilePageMm?.height) && facsimilePageMm.height > 0
    ? pixelImageMm.height / facsimilePageMm.height
    : null
  const widthRatioDtToImage = Number.isFinite(dtMm?.width) && Number.isFinite(pixelImageMm?.width) && pixelImageMm.width > 0
    ? dtMm.width / pixelImageMm.width
    : null
  const heightRatioDtToImage = Number.isFinite(dtMm?.height) && Number.isFinite(pixelImageMm?.height) && pixelImageMm.height > 0
    ? dtMm.height / pixelImageMm.height
    : null

  logger.info(
    `[renderFluidTranscriptsSvg][dims] widthRatios dt/page=${roundDiagnosticValue(widthRatioDtToPage)} image/page=${roundDiagnosticValue(widthRatioImageToPage)} dt/image=${roundDiagnosticValue(widthRatioDtToImage)}`
  )
  logger.info(
    `[renderFluidTranscriptsSvg][dims] heightRatios dt/page=${roundDiagnosticValue(heightRatioDtToPage)} image/page=${roundDiagnosticValue(heightRatioImageToPage)} dt/image=${roundDiagnosticValue(heightRatioDtToImage)}`
  )
}

/**
 * Parses a target attribute into path and fragment components.
 *
 * @param {string} rawTarget - Target attribute value.
 * @returns {{path: string, fragment: string}|null} Parsed target components.
 */
function parseTargetReference (rawTarget) {
  const target = String(rawTarget || '').trim()
  if (!target) return null

  const hashIndex = target.indexOf('#')
  if (hashIndex < 0) return { path: target, fragment: '' }

  return {
    path: target.slice(0, hashIndex),
    fragment: target.slice(hashIndex + 1)
  }
}

/**
 * Parses IIIF media fragment and rotation from a facsimile target URI.
 *
 * @param {string} uri - Facsimile target URI.
 * @param {number} widthPx - Full image width in pixels.
 * @param {number} heightPx - Full image height in pixels.
 * @returns {{href: string, fragment: {x: number, y: number, w: number, h: number, rotate: number}}} Parsed URI data.
 */
function parseFacsimileUri (uri, widthPx, heightPx) {
  const reference = parseTargetReference(uri)
  const href = reference?.path || String(uri || '')

  const fragment = {
    x: 0,
    y: 0,
    w: widthPx,
    h: heightPx,
    rotate: 0
  }

  const fragmentRaw = reference?.fragment || ''
  if (fragmentRaw.startsWith('xywh=')) {
    const xywhRaw = fragmentRaw.split('&rotate=')[0].slice('xywh='.length)
    const rotateRaw = fragmentRaw.split('&rotate=')[1]
    const [x, y, w, h] = xywhRaw.split(',').map(value => Number.parseFloat(value))

    if ([x, y, w, h].every(Number.isFinite)) {
      fragment.x = x
      fragment.y = y
      fragment.w = w
      fragment.h = h
    }

    if (rotateRaw !== undefined) {
      const rotate = Number.parseFloat(rotateRaw.split(',')[0])
      if (Number.isFinite(rotate)) fragment.rotate = rotate
    }
  }

  return { href, fragment }
}

/**
 * Resolves page dimensions in mm via foliation references to one surface.
 *
 * @param {Document} sourceDom - Source MEI DOM.
 * @param {string} surfaceId - Source surface xml:id.
 * @returns {{width: number, height: number}|null} Page dimensions in mm.
 */
function resolvePageDimensionsMmForSurface (sourceDom, surfaceId) {
  if (!sourceDom || !surfaceId) return null

  const refValue = `#${surfaceId}`
  const referenceAttributes = ['outer.recto', 'inner.verso', 'inner.recto', 'outer.verso', 'recto', 'verso']
  const foliationNodes = Array.from(sourceDom.querySelectorAll('foliaDesc *'))

  for (const node of foliationNodes) {
    const referencesSurface = referenceAttributes.some(attributeName => node.getAttribute(attributeName) === refValue)
    if (!referencesSurface) continue

    const width = Number.parseFloat(node.getAttribute('width') || '')
    const height = Number.parseFloat(node.getAttribute('height') || '')
    if (Number.isFinite(width) && Number.isFinite(height)) {
      return { width, height }
    }
  }

  return null
}

/**
 * Appends a simple animate element with shared fluidTranscripts timing defaults.
 *
 * @param {Element} element - Target SVG element.
 * @param {string} attributeName - Animated SVG attribute name.
 * @param {string} values - Semicolon-separated animation values.
 * @returns {void} No return value.
 */
function appendOverlayAnimate (element, attributeName, values) {
  const doc = element.ownerDocument || element
  const animation = doc.createElementNS('http://www.w3.org/2000/svg', 'animate')
  animation.setAttribute('attributeName', attributeName)
  animation.setAttribute('values', values)
  animation.setAttribute('repeatCount', 'indefinite')
  animation.setAttribute('dur', '5s')
  element.appendChild(animation)
}

/**
 * Resolves AT center from staff lines in the fluid SVG.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {SVGElement|Document} params.fluidSvg - Fluid transcripts SVG document.
 * @param {Object} params.positionalData - Positional data containing fallback page center.
 * @param {number} params.unitsPerMm - SVG units per millimeter.
 * @returns {number|null} AT center in mm.
 */
function resolveAtStaffLineCenterMm ({ fluidSvg, positionalData, unitsPerMm }) {
  const pages = Array.isArray(positionalData?.pages) ? positionalData.pages : []
  const activePage = pages.find(page => page?.currentPage)

  if (!fluidSvg) {
    return Number.isFinite(activePage?.atCenterY) ? activePage.atCenterY : null
  }

  const rootSvg = fluidSvg.documentElement || fluidSvg
  const linePaths = rootSvg.querySelectorAll('g.staff:not(.bounding-box) > path, path.rastrum')

  let minY = Infinity
  let maxY = -Infinity

  linePaths.forEach(pathElement => {
    const d = pathElement.getAttribute('d') || ''
    const match = d.match(/M\s*([\d.-]+)[,\s]+([\d.-]+)\s+L\s*([\d.-]+)[,\s]+([\d.-]+)/)
    if (!match) return

    const y1 = parseFloat(match[2])
    const y2 = parseFloat(match[4])
    if (Number.isFinite(y1)) {
      minY = Math.min(minY, y1)
      maxY = Math.max(maxY, y1)
    }
    if (Number.isFinite(y2)) {
      minY = Math.min(minY, y2)
      maxY = Math.max(maxY, y2)
    }
  })

  if (Number.isFinite(minY) && Number.isFinite(maxY) && Number.isFinite(unitsPerMm) && unitsPerMm > 0) {
    return (minY + ((maxY - minY) / 2)) / unitsPerMm
  }

  return Number.isFinite(activePage?.atCenterY) ? activePage.atCenterY : null
}

/**
 * Resolves DT writing-zone center in mm using source zone pixel coordinates.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {Object} params.overlayContext - Resolved facsimile context.
 * @param {Document} params.dtDom - Current DT MEI DOM.
 * @param {Document} params.sourceDom - Source MEI DOM.
 * @returns {number|null} Writing-zone center y in mm.
 */
function resolveDtWritingZoneCenterMm ({ overlayContext, dtDom, sourceDom }) {
  if (!overlayContext?.facsimile || !dtDom || !sourceDom) return null

  const sourceTarget = dtDom.querySelector('source[target]')?.getAttribute('target') || ''
  if (!sourceTarget.includes('#')) return null

  const writingZoneGenDescId = sourceTarget.split('#').pop()
  if (!writingZoneGenDescId) return null

  const surfaceTarget = dtDom.querySelector('pb[target]')?.getAttribute('target') || ''
  const parsedSurfaceRef = parseTargetReference(surfaceTarget)
  const surfaceId = overlayContext.surfaceId || parsedSurfaceRef?.id || ''

  const surface = surfaceId
    ? sourceDom.querySelector(`surface[xml\\:id="${surfaceId}"], surface[*|id="${surfaceId}"]`)
    : null

  const zoneSelector = `zone[data="#${writingZoneGenDescId}"], zone[data="${writingZoneGenDescId}"]`
  const zone = surface?.querySelector(zoneSelector) || sourceDom.querySelector(zoneSelector)
  if (!zone) return null

  const uly = Number.parseFloat(zone.getAttribute('uly') || '')
  const lry = Number.parseFloat(zone.getAttribute('lry') || '')
  if (!Number.isFinite(uly) || !Number.isFinite(lry)) return null

  const centerPxY = uly + ((lry - uly) / 2)
  const pageHeightMm = Number.isFinite(overlayContext.facsimile.pageMm?.height) ? overlayContext.facsimile.pageMm.height : 232

  let mmPerPx = Number.isFinite(overlayContext.facsimile.mmPerPx) && overlayContext.facsimile.mmPerPx > 0
    ? overlayContext.facsimile.mmPerPx
    : null

  if (!mmPerPx && Number.isFinite(overlayContext.facsimile.ratioPxPerMm) && overlayContext.facsimile.ratioPxPerMm > 0) {
    mmPerPx = 1 / overlayContext.facsimile.ratioPxPerMm
  }

  if (!mmPerPx && Number.isFinite(overlayContext.facsimile.heightPx) && overlayContext.facsimile.heightPx > 0) {
    mmPerPx = pageHeightMm / overlayContext.facsimile.heightPx
  }

  if (!Number.isFinite(mmPerPx) || mmPerPx <= 0) return null

  const imageTopMm = Number.isFinite(overlayContext.facsimile.imageMm?.y) ? overlayContext.facsimile.imageMm.y : 0
  return imageTopMm + (centerPxY * mmPerPx)
}

/**
 * Expands definition-scale viewBox to include full facsimile media bounds.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {SVGElement} params.definitionSvg - Target definition-scale SVG node.
 * @param {Object} params.overlayContext - Resolved facsimile geometry context.
 * @param {number} params.xOffsetUnits - Horizontal overlay placement in SVG units.
 * @param {number} params.yOffsetUnits - Vertical overlay placement in SVG units.
 * @param {number} params.unitsPerMm - SVG units per millimeter.
 * @returns {void} No return value.
 */
function ensureOverlayFitsDefinitionViewBox ({ definitionSvg, overlayContext, xOffsetUnits, yOffsetUnits, unitsPerMm }) {
  if (!definitionSvg || !overlayContext?.facsimile?.mediaFragMm) return

  const viewBox = parseViewBox(definitionSvg.getAttribute('viewBox'))
  if (!viewBox) return

  const mediaFrag = overlayContext.facsimile.mediaFragMm
  const overlayMinX = (mediaFrag.x * unitsPerMm) + xOffsetUnits
  const overlayMinY = (mediaFrag.y * unitsPerMm) + yOffsetUnits
  const overlayMaxX = ((mediaFrag.x + mediaFrag.w) * unitsPerMm) + xOffsetUnits
  const overlayMaxY = ((mediaFrag.y + mediaFrag.h) * unitsPerMm) + yOffsetUnits

  if (![overlayMinX, overlayMinY, overlayMaxX, overlayMaxY].every(Number.isFinite)) return

  const padding = 120
  let minX = Math.min(viewBox.x, overlayMinX - padding)
  const minY = Math.min(viewBox.y, overlayMinY - padding)
  let maxX = Math.max(viewBox.x + viewBox.width, overlayMaxX + padding)
  const maxY = Math.max(viewBox.y + viewBox.height, overlayMaxY + padding)

  const atFrame = definitionSvg.querySelector('g.page-margin') || definitionSvg
  const atFrameTranslate = parseTranslatePoint(atFrame.getAttribute('transform'))
  const maxAtLeftMarginUnits = 900
  if (Number.isFinite(atFrameTranslate?.x)) {
    const minAllowedX = atFrameTranslate.x - maxAtLeftMarginUnits
    minX = Math.max(minX, minAllowedX)
  } else {
    const atRange = extractNodeXRange(atFrame)
    if (atRange && Number.isFinite(atRange.min)) {
      const minAllowedX = atRange.min - maxAtLeftMarginUnits
      minX = Math.max(minX, minAllowedX)
      maxX = Math.max(maxX, atRange.max + padding)
    } else {
      maxX = Math.max(maxX, viewBox.x + viewBox.width)
    }
  }

  const width = maxX - minX
  const height = maxY - minY

  if (width <= 0 || height <= 0) return
  definitionSvg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`)
}

/**
 * Normalizes root/nested SVG viewport attributes for browser display.
 *
 * @param {Object} params - Input parameter bundle.
 * @param {SVGElement} params.rootSvg - Root SVG element.
 * @param {SVGElement} params.definitionSvg - Nested definition-scale SVG element.
 * @returns {void} No return value.
 */
function normalizeFluidTranscriptsViewport ({ rootSvg, definitionSvg }) {
  if (!rootSvg || !definitionSvg) return

  const definitionViewBox = definitionSvg.getAttribute('viewBox')
  if (!definitionViewBox) return

  rootSvg.setAttribute('viewBox', definitionViewBox)
  rootSvg.setAttribute('width', '100%')
  rootSvg.removeAttribute('height')
  rootSvg.setAttribute('preserveAspectRatio', 'xMinYMin meet')

  definitionSvg.setAttribute('x', '0')
  definitionSvg.setAttribute('y', '0')
  definitionSvg.setAttribute('width', '100%')
  definitionSvg.setAttribute('height', '100%')
}

/**
 * Rounds a numeric value for readable diagnostics.
 *
 * @param {number} value - Numeric input value.
 * @returns {number|string} Rounded number or n/a when invalid.
 */
function roundDiagnosticValue (value) {
  if (!Number.isFinite(value)) return 'n/a'
  return Math.round(value * 1000) / 1000
}
