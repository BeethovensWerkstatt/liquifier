import { getFilesObject, fetchData, loadContextDocumentDom } from '../filehandlers/filehandler.js'
import { getPageDimensions } from '../utils/utils.js'
import {
  renderAnnotatedTranscriptSvg,
  renderAnnotatedTranscriptMidi,
  renderEditedAnnotatedTranscript,
  renderDiplomaticTranscriptSvg,
  renderFluidTranscriptsSvg
} from '../rendering/renderers.js'

/**
 * Process a single file: fetch data and render all requested outputs
 *
 * @param {Object} params - Processing parameters
 * @param {string} params.fileName - Input file name/path
 * @param {Object} params.config - Configuration object
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<void>} Promise resolving to the computed result.
 */
async function processFile ({ fileName, config, verovio, logger, reconstructionDom = null }) {
  const triple = getFilesObject(fileName, config.inputDir, config.outputDir)
  logger.debug('File triple: ' + JSON.stringify(triple))

  if (!triple) {
    logger.warn('Could not create file triple for: ' + fileName)
    return
  }

  try {
    // Fetch source data
    const data = await fetchData(triple, config.verbose, config.inputDir, {
      contextDocument: config.contextDocument,
      reconstructionDom
    })
    logger.debug('Fetched data: ' + JSON.stringify(data))

    // Process the data
    await processData({ data, triple, config, verovio, logger })
  } catch (err) {
    logger.error('[ERROR]: Failed to process file ' + fileName + ': ' + err, err)
  }
}

/**
 * Process fetched data: render all requested transcript types and media
 *
 * @param {Object} params - Processing parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.config - Configuration object
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<void>} Promise resolving to the computed result.
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
  if (config.types.indexOf('fluidTranscripts') >= 0) {
    logger.info(triple.fsSvgPath + ' ' + triple.fsSvgDate)
  }
  if (config.types.indexOf('editedAt') >= 0) {
    logger.info(triple.editedAtPath + ' ' + triple.editedAtDate)
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

    // Edited Annotated Transcript rendering
    if (config.types.indexOf('editedAt') >= 0) {
      await renderEditedAnnotatedTranscript(renderParams)
    }

    // Diplomatic Transcript rendering
    if (config.types.indexOf('dt') >= 0) {
      if (config.media.indexOf('svg') >= 0) {
        await renderDiplomaticTranscriptSvg(renderParams)
      }
    }

    // Fluid Systems rendering
    if (config.types.indexOf('fluidTranscripts') >= 0) {
      if (config.media.indexOf('svg') >= 0) {
        await renderFluidTranscriptsSvg(renderParams)
      }
    }
  } catch (err) {
    logger.error('[ERROR]: Unable to process files for ' + triple.dtSvgPath + ': ' + err, err)
  }
}

/**
 * Process multiple files sequentially
 *
 * @param {Object} params - Processing parameters
 * @param {string[]} params.fileNames - Array of file names to process
 * @param {Object} params.config - Configuration object
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.logger - Logger instance
 * @returns {Promise<void>} Promise resolving to the computed result.
 */
export async function processFiles ({ fileNames, config, verovio, logger }) {
  if (fileNames.length === 0) {
    logger.info('No files to process')
    return
  }

  logger.debug('Processing files: ' + fileNames)

  let reconstructionDom = null
  if (config.contextDocument) {
    try {
      reconstructionDom = await loadContextDocumentDom(config.contextDocument, config.inputDir)
      logger.info(`Loaded context document: ${config.contextDocument}`)
    } catch (err) {
      logger.error('Failed to load context document: ' + err.message)
      return
    }
  }

  // Process files sequentially to avoid resource exhaustion
  for (const fileName of fileNames) {
    await processFile({ fileName, config, verovio, logger, reconstructionDom })
  }
}
