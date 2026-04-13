/**
 * Liquify tuplet numbers
 *
 * Tuplet numbers are editorial additions that don't exist in diplomatic transcripts.
 * They fade in during the supplements phase.
 *
 * @param {SVGElement} ftSvg - Fluid Transcript SVG
 * @param {SVGElement} dtSvg - Diplomatic Transcript SVG (not used, as there are no tuplet numbers in DT)
 * @param {Document} atMeiDom - Annotated Transcript MEI DOM (not used)
 * @param {Object} tools - Tools object containing:
 *   - setAnimation(options): Apply animation states to SVG elements
 *   - logger: Logger instance
 */
export const liquifyTupletNums = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { setAnimation, logger } = tools

  logger.info('[liquifyTupletNums] Starting tuplet number liquification')

  // Find all tuplet numbers in the FT (which is based on AT)
  const tupletNums = ftSvg.querySelectorAll('.tupletNum')

  if (tupletNums.length === 0) {
    logger.info('[liquifyTupletNums] No tuplet numbers found')
    return
  }

  logger.info(`[liquifyTupletNums] Processing ${tupletNums.length} tuplet numbers`)

  // Animate each tuplet number to fade in during supplements
  tupletNums.forEach(tupletNum => {
    const tupletId = tupletNum.getAttribute('data-id')

    if (!tupletId) {
      logger.warn('[liquifyTupletNums] Tuplet number without data-id found')
      return
    }

    // Tuplet numbers are editorial supplements, so they:
    // - Don't exist in finding/normalization (hidden with opacity: 0)
    // - Fade in during supplements phase
    // - Remain visible in regulation, supplements, and interventions
    setAnimation({
      element: tupletNum,
      id: tupletId,
      localName: 'tupletNum',
      states: {
        finding: null,
        normalization: null,
        // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
        regulation: { type: 'translate', val: '0 0' },
        supplements: { type: 'translate', val: '0 0' },
        interventions: { type: 'translate', val: '0 0' }
      }
    })
  })

  logger.info('[liquifyTupletNums] Finished processing tuplet numbers successfully')
}
