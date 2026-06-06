import { prepareDtForThulemeier } from '../../preparation/mei.js'
import { renderDiplomaticTranscript } from '../thulemeierHandler.js'
import { writeData } from '../../filehandlers/filehandler.js'
import { shouldRender } from '../../utils/rendering.js'

/**
 * Render Diplomatic Transcript SVG.
 * Renders both the full DT and individual system files.
 *
 * @param {Object} params - Rendering parameters.
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom).
 * @param {Object} params.triple - File paths and dates.
 * @param {Object} params.verovio - Verovio toolkit instance.
 * @param {Object} params.pageDimensions - Page dimensions for rendering.
 * @param {boolean} params.recreate - Force recreation flag.
 * @param {Object} params.logger - Logger instance.
 * @returns {Promise<*>} Promise resolving to the computed result.
 */
export async function renderDiplomaticTranscriptSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { dtDate, dtSvgPath, dtSvgDate, sourceFullPath } = triple

  if (shouldRender(recreate, [dtDate], dtSvgDate)) {
    logger.info('Rendering Diplomatic Transcript for ' + dtSvgPath + ' ...')

    try {
      const preparedDt = prepareDtForThulemeier({
        dtDom: data.dtDom,
        sourceDom: data.sourceDom
      })

      if (!preparedDt) {
        logger.warn('Could not prepare diplomatic transcript - skipping ' + dtSvgPath)
        return
      }

      const dtSvgString = await renderDiplomaticTranscript(preparedDt)
      await writeData(dtSvgString, dtSvgPath)
      logger.info('Successfully rendered ' + dtSvgPath)

      const systems = data.dtDom.querySelectorAll('draft > system, draft > bw\\:system')
      const systemIds = Array.from(systems).map(s => s.getAttribute('xml:id')).filter(id => id)

      if (systemIds.length > 0) {
        logger.info(`Rendering ${systemIds.length} individual systems...`)

        for (const systemId of systemIds) {
          try {
            const systemSvgPath = dtSvgPath.replace('_dt.svg', `_sys${systemId}_dt.svg`)

            const systemSvgString = await renderDiplomaticTranscript(preparedDt, {
              mode: 'singleSystem',
              systemId,
              systemMargin: 1800
            })

            await writeData(systemSvgString, systemSvgPath)
            logger.debug(`  Rendered system ${systemId}`)
          } catch (systemError) {
            throw new Error(`Failed to render system ${systemId}: ${systemError.message}`)
          }
        }

        logger.info(`Successfully rendered all ${systemIds.length} systems`)
      }
    } catch (error) {
      logger.error('Error rendering diplomatic transcript: ' + error.message)
      logger.debug('Source file: ' + sourceFullPath)
      throw error
    }
  } else {
    logger.info('Skipping Diplomatic Transcript for ' + dtSvgPath)
  }
}

/**
 * Builds DT SVG from current DT/source DOM inputs for fluid transcript generation.
 *
 * @param {Object} params - Structured parameter bundle.
 * @param {Document} params.dtDom - Diplomatic transcript MEI DOM.
 * @param {Document} params.sourceDom - Source MEI DOM.
 * @param {DOMParser} params.parser - XML parser used to build SVG DOM.
 * @param {Function} [params.prepareDt] - Optional DI hook for DT preparation.
 * @param {Function} [params.renderDt] - Optional DI hook for DT SVG rendering.
 * @param {Object} [params.dtRenderOptions] - Optional Thulemeier render options.
 * @returns {Promise<SVGElement|Document>} Parsed DT SVG document.
 */
export async function buildCurrentDtSvgForFluidTranscripts ({ dtDom, sourceDom, parser, prepareDt = prepareDtForThulemeier, renderDt = renderDiplomaticTranscript, dtRenderOptions = {} }) {
  const preparedDt = prepareDt({ dtDom, sourceDom })
  if (!preparedDt) {
    throw new Error('[renderFluidTranscriptsSvg] Could not prepare diplomatic transcript for fluid transcripts generation.')
  }

  const dtSvgString = await renderDt(preparedDt, dtRenderOptions)
  return parser.parseFromString(dtSvgString, 'image/svg+xml')
}
