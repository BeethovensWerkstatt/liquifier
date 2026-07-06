import { DOMParser, XMLSerializer, DOMImplementation } from 'xmldom-qsa'
import { createRequire } from 'node:module'

// preliminaries
import { shouldRender } from '../../utils/rendering.js'

// AT preparations
import { prepareEditedAtDom } from '../../preparation/editedAnnotatedTranscripts.js'
import { prepareAtForVerovio, addSystemLabelBlocks } from '../../preparation/annotatedTranscripts.js'
import { adjustAtStaffLines, resolveMatchedStaffLineContextForCurrentDt } from '../../preparation/fluidTranscripts.js'
import { renderContinuousAt } from '../verovioHandler.js'

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
import { addTransform, prepareAssets } from '../../utils/ft/animation.js'
import { animateFtStaffLines, trimDtStaffLinesToContent } from '../../utils/ft/staffLines.js'
import { retrieveHorizontalPositionFromDt } from '../../utils/ft/positioning.js'

import { constants } from '../../config.mjs'
const require = createRequire(import.meta.url)
const { version: appVersion } = require('../../../package.json')

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
    logger.info('Rendering Fluid Transcripts for ' + triple.ftSvgPath)

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
        addTransform(elem, 'opacity', constants.ftAssetPhaseOpacityValues.labelsHiddenUntilEnd)
      })

      const ftSvgString = new XMLSerializer().serializeToString(ftSvgDom)
      await writeData(ftSvgString, triple.ftSvgPath)
      logger.info('Successfully rendered ' + triple.ftSvgPath)
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
  /* if (currentPage.iiif.includes('_Mh_60_05.jpg#')) {
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
  } */

  image.setAttribute('preserveAspectRatio', 'none')
  image.setAttribute('opacity', '1')

  facsimileGroup.appendChild(image)

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
    path.setAttribute('opacity', constants.ftWritingZoneHighlight.opacity)
    path.setAttribute('fill', constants.ftWritingZoneHighlight.fill)
    path.setAttribute('style', constants.ftWritingZoneHighlight.style)
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
