import { addSbIndicators, prepareAtDomForRendering } from '../../preparation/annotatedTranscripts.js'
import { renderContinuousAt, renderSystemBasedAt } from '../verovioHandler.js'
import { writeData } from '../../filehandlers/filehandler.js'
import { shouldRender } from '../../utils/rendering.js'

/**
 * Render Annotated Transcript SVG.
 * Renders both the full continuous AT and individual system ATs.
 *
 * @param {Object} params - Rendering parameters.
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom).
 * @param {Object} params.triple - File paths and dates.
 * @param {Object} params.verovio - Verovio toolkit instance.
 * @param {Object} params.pageDimensions - Page dimensions for rendering.
 * @param {boolean} params.recreate - Force recreation flag.
 * @param {Object} params.logger - Logger instance.
 * @returns {Promise<void>} Promise resolving when rendering completes.
 */
export async function renderAnnotatedTranscriptSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, atSvgPath, atSvgDate } = triple

  if (shouldRender(recreate, [atDate], atSvgDate)) {
    logger.info('Rendering Annotated Transcript for ' + atSvgPath + ' ...')
    const atWithSbIndicators = addSbIndicators(data.atDom.cloneNode(true))
    const atOutDom = prepareAtDomForRendering(atWithSbIndicators, data.dtDom, pageDimensions)

    const atSvgString = renderContinuousAt(atOutDom, verovio, 'annotated', pageDimensions)
    await writeData(atSvgString, atSvgPath)
    logger.info('Successfully rendered ' + atSvgPath)

    try {
      const systemSvgs = renderSystemBasedAt(atOutDom, verovio, pageDimensions)

      if (systemSvgs.length > 0) {
        logger.info(`Rendering ${systemSvgs.length} individual AT systems...`)

        systemSvgs.forEach(async ({ systemId, svg }) => {
          if (systemId && svg) {
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
