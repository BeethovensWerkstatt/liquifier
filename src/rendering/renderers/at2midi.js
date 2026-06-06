import { addSbIndicators, prepareAtDomForRendering } from '../../preparation/annotatedTranscripts.js'
import { renderMidi } from '../verovioHandler.js'
import { writeData } from '../../filehandlers/filehandler.js'
import { shouldRender } from '../../utils/rendering.js'

/**
 * Render Annotated Transcript MIDI.
 *
 * @param {Object} params - Rendering parameters.
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom).
 * @param {Object} params.triple - File paths and dates.
 * @param {Object} params.verovio - Verovio toolkit instance.
 * @param {Object} params.pageDimensions - Page dimensions for rendering.
 * @param {boolean} params.recreate - Force recreation flag.
 * @param {Object} params.logger - Logger instance.
 * @returns {void} No return value.
 */
export function renderAnnotatedTranscriptMidi ({ data, triple, verovio, pageDimensions, recreate, logger }) {
  const { atDate, atMidPath, atMidDate } = triple

  if (shouldRender(recreate, [atDate], atMidDate)) {
    logger.info('Rendering Annotated MIDI for ' + atMidPath + ' ...')
    const atWithSbIndicators = addSbIndicators(null, data.atDom.cloneNode(true))
    const atOutDom = prepareAtDomForRendering(atWithSbIndicators, data.dtDom, pageDimensions)
    const atMidBuffer = renderMidi(atOutDom, verovio)
    writeData(atMidBuffer, atMidPath)
  } else {
    logger.info('Skipping Annotated MIDI for ' + atMidPath)
  }
}
