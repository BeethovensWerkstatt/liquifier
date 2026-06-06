import { JSDOM } from 'jsdom'

import { addSbIndicators, prepareAtDomForRendering, addSystemLabelBlocks } from '../../../preparation/annotatedTranscripts.js'
import { prepareEditedAtDom } from '../../../preparation/editedAnnotatedTranscripts.js'
import { generateFluidTranscription, retrievePositionalDataForFluidSystems } from '../../../preparation/fluidTranscripts.js'
import { writeData } from '../../../filehandlers/filehandler.js'
import { shouldRender } from '../../../utils/rendering.js'
import { renderContinuousAt } from '../../verovioHandler.js'
import { buildCurrentDtSvgForFluidTranscripts } from '../dt2svg.js'

import { extractChoiceVerticalOffsets } from './choiceOffsets.js'
import { writeFluidTranscriptsErrorLog } from './errorLog.js'
import {
  anchorFluidTranscriptsToAtLeft,
  resolveFluidTranscriptsOverlayContext,
  injectFluidTranscriptsFacsimileLayers,
  logFluidTranscriptsDimensionDiagnostics
} from './overlay.js'
import { resolveMatchedStaffLineContextForCurrentDt } from './staffLineContext.js'

/**
 * Render Fluid Transcripts SVG (coordinated page-level pipeline).
 *
 * @param {Object} params - Rendering parameters.
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom, reconstructionDom).
 * @param {Object} params.triple - File paths and dates.
 * @param {Object} params.verovio - Verovio toolkit instance.
 * @param {Object} params.pageDimensions - Page dimensions for rendering.
 * @param {boolean} params.recreate - Force recreation flag.
 * @param {Object} params.logger - Logger instance.
 * @returns {Promise<void>} Promise resolving when rendering completes.
 */
export async function renderFluidTranscriptsSvg ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, dtDate, fsSvgPath, fsSvgDate } = triple
  const systemLabelIssues = []

  if (!shouldRender(recreate, [atDate, dtDate], fsSvgDate)) {
    logger.info('Skipping Fluid Transcripts for ' + fsSvgPath)
    return
  }

  logger.info('Rendering Fluid Transcripts for system pairs...')

  try {
    const dom = new JSDOM()
    const parser = new dom.window.DOMParser()
    const serializer = new dom.window.XMLSerializer()

    const dtSvg = await buildCurrentDtSvgForFluidTranscripts({
      dtDom: data.dtDom,
      sourceDom: data.sourceDom,
      parser,
      dtRenderOptions: {
        mode: 'fullPage'
      }
    })

    // Step 1: compute per-element vertical offsets from edited AT choice rendering.
    const editedAtDom = prepareEditedAtDom(data.atDom, data.dtDom)
    const editedAtWithSbIndicators = addSbIndicators(null, editedAtDom.cloneNode(true))
    const editedRenderDom = prepareAtDomForRendering(editedAtWithSbIndicators, data.dtDom, pageDimensions)

    const regAtSvgString = renderContinuousAt(editedRenderDom, verovio, 'annotated', pageDimensions, {
      choiceXPathQuery: ['./reg']
    })
    const origAtSvgString = renderContinuousAt(editedRenderDom, verovio, 'annotated', pageDimensions, {
      choiceXPathQuery: ['./orig']
    })

    const regAtSvg = parser.parseFromString(regAtSvgString, 'image/svg+xml')
    const origAtSvg = parser.parseFromString(origAtSvgString, 'image/svg+xml')
    const choiceVerticalOffsets = extractChoiceVerticalOffsets(regAtSvg, origAtSvg, editedAtDom)

    // Step 2: resolve strict AT block -> DT system context and validate DT SVG coverage.
    const staffLineContext = resolveMatchedStaffLineContextForCurrentDt(data.atDom, data.dtDom, logger)
    if (staffLineContext.errorMessage) {
      throw new Error(staffLineContext.errorMessage)
    }

    const dtSystemIdsInSvg = new Set(
      Array.from(dtSvg.querySelectorAll('g.system:not(.bounding-box)[data-id]'))
        .map(system => system.getAttribute('data-id'))
        .filter(Boolean)
    )

    const missingSvgSystems = Array.from(staffLineContext.blockToDtSystemId.values())
      .filter(systemId => !dtSystemIdsInSvg.has(systemId))

    if (missingSvgSystems.length > 0) {
      const missingUnique = Array.from(new Set(missingSvgSystems))
      const message = `[renderFluidTranscriptsSvg] AT sb@corresp references DT systems that are missing in DT SVG: ${missingUnique.join(', ')}.`
      logger.warn(message)
      throw new Error(message)
    }

    // Step 3: render AT base geometry and inject system labels.
    const atWithSbIndicators = addSbIndicators(null, data.atDom.cloneNode(true))
    const renderDom = prepareAtDomForRendering(atWithSbIndicators, data.dtDom, pageDimensions)
    const atSvgString = renderContinuousAt(renderDom, verovio, 'annotated', pageDimensions)
    const atSvg = parser.parseFromString(atSvgString, 'image/svg+xml')

    const atSvgWithSystemLabels = addSystemLabelBlocks(atSvg, data.atDom, data.dtDom, data.sourceDom, data.reconstructionDom, triple, {
      onIssue: issue => {
        systemLabelIssues.push(issue)
      }
    })

    // Step 4: overlay context, diagnostics, and positional data.
    const overlayContext = resolveFluidTranscriptsOverlayContext({
      dtDom: data.dtDom,
      sourceDom: data.sourceDom,
      triple
    })

    logFluidTranscriptsDimensionDiagnostics({
      dtSvg,
      overlayContext,
      logger
    })

    const positionalData = retrievePositionalDataForFluidSystems({
      dtSvg,
      atSvg: atSvgWithSystemLabels,
      atMei: data.atDom,
      dtMei: data.dtDom,
      sourceMei: data.sourceDom,
      reconstructionMei: data.reconstructionDom,
      logger,
      overlayContext
    })

    // Step 5: synthesize fluid transcript SVG, align viewport, and inject overlays.
    const fluidSvg = generateFluidTranscription(dtSvg, atSvgWithSystemLabels, data.atDom, data.sourceDom, logger, {
      stateModel: 'fluidSystems',
      currentDtReference: triple.dtFullPath || triple.dt || '',
      choiceVerticalOffsets,
      matchedStaffLineBlocks: staffLineContext.matchedStaffLineBlocks,
      blockToDtSystemId: staffLineContext.blockToDtSystemId
    })

    anchorFluidTranscriptsToAtLeft(fluidSvg)

    if (overlayContext) {
      injectFluidTranscriptsFacsimileLayers({
        fluidSvg,
        overlayContext,
        positionalData,
        dtDom: data.dtDom,
        sourceDom: data.sourceDom,
        parser,
        logger
      })
    } else {
      logger.warn('[renderFluidTranscriptsSvg] Could not resolve facsimile/shapes overlay context; writing transcription-only output.')
    }

    // Step 6: write output and issue logs.
    const fluidSvgString = serializer.serializeToString(fluidSvg)
    await writeData(fluidSvgString, fsSvgPath)

    if (systemLabelIssues.length > 0) {
      const warningMessage = `[renderFluidTranscriptsSvg] Non-fatal system label issues detected (${systemLabelIssues.length}); see fluid transcripts error log for details.`
      logger.warn(warningMessage)
      try {
        await writeFluidTranscriptsErrorLog({
          triple,
          error: warningMessage,
          issues: systemLabelIssues,
          severity: 'warning'
        })
      } catch (logErr) {
        logger.error(`Error writing fluid transcripts warning log: ${logErr.message}`)
      }
    }

    logger.info('Fluid Transcripts generation complete: 1 succeeded, 0 failed')
  } catch (err) {
    logger.error(`Error rendering fluid transcripts: ${err.message}`)
    try {
      await writeFluidTranscriptsErrorLog({ triple, error: err, issues: systemLabelIssues, severity: 'error' })
    } catch (logErr) {
      logger.error(`Error writing fluid transcripts error log: ${logErr.message}`)
    }
  }
}
