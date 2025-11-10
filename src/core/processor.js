import { getFilesObject, fetchData } from '../filehandlers/filehandler.js'
import { getPageDimensions } from '../utils/utils.js'
import {
  renderAnnotatedTranscriptSvg,
  renderAnnotatedTranscriptMidi,
  renderDiplomaticTranscriptSvg,
  renderFluidTranscriptSvg,
  renderFluidTranscriptHtml
} from '../rendering/renderers.js'

/**
 * Process a single file: fetch data and render all requested outputs
 * @param {Object} params - Processing parameters
 * @param {string} params.fileName - Input file name/path
 * @param {Object} params.config - Configuration object
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.logger - Logger instance
 */
async function processFile ({ fileName, config, verovio, logger }) {
  const triple = getFilesObject(fileName, config.inputDir, config.outputDir)
  logger.debug('File triple: ' + JSON.stringify(triple))

  if (!triple) {
    logger.warn('Could not create file triple for: ' + fileName)
    return
  }

  try {
    // Fetch source data
    const data = await fetchData(triple, config.verbose, config.inputDir)
    logger.debug('Fetched data: ' + JSON.stringify(data))

    // Process the data
    await processData({ data, triple, config, verovio, logger })
  } catch (err) {
    logger.error('[ERROR]: Failed to process file ' + fileName + ': ' + err, err)
  }
}

/**
 * Process fetched data: render all requested transcript types and media
 * @param {Object} params - Processing parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.config - Configuration object
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.logger - Logger instance
 */
async function processData ({ data, triple, config, verovio, logger }) {
  logger.debug('Processing triple: ' + JSON.stringify(triple))
  logger.debug('Processing data: ' + JSON.stringify(data))

  // Log file information
  if (config.types.indexOf('at') >= 0) {
    logger.info(triple.at + ' ' + triple.atDate + ' ' + triple.atSvgDate)
  }
  if (config.types.indexOf('dt') >= 0) {
    logger.info(triple.dt + ' ' + triple.dtDate + ' ' + triple.dtSvgDate)
  }
  if (config.types.indexOf('ft') >= 0) {
    logger.info(triple.ftSvgDate + ' ' + triple.ftSvgDate)
  }

  try {
    const pageDimensions = getPageDimensions(data.sourceDom, data.dtDom)
    logger.debug('Page dimensions: ' + JSON.stringify(pageDimensions))

    // Common rendering parameters
    const renderParams = { data, triple, verovio, pageDimensions, recreate: config.recreate, logger }

    // Annotated Transcript rendering
    if (config.types.indexOf('at') >= 0) {
      if (config.media.indexOf('svg') >= 0) {
        await renderAnnotatedTranscriptSvg(renderParams)
      }
      if (config.media.indexOf('midi') >= 0) {
        renderAnnotatedTranscriptMidi(renderParams)
      }
    }

    // Diplomatic Transcript rendering
    if (config.types.indexOf('dt') >= 0) {
      if (config.media.indexOf('svg') >= 0) {
        await renderDiplomaticTranscriptSvg(renderParams)
      }
    }

    // Fluid Transcript rendering
    if (config.types.indexOf('ft') >= 0) {
      if (config.media.indexOf('svg') >= 0) {
        renderFluidTranscriptSvg(renderParams)
      }
      if (config.media.indexOf('html') >= 0) {
        renderFluidTranscriptHtml(renderParams)
      }
    }
  } catch (err) {
    logger.error('[ERROR]: Unable to process files for ' + triple.dtSvgPath + ': ' + err, err)
  }
}

/**
 * Process multiple files sequentially
 * @param {Object} params - Processing parameters
 * @param {string[]} params.fileNames - Array of file names to process
 * @param {Object} params.config - Configuration object
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.logger - Logger instance
 */
export async function processFiles ({ fileNames, config, verovio, logger }) {
  if (fileNames.length === 0) {
    logger.info('No files to process')
    return
  }

  logger.debug('Processing files: ' + fileNames)

  // Process files sequentially to avoid resource exhaustion
  for (const fileName of fileNames) {
    await processFile({ fileName, config, verovio, logger })
  }
}
