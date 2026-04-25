import { createLogger } from './src/core/logger.js'
import { parseCliArguments } from './src/core/cli.js'
import { initializeTools } from './src/core/init.js'
import { processFiles } from './src/core/processor.js'

/**
 * Main entry point for the liquifier application
 * Orchestrates the high-level flow: CLI → Logger → Init → Process
 *
 * @returns {Promise<void>} Promise resolving to the computed result.
 */
const main = async () => {
  // 1. Parse CLI arguments into config object
  const config = parseCliArguments(process.argv.slice(2))
  const logger = createLogger(config.quiet, config.verbose)

  // 2. Initialize Verovio and Thulemeier tools
  const { verovio } = await initializeTools(logger)

  // 3. Log configuration
  logger.info('Input directory: ' + config.inputDir)
  logger.info('Output directory: ' + config.outputDir)
  if (config.contextDocument) {
    logger.info('Context document: ' + config.contextDocument)
  }
  logger.debug('types: ' + config.types + ', media: ' + config.media)

  // 4. Process files
  await processFiles({
    fileNames: config.fileNames,
    config,
    verovio,
    logger
  })
}

main()
