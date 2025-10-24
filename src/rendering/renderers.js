import { prepareAtDomForRendering } from '../preparation/annotatedTranscripts.js'
import { prepareDtForThulemeier } from '../preparation/mei.js'
import { renderContinuousAt, renderMidi } from './verovioHandler.js'
import { renderDiplomaticTranscript } from './thulemeierHandler.js'
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
    const atSvgString = renderContinuousAt(atOutDom, verovio, 'annotated', pageDimensions)
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
      writeData(dtSvgString, dtSvgPath)
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
            // systemMargin: 90 = 1cm at 90dpi (configurable)
            const systemSvgString = await renderDiplomaticTranscript(preparedDt, {
              mode: 'singleSystem',
              systemId,
              systemMargin: 270 // 3cm margin around system content
            })

            writeData(systemSvgString, systemSvgPath)
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
