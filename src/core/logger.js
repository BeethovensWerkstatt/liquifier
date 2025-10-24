/**
 * Create a logger instance with configurable output levels
 * @param {boolean} quiet - If true, suppresses info and debug messages
 * @param {boolean} verbose - If true, enables debug messages
 * @returns {Object} Logger instance with info, debug, warn, and error methods
 */
export function createLogger (quiet = false, verbose = false) {
  return {
    /**
     * Log informational messages (suppressed in quiet mode)
     */
    info: (msg) => {
      if (!quiet) {
        console.log(msg)
      }
    },

    /**
     * Log debug messages (only shown in verbose mode)
     */
    debug: (msg) => {
      if (verbose && !quiet) {
        console.log(msg)
      }
    },

    /**
     * Log warning messages (always shown)
     */
    warn: (msg) => {
      console.warn(msg)
    },

    /**
     * Log error messages (always shown)
     */
    error: (msg, err) => {
      if (err) {
        console.error(msg, err)
      } else {
        console.error(msg)
      }
    }
  }
}
