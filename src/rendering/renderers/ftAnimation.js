import { computeApproxBBox } from '../../utils/svgGeometry.js'
import { addTransform, prepareAssets } from '../../utils/ft/animation.js'
import { animateFtReadingOrderSystems, animateFtStaffLines } from '../../utils/ft/staffLines.js'
import { retrieveHorizontalPositionFromDt } from '../../utils/ft/positioning.js'
import { liquifyMusic } from '../../preparation/liquify.js'
import { resolveMatchedStaffLineContextForCurrentDt } from '../../preparation/fluidTranscripts.js'
import { constants } from '../../config.mjs'

/**
 * Adds one prepared AT as an animated fluid-transcription layer.
 *
 * @param {Object} params - Animation parameters.
 * @param {Document} params.ftSvgDom - Fluid-transcription SVG base document.
 * @param {{atSvgDom: Document, atRegSvgDom: Document, editedAtDom: Document}} params.atPreparation - Prepared AT forms.
 * @param {Document} params.atDom - Source annotated transcript.
 * @param {Document} params.sourceAtDom - Unmodified source annotated transcript.
 * @param {Document} params.sourceDtDom - Unmodified source diplomatic transcript.
 * @param {Document} params.dtDom - Diplomatic transcript.
 * @param {Object} params.layoutInfo - Fluid layout information.
 * @param {Object} params.pageDimensions - Page dimensions.
 * @param {Object} params.triple - File-path metadata.
 * @param {string[]} [params.activeSvgLayers] - Writing-layer SVG IDs active in a preceding genetic state.
 * @param {Object} params.logger - Logger instance.
 * @returns {Document} Completed fluid-transcription SVG document.
 */
export const addAnimatedTranscription = ({ ftSvgDom, atPreparation, atDom, sourceAtDom, sourceDtDom, dtDom, layoutInfo, pageDimensions, triple, activeSvgLayers, logger }) => {
  const { atSvgDom, atRegSvgDom, editedAtDom } = atPreparation
  const currentPage = layoutInfo.pages.find(page => page.current)
  const transcriptionGroup = ftSvgDom.querySelector('.transcription')
  transcriptionGroup.appendChild(atSvgDom.documentElement.querySelector('desc'))
  transcriptionGroup.appendChild(atSvgDom.documentElement.querySelector('defs'))
  transcriptionGroup.appendChild(atSvgDom.documentElement.querySelector('.page-margin'))

  const getAtStaffLinePaths = () => {
    const normalizedPaths = ftSvgDom.querySelectorAll('.transcription path.rastrum')
    if (normalizedPaths.length > 0) return normalizedPaths
    return ftSvgDom.querySelectorAll('.transcription .staff > path')
  }
  const dtRastrumPaths = ftSvgDom.querySelector('.diplomatic .rastrum').querySelectorAll('path')
  const dtRastrumHeight = parseFloat(dtRastrumPaths[4].getAttribute('d').split(' ')[1]) - parseFloat(dtRastrumPaths[0].getAttribute('d').split(' ')[1])
  const atRastrumPaths = getAtStaffLinePaths()
  const atRastrumHeight = parseFloat(atRastrumPaths[4].getAttribute('d').split(' ')[1]) - parseFloat(atRastrumPaths[0].getAttribute('d').split(' ')[1])
  const atScaling = dtRastrumHeight / atRastrumHeight * currentPage.vrvMeiUnit / constants.verovioPixelPerVu

  const dtBbox = computeApproxBBox(ftSvgDom.querySelector('.diplomatic .draft'))
  const atTopRastrumY = parseFloat(atRastrumPaths[0].getAttribute('d').split(' ')[1])
  const atBottomRastrumY = parseFloat(atRastrumPaths[atRastrumPaths.length - 1].getAttribute('d').split(' ')[1])
  const atVerticalShift = (dtBbox.y + dtBbox.height / 2 - (atTopRastrumY + atBottomRastrumY) / 2) * currentPage.vrvMeiUnit / constants.verovioPixelPerVu

  const atWidth = parseFloat(atSvgDom.documentElement.getAttribute('width'))
  const dtXCoordinates = retrieveHorizontalPositionFromDt(dtDom, layoutInfo)
  let atX = atWidth + dtXCoordinates.minX < pageDimensions.width
    ? dtXCoordinates.minX
    : Math.max(0, pageDimensions.width - atWidth)
  if (atWidth > pageDimensions.width) {
    atX = 0
    const oldViewBox = ftSvgDom.getAttribute('viewBox').split(' ')
    ftSvgDom.setAttribute('width', `${atWidth * constants.ftStaticScaling}mm`)
    ftSvgDom.setAttribute('viewBox', `${oldViewBox[0]} ${oldViewBox[1]} ${Math.round(atWidth * constants.verovioGeneralScaling * currentPage.vrvMeiUnit)} ${oldViewBox[3]}`)

    const wzBegin = ftSvgDom.querySelector(`g.pb[data-corresp$="#${currentPage.id}"] + g.writingZone > rect.pageLabelBox`)
    const wzBeginX = wzBegin ? parseFloat(wzBegin.getAttribute('x')) : 0
    if (wzBeginX > 0) {
      ftSvgDom.querySelectorAll('.facsimileBg, .shapes').forEach(layer => {
        layer.setAttribute('transform', `translate(${wzBeginX * atScaling},0)`)
      })
      ftSvgDom.querySelector('.diplomatic').setAttribute('transform', `scale(1) translate(${wzBeginX * atScaling},0)`)
    }
  }
  const atHorizontalPosition = atX * currentPage.vrvMeiUnit * constants.verovioGeneralScaling
  transcriptionGroup.setAttribute('transform', `translate(${atHorizontalPosition},${atVerticalShift}) scale(${atScaling})`)

  const tools = prepareAssets({
    ftSvgDom,
    atLayer: transcriptionGroup,
    dtLayer: ftSvgDom.querySelector('.diplomatic'),
    atMeiDom: editedAtDom,
    atRegSvgDom,
    currentDtReference: triple.dtFullPath || triple.dt || '',
    atScaling,
    atHorizontalPosition,
    atVerticalShift,
    layoutInfo,
    sourceDtMeiDom: sourceDtDom || dtDom,
    logger
  })
  tools.sourceAtMeiDom = sourceAtDom || atDom
  tools.sourceDtMeiDom = sourceDtDom || dtDom
  tools.activeSvgLayers = activeSvgLayers
  const matchedStaffLineContext = resolveMatchedStaffLineContextForCurrentDt(atDom, dtDom, logger)
  const readingOrderSystemDistance = constants.ftReadingOrderSystemDistanceMm * currentPage.vrvMeiUnit * constants.verovioGeneralScaling
  animateFtStaffLines(transcriptionGroup, ftSvgDom.querySelector('.diplomatic'), tools, matchedStaffLineContext)
  animateFtReadingOrderSystems(transcriptionGroup, ftSvgDom.querySelector('.diplomatic'), editedAtDom, tools, readingOrderSystemDistance)
  liquifyMusic(transcriptionGroup, ftSvgDom.querySelector('.diplomatic'), tools)
  animateOtherWritingZones(transcriptionGroup)

  ftSvgDom.querySelector('.diplomatic').setAttribute('style', 'display: none;')
  ftSvgDom.querySelectorAll('.rastrum.bounding-box').forEach(bbox => bbox.parentNode.removeChild(bbox))
  ftSvgDom.querySelectorAll('.pageLabelBox, .sysPreview, .pageBg, .pageLabel, .sysLabel').forEach(element => {
    addTransform(element, 'opacity', constants.ftAssetPhaseOpacityValues.labelsHiddenUntilEnd)
  })
  ftSvgDom.querySelectorAll()
  return ftSvgDom
}

/**
 * Removes shared page layers from a completed FT, leaving only the animated transcription.
 *
 * @param {Document} ftSvgDom - Completed fluid-transcription SVG.
 * @returns {Document} Companion SVG containing only animated transcription content.
 */
export const extractAnimatedTranscription = (ftSvgDom) => {
  const companion = ftSvgDom.cloneNode(true)
  companion.querySelectorAll('.facsimileBg, .shapes, .diplomatic').forEach(layer => layer.parentNode.removeChild(layer))
  return companion
}

/**
 * Keep only the current writing zone visible until supplements. The current
 * writing zone is the first wrapper inserted by addSystemLabelBlocks.
 *
 * @param {Element} transcriptionGroup - Animated AT transcription container.
 * @returns {void}
 */
export function animateOtherWritingZones (transcriptionGroup) {
  const writingZones = Array.from(transcriptionGroup.querySelectorAll('g.writingZone'))
  const otherWritingZones = writingZones.slice(1)
  const opacityValues = ['0', '0', '0', '0', '0', '0', '1', '1']
  const otherSystemIds = new Set(
    otherWritingZones.flatMap(writingZone => Array.from(writingZone.querySelectorAll('g.systemBegin[data-id]'))
      .map(systemBegin => systemBegin.getAttribute('data-id')))
  )

  otherWritingZones.forEach(writingZone => {
    writingZone.setAttribute('opacity', '0')
    addTransform(writingZone, 'opacity', opacityValues)
  })

  transcriptionGroup.querySelectorAll('g.bw-system-rastrum[data-system-id]').forEach(rastrum => {
    if (!otherSystemIds.has(rastrum.getAttribute('data-system-id'))) return
    rastrum.setAttribute('opacity', '0')
    addTransform(rastrum, 'opacity', opacityValues)
  })
}
