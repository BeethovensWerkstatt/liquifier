import { render, version } from 'thulemeier'
import { JSDOM } from 'jsdom'

/**
 * Render a diplomatic transcript using Thulemeier
 * This function renders a single draft (writing zone) from a prepared MEI document
 * that has been merged with source information using prepareDtForThulemeier.
 *
 * @param {Document} meiDoc - The prepared MEI document to render (output of prepareDtForThulemeier)
 * @param {Object} options - Rendering options
 * @returns {Promise<string>} The rendered SVG as a string
 */
export async function renderDiplomaticTranscript (meiDoc, options = {}) {
  try {
    // Find the draft ID if not provided
    let draftId = options.draftId
    if (!draftId) {
      const draft = meiDoc.querySelector('draft')
      if (!draft) {
        throw new Error('No draft element found in MEI document')
      }
      draftId = draft.getAttribute('xml:id')
      if (!draftId) {
        throw new Error('Draft element has no xml:id attribute')
      }
    }

    // Determine rendering mode (default to singleDraftStandalone for full DT)
    const mode = options.mode || 'singleDraftStandalone'

    // Build render options
    const renderOptions = {
      mode,
      id: draftId,
      ...options
    }

    // Use Thulemeier to render the MEI document
    const svg = await render(meiDoc, renderOptions)

    // Convert to string if needed
    if (typeof svg === 'string') {
      return svg
    } else if (svg && svg.outerHTML) {
      return svg.outerHTML
    } else {
      // Use JSDOM serializer as fallback
      const dom = new JSDOM()
      const serializer = new dom.window.XMLSerializer()
      return serializer.serializeToString(svg)
    }
  } catch (error) {
    console.error('Error rendering diplomatic transcript with Thulemeier:', error)
    throw error
  }
}

/**
 * Render an empty page with rastrums using Thulemeier
 *
 * @param {Document} meiDoc - The MEI document containing page structure
 * @param {Object} options - Rendering options
 * @returns {Promise<string>} The rendered SVG as a string
 */
export async function renderEmptyPage (meiDoc, options = {}) {
  try {
    const defaultOptions = {
      mode: 'emptyPage',
      baseScaling: 90,
      ...options
    }

    const svg = await render(meiDoc, defaultOptions)

    // Convert to string
    if (typeof svg === 'string') {
      return svg
    } else if (svg && svg.outerHTML) {
      return svg.outerHTML
    } else {
      const dom = new JSDOM()
      const serializer = new dom.window.XMLSerializer()
      return serializer.serializeToString(svg)
    }
  } catch (error) {
    console.error('Error rendering empty page with Thulemeier:', error)
    throw error
  }
}

/**
 * Check if Thulemeier is available and working
 *
 * @returns {Promise<boolean>} True if Thulemeier is working
 */
export async function checkThulemeierAvailability () {
  try {
    // Try to import and use Thulemeier
    const { render } = await import('thulemeier')
    return typeof render === 'function'
  } catch (error) {
    console.warn('Thulemeier is not available:', error.message)
    return false
  }
}

/**
 * Resolve the Thulemeier version string.
 *
 * @returns {Promise<string>} Thulemeier version string or 'unknown' when unavailable
 */
export async function getThulemeierVersion () {
  try {
    const resolved = version()
    if (resolved && typeof resolved.then === 'function') {
      return String(await resolved)
    }
    return String(resolved)
  } catch (error) {
    console.warn('Could not determine Thulemeier version:', error.message)
    return 'unknown'
  }
}
