import minimist from 'minimist'

/**
 * Parse command-line arguments into a structured configuration object
 *
 * @property {boolean} quiet - Suppress normal output
 * @property {boolean} verbose - Show detailed debug output
 * @property {string[]} types - Transcript types to process (at, dt, ft, editedAt, fluidTranscripts)
 * @property {string[]} media - Media types to generate (svg, midi, html)
 * @property {string} inputDir - Base directory for input files
 * @property {string} outputDir - Base directory for output files
 * @property {string|null} contextDocument - Optional context document identifier (e.g., Notirungsbuch_K)
 * @property {boolean} recreate - Force recreation of all files
 * @property {string[]} fileNames - List of files to process
 * @param {string[]} argv - Process argv array (e.g., process.argv.slice(2))
 * @returns {Object} Configuration object with parsed and normalized values
 */
export function parseCliArguments (argv) {
  const args = minimist(argv, {
    boolean: ['q', 'v', 'recreate'],
    string: ['types', 'media', 'input-dir', 'i', 'output-dir', 'o', 'context-document']
  })

  // Extract flags
  const quiet = args.q || false
  const verbose = (args.v || false) && !quiet

  // Parse types and media with defaults
  const parsedTypes = args.types?.split(',') || ['at', 'dt', 'ft', 'editedAt', 'fluidTranscripts']
  const types = [...new Set(parsedTypes.map(type => type === 'eat' ? 'editedAt' : type))] || ['editedAt', 'at', 'dt', 'fluidTranscripts']
  const media = args.media?.split(',') || ['svg', 'midi', 'html']

  // Directory paths with defaults
  const inputDir = args['input-dir'] || args.i || './'
  const outputDir = args['output-dir'] || args.o || './cache'
  const contextDocument = args['context-document'] || null

  // Other flags
  const recreate = args.recreate || false

  // File names from positional arguments or environment variable
  const fileNames = args._?.length > 0
    ? args._
    : (process.env.fileNames ? process.env.fileNames.split(',') : [])

  return {
    quiet,
    verbose,
    types,
    media,
    inputDir,
    outputDir,
    contextDocument,
    recreate,
    fileNames
  }
}
