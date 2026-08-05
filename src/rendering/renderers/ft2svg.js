import { DOMParser, XMLSerializer, DOMImplementation } from 'xmldom-qsa'
import { createRequire } from 'node:module'
import path from 'node:path'

// preliminaries
import { shouldRender } from '../../utils/rendering.js'

// AT preparations
import { prepareAtForFluidTranscript } from '../../preparation/fluidTranscriptAt.js'
import { addAnimatedTranscription, extractAnimatedTranscription } from './ftAnimation.js'

// DT preparations
// import { buildCurrentDtSvgForFluidTranscripts } from '../dt2svg.js'
import { prepareDtForThulemeier } from '../../preparation/mei.js'
import { renderDiplomaticTranscript } from '../thulemeierHandler.js'
import { renderMidi } from '../verovioHandler.js'
/*
// FT preparation
import { generateFluidTranscription } from '../../../preparation/fluidTranscripts.js'
*/

// File handling
import { writeData } from '../../filehandlers/filehandler.js'

import { getRectFromFragment, getOuterBoundingRect } from '../../utils/trigonometry.js'
import { resolvePathFromDocumentReference, readTextFromDocumentReference } from '../../utils/utils.js'
import { trimDtStaffLinesToContent } from '../../utils/ft/staffLines.js'

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
 * @param {string[]} params.media - Requested output media.
 * @param {Object} params.logger - Logger instance.
 * @returns {Promise<*>} Promise resolving when rendering completes.
 */
export async function renderFluidTranscriptsSvg ({ data, triple, verovio, pageDimensions, recreate, media = [], logger }) {
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
      const ftSvgBase = ftSvgDom.cloneNode(true)

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

      const genDescWzId = data.atDom.querySelector('annot[class="#bw_writingZoneBegin"]')?.getAttribute('corresp')?.split('#')[1]
      const genDescWz = genDescWzId ? data.sourceDom.querySelector(`genDesc[xml\\:id="${genDescWzId}"]`) : null
      const allStateIds = genDescWz ? Array.from(genDescWz.querySelectorAll('genState')).map(state => state.getAttribute('xml:id')) : []

      // handle annotated transcription
      const atSourceDom = data.atDom.cloneNode(true)
      const dtSourceDom = data.dtDom.cloneNode(true)
      const statedAt = retrieveGeneticStateFromAt(data.atDom, allStateIds)
      const atSvgDom = await prepareAtForFt(statedAt, data.dtDom, data, verovio, pageDimensions, layoutInfo, logger, triple)
      // result is also available as data.atSvgDom = atSvgDom
      // data.editedAtDom is also available for later use in FT processing

      addAnimatedTranscription({
        ftSvgDom,
        atPreparation: { atSvgDom, atRegSvgDom: data.atRegSvgDom, editedAtDom: data.editedAtDom },
        atDom: data.atDom,
        sourceAtDom: atSourceDom,
        sourceDtDom: dtSourceDom,
        dtDom: data.dtDom,
        layoutInfo,
        pageDimensions,
        triple,
        logger
      })
      addGeneticInformation(ftSvgDom, {
        fileType: 'finalState',
        precedingStates: [],
        parentFile: null
      })

      addCrossReferences(ftSvgDom, dtSourceDom)

      // deal with additional states
      if (genDescWzId && genDescWz) {
        const requiresStates = genDescWz.querySelector('genState[class~="#bw_textStufe"]')
        if (requiresStates) {
          const states = getGeneticStates(genDescWz)
          addGeneticInformation(ftSvgDom, {
            fileType: 'finalState',
            precedingStates: states.map((state, index) => ({
              n: index + 1,
              activeStates: state.activeStates,
              svgLayers: state.svgLayers,
              label: state.label,
              fileName: path.join(path.basename(triple.ftStateSvgDir), path.basename(triple.ftStateSvgPath(index + 1))),
              midiFiles: {
                orig: relativeAssetPath(triple.ftSvgPath, triple.atMidOrigStatePath(index + 1)),
                reg: relativeAssetPath(triple.ftSvgPath, triple.atMidRegStatePath(index + 1))
              }
            })),
            parentFile: null
          })
          for (const [index, state] of states.entries()) {
            const statedAt = retrieveGeneticStateFromAt(data.atDom, state.activeStates)
            const statedPreparation = prepareAtForFluidTranscript({
              atDom: statedAt,
              dtDom: data.dtDom,
              sourceDom: data.sourceDom,
              reconstructionDom: data.reconstructionDom,
              verovio,
              pageDimensions,
              layoutInfo,
              triple
            })
            const statedFtSvgDom = ftSvgBase.cloneNode(true)
            addGeneticInformation(statedFtSvgDom, {
              fileType: 'precedingState',
              precedingStates: [],
              parentFile: path.join('..', path.basename(triple.ftSvgPath)),
              midiFiles: {
                orig: relativeAssetPath(triple.ftStateSvgPath(index + 1), triple.atMidOrigStatePath(index + 1)),
                reg: relativeAssetPath(triple.ftStateSvgPath(index + 1), triple.atMidRegStatePath(index + 1))
              }
            })
            addAnimatedTranscription({
              ftSvgDom: statedFtSvgDom,
              atPreparation: statedPreparation,
              atDom: statedAt,
              sourceAtDom: atSourceDom,
              sourceDtDom: dtSourceDom,
              dtDom: data.dtDom,
              layoutInfo,
              pageDimensions,
              triple,
              activeSvgLayers: state.svgLayers,
              logger
            })
            addCrossReferences(statedFtSvgDom, dtSourceDom)
            await writeData(new XMLSerializer().serializeToString(extractAnimatedTranscription(statedFtSvgDom)), triple.ftStateSvgPath(index + 1))
            if (media.includes('midi')) {
              await writeData(renderMidi(statedPreparation.editedAtDom, verovio, { choiceXPathQuery: './orig' }), triple.atMidOrigStatePath(index + 1))
              await writeData(renderMidi(statedPreparation.editedAtDom, verovio, { choiceXPathQuery: './reg' }), triple.atMidRegStatePath(index + 1))
            }
          }
          
        }
      }

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
    const preparedAt = prepareAtForFluidTranscript({
      atDom,
      dtDom,
      sourceDom: data.sourceDom,
      reconstructionDom: data.reconstructionDom,
      verovio,
      pageDimensions,
      layoutInfo,
      triple
    })
    data.atSvgDom = preparedAt.atSvgDom
    data.atRegSvgDom = preparedAt.atRegSvgDom
    data.editedAtDom = preparedAt.editedAtDom
    return preparedAt.atSvgDom
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

    .supplied *, .supplied {
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

/**
 * Retrieves renderable text stages in their declared @next order.
 * Each stage supplies the active genetic states explicitly through @follows.
 * The final text stage is represented by the primary FT and is therefore omitted.
 *
 * @param {Element} genDescWz - The genDesc element representing the writing zone.
 * @returns {{id: string, label: string, activeStates: string[], svgLayers: string[]}[]} Ordered non-final text stages.
 */
export const getGeneticStates = (genDescWz) => {
  const textStages = Array.from(genDescWz.querySelectorAll('genState[class~="#bw_textStufe"]'))
  const textStageById = new Map(textStages.map(stage => [stage.getAttribute('xml:id'), stage]).filter(([id]) => id))
  const writingLayerById = new Map(
    Array.from(genDescWz.querySelectorAll('genState[class~="#geneticOrder_writingLayerLevel"]'))
      .map(layer => [layer.getAttribute('xml:id'), layer])
      .filter(([id]) => id)
  )
  const referencedByNext = new Set(textStages.flatMap(stage => getStateReferences(stage, 'next')))
  const orderedStages = []
  const visitedIds = new Set()

  const appendStageChain = (stage) => {
    let current = stage
    while (current) {
      const id = current.getAttribute('xml:id')
      if (!id || visitedIds.has(id)) return

      visitedIds.add(id)
      orderedStages.push(current)
      const nextId = getStateReferences(current, 'next')[0]
      current = textStageById.get(nextId)
    }
  }

  textStages.filter(stage => !referencedByNext.has(stage.getAttribute('xml:id'))).forEach(appendStageChain)
  textStages.forEach(appendStageChain)

  return orderedStages
    .filter(stage => !String(stage.getAttribute('class')).split(/\s+/).includes('#bw_finalGeneticState'))
    .map(stage => ({
      id: stage.getAttribute('xml:id'),
      label: stage.getAttribute('label') || '',
      activeStates: getStateReferences(stage, 'follows'),
      svgLayers: getStateReferences(stage, 'follows')
        .map(stateId => writingLayerById.get(stateId)?.getAttribute('corresp')?.split('#').pop())
        .filter(Boolean)
    }))
}

const getStateReferences = (state, attribute) => (state.getAttribute(attribute) || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map(reference => reference.replace(/^.*#/, ''))

/**
 * Adds genetic-state relationship metadata to a fluid-transcript SVG.
 *
 * @param {Document|Element} ftSvgDom - Fluid-transcript SVG document or root element.
 * @param {{fileType: string, precedingStates: Object[], parentFile: string|null}} geneticInformation - Genetic-state relationship data.
 */
export const addGeneticInformation = (ftSvgDom, geneticInformation) => {
  const svgRoot = ftSvgDom.documentElement || ftSvgDom
  const existingMetadata = svgRoot.querySelector('metadata.geneticInformation')
  if (existingMetadata) existingMetadata.parentNode.removeChild(existingMetadata)

  const metadata = svgRoot.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'metadata')
  metadata.setAttribute('class', 'geneticInformation')
  metadata.textContent = JSON.stringify(geneticInformation)
  svgRoot.appendChild(metadata)
}

const relativeAssetPath = (fromFilePath, targetFilePath) => {
  return path.relative(path.dirname(fromFilePath), targetFilePath).split(path.sep).join('/')
}

/**
 * Retrieves a genetic state from an AT, using the array of state IDs that are necessary to implement to get to this genetic state
 * @param {Element} atDom - The AT DOM element.
 * @param {string[]} stateSet - The IDs of the genetic states that are active in what is to be retrieved.
 * @returns {Element} - The cloned AT DOM element with the genetic state applied.
 */
const retrieveGeneticStateFromAt = (atDom, stateSet) => {
  const resolveState = (node) => {
    const name = node.localName
    const refId = node.getAttribute('state')?.split('#')[1]
    if (!refId) return

    const parent = node.parentNode
    // based on https://github.com/BeethovensWerkstatt/api/blob/1320c961c87bcd7b62917013ab365602119d6915/source/xslt/module1/getState.xsl#L98-L120
    if (name === 'add' && stateSet.includes(refId)) {
      // replace the <add> element with its children
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node)
      }
      parent.removeChild(node)
    } else if (name === 'add' && !stateSet.includes(refId)) {
      // remove the <add> element and its children
      node.parentNode.removeChild(node)
    } else if (name === 'del' && stateSet.includes(refId)) {
      // preserve only children of <restore> elements inside the <del>
      const restores = Array.from(node.querySelectorAll('restore[state]')).flatMap(restore => Array.from(restore.childNodes))
      while (node.firstChild) {
        node.removeChild(node.firstChild)
      }
      restores.forEach(restore => {
        const restoreState = restore.getAttribute('state')?.split('#')[1]
        if (restoreState && stateSet.includes(restoreState)) {
          const children = Array.from(restore.childNodes)
          children.forEach(child => {
            parent.insertBefore(child, node)
          })
        }
      })
      parent.removeChild(node)
    } else if (name === 'del' && !stateSet.includes(refId)) {
      // do not remove content, since this is happening at a later state
    }
  }

  const outDom = atDom.cloneNode(true)
  const stateElements = outDom.querySelectorAll('add[state], del[state], restore[state]')
  stateElements.forEach(resolveState)

  return outDom
}

/**
 * Adds DT-to-facsimile-shape cross-references to the Fluid Transcript SVG.
 * @param {Element} ftSvgDom - The FT SVG DOM element.
 * @param {Element} dtDom - The source DT DOM element.
 * @returns {void} No return value.
 */
export const addCrossReferences = (ftSvgDom, dtDom) => {
  const shapePathsById = new Map(
    Array.from(ftSvgDom.querySelectorAll('.shapes path[id]'))
      .map(path => [path.getAttribute('id'), path])
      .filter(([id]) => id)
  )

  dtDom.querySelectorAll('[facs][xml\\:id]').forEach(dtElement => {
    const dtId = dtElement.getAttribute('xml:id')
    if (!dtId) return

    getFragmentIds(dtElement.getAttribute('facs')).forEach(shapeId => addReferenceId(shapePathsById.get(shapeId), dtId))
  })
}

const getFragmentIds = (references = '') => String(references)
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map(reference => reference.split('#')[1])
  .filter(Boolean)

const addReferenceId = (element, referenceId) => {
  if (!element) return

  const referenceIds = new Set(String(element.getAttribute('data-ref-id') || '').split(/\s+/).filter(Boolean))
  referenceIds.add(referenceId)
  element.setAttribute('data-ref-id', Array.from(referenceIds).join(' '))
}
