import { render } from 'thulemeier'
import { JSDOM } from 'jsdom'

/**
 * Thulemeier integration for Liquifier
 * Provides diplomatic transcript rendering capabilities using the Thulemeier library
 */

/**
 * Render a diplomatic transcript using Thulemeier
 * @param {Document} meiDoc - The MEI document to render
 * @param {Object} options - Rendering options
 * @returns {Promise<string>} The rendered SVG as a string
 */
export async function renderDiplomaticTranscript (meiDoc, options = {}) {
  try {
    // Default options for diplomatic transcript rendering
    const defaultOptions = {
      mode: 'full-page',
      baseScaling: 90,
      ...options
    }

    // Use Thulemeier to render the MEI document
    const svg = await render(meiDoc, defaultOptions)

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
