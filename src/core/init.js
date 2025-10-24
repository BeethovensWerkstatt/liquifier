import createVerovioModule from 'verovio/wasm'
import { VerovioToolkit } from 'verovio/esm'
import { checkThulemeierAvailability } from '../rendering/thulemeierHandler.js'

/**
 * Initialize all required tools for the liquifier application
 * Sets up Verovio rendering engine and checks Thulemeier availability
 * @param {Object} logger - Logger instance for reporting initialization status
 * @returns {Promise<Object>} Tools object containing verovio and thulemeierAvailable
 * @property {VerovioToolkit} verovio - Initialized Verovio toolkit instance
 * @property {boolean} thulemeierAvailable - Whether Thulemeier rendering is available
 */
export async function initializeTools (logger) {
  // Initialize Verovio WASM module and toolkit
  const VerovioModule = await createVerovioModule()
  const verovio = new VerovioToolkit(VerovioModule)

  // Check Thulemeier availability
  const thulemeierAvailable = await checkThulemeierAvailability()
  logger.info('Thulemeier rendering: ' + (thulemeierAvailable ? 'available' : 'not available'))

  return {
    verovio,
    thulemeierAvailable
  }
}
