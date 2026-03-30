import { prepareAtDomForRendering } from '../preparation/annotatedTranscripts.js'
import { prepareEditedAtDom } from '../preparation/editedAnnotatedTranscripts.js'
import { prepareDtForThulemeier } from '../preparation/mei.js'
import { serializeXmlCanonical } from '../utils/xml.js'
import { renderContinuousAt, renderSystemBasedAt, renderMidi } from './verovioHandler.js'
import { renderDiplomaticTranscript } from './thulemeierHandler.js'
import { writeData } from '../filehandlers/filehandler.js'
import { generateFluidTranscription } from '../preparation/fluidTranscripts.js'
import { JSDOM } from 'jsdom'
import path from 'path'
import fs from 'fs'

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
 * Render Edited Annotated Transcript (MEI XML)
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 */
export async function renderEditedAnnotatedTranscript ({ data, triple, recreate, logger }) {
  const { atDate, editedAtPath, editedAtDate } = triple

  if (shouldRender(recreate, [atDate], editedAtDate)) {
    logger.info('Rendering Edited Annotated Transcript for ' + editedAtPath + ' ...')

    const editedAtDom = prepareEditedAtDom(data.atDom)
    const editedAtString = serializeXmlCanonical(editedAtDom)

    await writeData(editedAtString, editedAtPath)
    logger.info('Successfully rendered ' + editedAtPath)
  } else {
    logger.info('Skipping Edited Annotated Transcript for ' + editedAtPath)
  }
}

/**
 * Render Annotated Transcript SVG
 * Renders both the full continuous AT and individual system ATs
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 */
export async function renderAnnotatedTranscriptSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, atSvgPath, atSvgDate } = triple

  if (shouldRender(recreate, [atDate], atSvgDate)) {
    logger.info('Rendering Annotated Transcript for ' + atSvgPath + ' ...')
    const atOutDom = prepareAtDomForRendering(data.atDom, data.dtDom, pageDimensions)

    // Render full continuous AT
    const atSvgString = renderContinuousAt(atOutDom, verovio, 'annotated', pageDimensions)
    await writeData(atSvgString, atSvgPath)
    logger.info('Successfully rendered ' + atSvgPath)

    // Render individual system ATs
    try {
      const systemSvgs = renderSystemBasedAt(atOutDom, verovio, pageDimensions)

      if (systemSvgs.length > 0) {
        logger.info(`Rendering ${systemSvgs.length} individual AT systems...`)

        systemSvgs.forEach(async ({ systemId, svg }) => {
          if (systemId && svg) {
            // Generate system-specific filename
            // Pattern: {source}_{page}_{wz}_sys{systemId}_at.svg
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
      await writeData(dtSvgString, dtSvgPath)
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
            // Thulemeier uses 1mm = 90 units
            // 20mm = 20 * 90 = 1800 units
            const systemSvgString = await renderDiplomaticTranscript(preparedDt, {
              mode: 'singleSystem',
              systemId,
              systemMargin: 1800 // 20mm margin around system content
            })

            await writeData(systemSvgString, systemSvgPath)
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
 * Generates fluid transcriptions for each system pair (DT + AT)
 * @param {Object} params - Rendering parameters
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom)
 * @param {Object} params.triple - File paths and dates
 * @param {Object} params.verovio - Verovio toolkit instance
 * @param {Object} params.pageDimensions - Page dimensions for rendering
 * @param {boolean} params.recreate - Force recreation flag
 * @param {Object} params.logger - Logger instance
 */
export function renderFluidTranscriptSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, dtDate, ftSvgPath, ftSvgDate, atSvgPath } = triple

  if (shouldRender(recreate, [atDate, dtDate], ftSvgDate)) {
    logger.info('Rendering Fluid Transcripts for system pairs...')

    try {
      const dom = new JSDOM()
      const parser = new dom.window.DOMParser()
      const serializer = new dom.window.XMLSerializer()

      // Find system SVG files
      const atSvgDir = path.dirname(atSvgPath)
      const baseFilename = path.basename(atSvgPath).replace('_at.svg', '')

      // Find all AT system files in the directory
      const files = fs.readdirSync(atSvgDir)
      const atSystemFiles = files.filter(f =>
        f.startsWith(baseFilename) &&
        f.includes('_sys') &&
        f.endsWith('_at.svg')
      )

      if (atSystemFiles.length === 0) {
        logger.warn('No AT system files found for fluid transcription generation')
        return
      }

      logger.info(`Found ${atSystemFiles.length} system pairs to process`)

      let successCount = 0
      let errorCount = 0

      // Process each system
      atSystemFiles.forEach(atSystemFile => {
        try {
          // Extract system ID from filename
          const systemIdMatch = atSystemFile.match(/_sys([^_]+)_at\.svg$/)
          if (!systemIdMatch) {
            logger.warn(`Could not extract system ID from ${atSystemFile}`)
            return
          }
          const systemId = systemIdMatch[1]

          // Build corresponding DT and FT paths
          const atSystemPath = path.join(atSvgDir, atSystemFile)
          const dtSystemPath = atSystemPath
            .replace('/annotatedTranscripts/', '/diplomaticTranscripts/')
            .replace('_at.svg', '_dt.svg')
          const ftSystemPath = atSystemPath
            .replace('/annotatedTranscripts/', '/fluidTranscripts/')
            .replace('_at.svg', '_ft.svg')

          // Check if DT system file exists
          if (!fs.existsSync(dtSystemPath)) {
            logger.warn(`DT system file not found: ${dtSystemPath}`)
            errorCount++
            return
          }

          // Read SVG files
          const atSystemSvgString = fs.readFileSync(atSystemPath, 'utf8')
          const dtSystemSvgString = fs.readFileSync(dtSystemPath, 'utf8')

          const atSystemSvg = parser.parseFromString(atSystemSvgString, 'image/svg+xml')
          const dtSystemSvg = parser.parseFromString(dtSystemSvgString, 'image/svg+xml')

          // Generate fluid transcription
          const ftSvg = generateFluidTranscription(dtSystemSvg, atSystemSvg, data.atDom, logger) // data.dtDom?

          // Serialize and save
          const ftSvgString = serializer.serializeToString(ftSvg)

          // Create directory if it doesn't exist
          const ftDir = path.dirname(ftSystemPath)
          if (!fs.existsSync(ftDir)) {
            fs.mkdirSync(ftDir, { recursive: true })
          }

          writeData(ftSvgString, ftSystemPath)
          logger.debug(`  Generated FT for system ${systemId}`)
          successCount++
        } catch (err) {
          logger.error(`Error processing system: ${err.message}`)
          errorCount++
        }
      })

      logger.info(`Fluid Transcript generation complete: ${successCount} succeeded, ${errorCount} failed`)
    } catch (err) {
      logger.error(`Error rendering fluid transcripts: ${err.message}`)
    }
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
