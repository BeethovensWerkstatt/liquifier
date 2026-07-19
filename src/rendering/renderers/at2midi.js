import { prepareEditedAtDom } from '../../preparation/editedAnnotatedTranscripts.js'
import { prepareAtForVerovio } from '../../preparation/annotatedTranscripts.js'
import { renderMidi } from '../verovioHandler.js'
import { writeData } from '../../filehandlers/filehandler.js'
import { shouldRender } from '../../utils/rendering.js'

/**
 * Render Annotated Transcript MIDI.
 *
 * Two MIDI files are generated from the edited AT (the same DOM used for the
 * fluid transcripts): one resolving `<choice>` elements to `./orig`, resembling
 * Fluid Transcript Phase 7 (supplements), and one resolving them to `./reg`,
 * resembling Fluid Transcript Phase 8 (interventions).
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
  const { atDate, atMidOrigPath, atMidOrigDate, atMidRegPath, atMidRegDate } = triple

  if (shouldRender(recreate, [atDate], atMidOrigDate) || shouldRender(recreate, [atDate], atMidRegDate)) {
    logger.info('Rendering Annotated MIDI for ' + atMidOrigPath + ' and ' + atMidRegPath + ' ...')

    const editedAtDom = prepareEditedAtDom(data.atDom, data.dtDom)
    prepareAtForVerovio(editedAtDom)

    if (shouldRender(recreate, [atDate], atMidOrigDate)) {
      const atMidOrigBuffer = renderMidi(editedAtDom, verovio, { choiceXPathQuery: './orig' })
      writeData(atMidOrigBuffer, atMidOrigPath)
    } else {
      logger.info('Skipping Annotated MIDI for ' + atMidOrigPath)
    }

    if (shouldRender(recreate, [atDate], atMidRegDate)) {
      const atMidRegBuffer = renderMidi(editedAtDom, verovio, { choiceXPathQuery: './reg' })
      writeData(atMidRegBuffer, atMidRegPath)
    } else {
      logger.info('Skipping Annotated MIDI for ' + atMidRegPath)
    }
  } else {
    logger.info('Skipping Annotated MIDI for ' + atMidOrigPath + ' and ' + atMidRegPath)
  }
}
