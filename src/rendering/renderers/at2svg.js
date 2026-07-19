import { prepareEditedAtDom } from '../../preparation/editedAnnotatedTranscripts.js'
import { prepareAtForVerovio } from '../../preparation/annotatedTranscripts.js'
import { renderContinuousAt } from '../verovioHandler.js'
import { writeData } from '../../filehandlers/filehandler.js'
import { shouldRender } from '../../utils/rendering.js'

/**
 * Render Annotated Transcript SVG.
 *
 * Renders the full AT from the edited AT (the same DOM used for the fluid
 * transcripts and the annotated MIDI), resolving `<choice>` elements to `./reg`.
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

    const editedAtDom = prepareEditedAtDom(data.atDom, data.dtDom)
    prepareAtForVerovio(editedAtDom)

    // this is necessary to reset Verovio's choiceXPathQuery – it will just add the new otherwise
    verovio.resetOptions()
    const atSvgString = renderContinuousAt(editedAtDom, verovio, 'annotated', pageDimensions, { choiceXPathQuery: './reg' })
    await writeData(atSvgString, atSvgPath)
    logger.info('Successfully rendered ' + atSvgPath)
  } else {
    logger.info('Skipping Annotated Transcript for ' + atSvgPath)
  }
}
