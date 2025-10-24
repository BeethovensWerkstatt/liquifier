import { prepareAtDomForRendering } from '../preparation/annotatedTranscripts.js'
import { renderData, renderMidi } from './verovioHandler.js'
import { writeData } from '../filehandlers/filehandler.js'

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
 * Render Annotated Transcript SVG
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 */
export function renderAnnotatedTranscriptSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, atSvgPath, atSvgDate } = triple

  if (shouldRender(recreate, [atDate], atSvgDate)) {
    logger.info('Rendering Annotated Transcript for ' + atSvgPath + ' ...')
    const atOutDom = prepareAtDomForRendering(data.atDom, data.dtDom, pageDimensions)
    const atSvgString = renderData(atOutDom, verovio, 'annotated', pageDimensions)
    writeData(atSvgString, atSvgPath)
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
    const atOutDom = prepareAtDomForRendering(data.atDom, data.dtDom, pageDimensions)
    const atMidBuffer = renderMidi(atOutDom, verovio)
    writeData(atMidBuffer, atMidPath)
  } else {
    logger.info('Skipping Annotated MIDI for ' + atMidPath)
  }
}

/**
 * Render Diplomatic Transcript SVG
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 */
export function renderDiplomaticTranscriptSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { dtDate, dtSvgPath, dtSvgDate } = triple

  if (shouldRender(recreate, [dtDate], dtSvgDate)) {
    logger.info('Rendering Diplomatic Transcript for ' + dtSvgPath + ' ...')
    logger.info('TODO create diplomatic SVG ' + dtSvgPath)
    // TODO: Implement diplomatic rendering
    // const dtOutDom = prepareDtForRendering(data, pageDimensions)
    // const dtSvgString = renderData(dtOutDom, verovio, 'diplomatic', pageDimensions)
    // writeData(dtSvgString, dtSvgPath)
  } else {
    logger.info('Skipping Diplomatic Transcript for ' + dtSvgPath)
  }
}

/**
 * Render Fluid Transcript SVG
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
    logger.info('Rendering Fluid Transcript for ' + ftSvgPath + ' ...')
    logger.info('TODO create fluid SVG ' + ftSvgPath)
    // TODO: Implement fluid SVG rendering
    // const ftSvgDom = generateFluidTranscription({ atSvgDom, dtSvgDom, atOutDom, dtOutDom, sourceDom: data.sourceDom })
    // writeData(serializer.serializeToString(ftSvgDom), ftSvgPath)
  } else {
    logger.info('Skipping Fluid Transcript for ' + ftSvgPath)
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
