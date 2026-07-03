import { closestElement } from '../../utils/dom.js'

/**
 * Animate figured bass numbers (<f> elements) between AT and DT transcriptions.
 * For each figured bass number in the AT (fluid transcription):
 * - Animates the individual number position based on corresponding DT position
 * - Keeps numbers without DT correspondence in place (no translation)
 * Figured bass numbers (<f>) are individual digits or symbols within figured bass notation,
 * typically found in Baroque and Classical music to indicate harmony above a bass line.
 * They are wrapped in <tspan> elements within <text> elements.
 * Note: In many cases, figured bass is editorial (not in the original manuscript),
 * so these elements often have no DT correspondence and remain in their AT position.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing figured bass metadata
 * @param {Object} tools - Animation helper bundle
 * @param {Function} tools.getNewPos - Converts DT coordinates into FT coordinate space
 * @param {Map<string, string[]>} tools.correspMappings - AT element id to DT ids mapping
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer
 * @param {Object} tools.logger - Logger instance
 * @returns {number} Resulting numeric value.
 */
export const liquifyFs = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  const fs = ftSvg.querySelectorAll('tspan.f:not(.bounding-box)')
  logger.debug(`[Fs] Found ${fs.length} figured bass numbers to animate`)

  fs.forEach(f => {
    const atId = f.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      logger.debug(`[Fs] No corresp for figured bass number ${atId}`)
      // Keep the parent text at its AT position when no DT match exists
      const parentText = closestElement(f, 'text')
      if (parentText) {
        setAnimation({
          element: parentText,
          id: `${atId}-text`,
          localName: 'f-text',
          states: {
            finding: null,
            normalization: null,
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'translate', val: '0 0' },
            supplements: { type: 'translate', val: '0 0' },
            interventions: { type: 'translate', val: '0 0' }
          }
        })
      }
      return
    }

    logger.debug(`[Fs] Processing figured bass number ${atId}, dtIds: ${dtIds.join(', ')}`)

    dtIds.forEach(dtId => {
      const dtF = dtSvg.querySelector(`tspan.f[data-id="${dtId}"]`)
      if (!dtF) {
        const parentText = closestElement(f, 'text')
        if (parentText) {
          setAnimation({
            element: parentText,
            id: `${atId}-text`,
            localName: 'f-text',
            states: {
              finding: null,
              normalization: null,
              // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
              regulation: { type: 'translate', val: '0 0' },
              supplements: { type: 'translate', val: '0 0' },
              interventions: { type: 'translate', val: '0 0' }
            }
          })
        }
        return
      }

      // Get positions from the parent text element's x and y attributes
      const atText = closestElement(f, 'text')
      const dtText = closestElement(dtF, 'text')

      if (!atText || !dtText) {
        return
      }

      // Extract positions from x and y attributes
      const atX = parseFloat(atText.getAttribute('x'))
      const atY = parseFloat(atText.getAttribute('y'))
      const dtX = parseFloat(dtText.getAttribute('x'))
      const dtY = parseFloat(dtText.getAttribute('y'))

      if (isNaN(atX) || isNaN(atY) || isNaN(dtX) || isNaN(dtY)) {
        return
      }

      const atPos = {
        x: atX,
        y: atY
      }

      const dtPos = {
        x: dtX,
        y: dtY
      }

      // Transform DT position to AT coordinate system
      const newPos = getNewPos(atPos, dtPos)

      // Calculate relative offset
      const diffX = newPos.x - atPos.x
      const diffY = newPos.y - atPos.y

      logger.debug(`[F ${atId}] AT: (${atPos.x}, ${atPos.y}), DT: (${dtPos.x}, ${dtPos.y}), newPos: (${newPos.x}, ${newPos.y}), diff: (${diffX}, ${diffY})`)

      // Apply animation to the parent text element (to move the entire figured bass number)
      const atVal = '0 0'
      const dtVal = `${diffX} ${diffY}`
      setAnimation({
        element: atText,
        id: `${atId}-text`,
        localName: 'f-text',
        states: {
          finding: { type: 'translate', val: dtVal },
          normalization: { type: 'translate', val: dtVal },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'translate', val: atVal },
          supplements: { type: 'translate', val: atVal },
          interventions: { type: 'translate', val: atVal }
        }
      })
    })
  })
}
