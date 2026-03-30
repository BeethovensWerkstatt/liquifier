import minimist from 'minimist'

/**
 * Parse command-line arguments into a structured configuration object
 * @param {string[]} argv - Process argv array (e.g., process.argv.slice(2))
 * @returns {Object} Configuration object with parsed and normalized values
 * @property {boolean} quiet - Suppress normal output
 * @property {boolean} verbose - Show detailed debug output
 * @property {string[]} types - Transcript types to process (at, dt, ft, editedAt)
 * @property {string[]} media - Media types to generate (svg, midi, html)
 * @property {string} inputDir - Base directory for input files
 * @property {string} outputDir - Base directory for output files
 * @property {boolean} recreate - Force recreation of all files
 * @property {string[]} fileNames - List of files to process
 */
export function parseCliArguments (argv) {
  const args = minimist(argv, {
    boolean: ['q', 'v', 'recreate'],
    string: ['types', 'media', 'input-dir', 'i', 'output-dir', 'o']
  })

  // Extract flags
  const quiet = args.q || false
  const verbose = (args.v || false) && !quiet

  // Parse types and media with defaults
  const parsedTypes = args.types?.split(',') || ['at', 'dt', 'ft', 'editedAt']
  const types = [...new Set(parsedTypes.map(type => type === 'eat' ? 'editedAt' : type))]
  const media = args.media?.split(',') || ['svg', 'midi', 'html']

  // Directory paths with defaults
  const inputDir = args['input-dir'] || args.i || './'
  const outputDir = args['output-dir'] || args.o || './cache'

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
    recreate,
    fileNames
  }
}
