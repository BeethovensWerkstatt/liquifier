import { prepareEditedAtDom } from '../../preparation/editedAnnotatedTranscripts.js'
import { serializeXmlCanonical } from '../../utils/xml.js'
import { writeData } from '../../filehandlers/filehandler.js'
import { shouldRender } from '../../utils/rendering.js'

/**
 * Render Edited Annotated Transcript (MEI XML).
 *
 * @param {Object} params - Rendering parameters.
 * @param {Object} params.data - Source data (atDom, dtDom, sourceDom).
 * @param {Object} params.triple - File paths and dates.
 * @param {boolean} params.recreate - Force recreation flag.
 * @param {Object} params.logger - Logger instance.
 * @returns {Promise<void>} Promise resolving when rendering completes.
 */
export async function renderEditedAnnotatedTranscript ({ data, triple, recreate, logger }) {
  const { atDate, editedAtPath, editedAtDate } = triple

  if (shouldRender(recreate, [atDate], editedAtDate)) {
    logger.info('Rendering Edited Annotated Transcript for ' + editedAtPath + ' ...')

    const editedAtDom = prepareEditedAtDom(data.atDom, data.dtDom)
    const editedAtString = serializeXmlCanonical(editedAtDom)

    await writeData(editedAtString, editedAtPath)
    logger.info('Successfully rendered ' + editedAtPath)
  } else {
    logger.info('Skipping Edited Annotated Transcript for ' + editedAtPath)
  }
}
