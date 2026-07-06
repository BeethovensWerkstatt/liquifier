/**
 * Animate fingerings between AT and DT transcriptions
 * For each fingering in the AT (fluid transcription):
 * - Animates the fingering text position based on corresponding DT fingering position
 * - Handles fingerings without DT correspondence by fading them out
 * Fingerings are text elements (typically numbers 1-5) that indicate which finger
 * should be used to play a note.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing fingering metadata
 * @param {Object} tools - Tools object containing helper functions and data
 * @returns {number} Resulting numeric value.
 */
export const liquifyFings = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  const fings = ftSvg.querySelectorAll('g.fing:not(.bounding-box)')
  logger.debug(`[Fings] Found ${fings.length} fingerings to animate`)

  fings.forEach(fing => {
    const atId = fing.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      logger.debug(`[Fings] No corresp for fingering ${atId}`)
      setAnimation({
        element: fing,
        states: {
          finding: null,
          normalization: null,
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'translate', val: '0 0' },
          supplements: { type: 'translate', val: '0 0' },
          interventions: { type: 'translate', val: '0 0' }
        }
      })
      return
    }

    logger.debug(`[Fings] Processing fingering ${atId}, dtIds: ${dtIds.join(', ')}`)

    dtIds.forEach(dtId => {
      const dtFing = dtSvg.querySelector(`g.fing[data-id="${dtId}"]`)
      if (!dtFing) {
        setAnimation({
          element: fing,
          states: {
            finding: null,
            normalization: null,
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'translate', val: '0 0' },
            supplements: { type: 'translate', val: '0 0' },
            interventions: { type: 'translate', val: '0 0' }
          }
        })
        return
      }

      // Get fingering positions from the text element's x and y attributes
      const atText = fing.querySelector('text')
      const dtText = dtFing.querySelector('text')

      if (!atText || !dtText) {
        return
      }

      // Extract positions from x and y attributes (both AT and DT use the same pattern)
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

      logger.debug(`[Fing ${atId}] AT: (${atPos.x}, ${atPos.y}), DT: (${dtPos.x}, ${dtPos.y}), newPos: (${newPos.x}, ${newPos.y}), diff: (${diffX}, ${diffY})`)

      // Apply animation to the fingering group
      const atVal = '0 0'
      const dtVal = `${diffX} ${diffY}`
      setAnimation({
        element: fing,
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
