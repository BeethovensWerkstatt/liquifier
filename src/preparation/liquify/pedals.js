/**
 * Animate pedals between AT and DT transcriptions
 * For each pedal in the AT (fluid transcription):
 * - Animates the pedal symbol position based on corresponding DT pedal position
 * - Handles pedals without DT correspondence by fading them out
 * Pedals include pedalDown (Ped.) and pedalUp (*) symbols.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing pedal metadata
 * @param {Object} tools - Tools object containing helper functions and data
 * @returns {number} Resulting numeric value.
 */
export const liquifyPedals = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  const pedals = ftSvg.querySelectorAll('g.pedal:not(.bounding-box)')
  logger.debug(`[Pedals] Found ${pedals.length} pedals to animate`)

  pedals.forEach(pedal => {
    const atId = pedal.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      logger.debug(`[Pedals] No corresp for pedal ${atId}`)
      setAnimation({
        element: pedal,
        id: atId,
        localName: 'pedal',
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

    logger.debug(`[Pedals] Processing pedal ${atId}, dtIds: ${dtIds.join(', ')}`)

    dtIds.forEach(dtId => {
      const dtPedal = dtSvg.querySelector(`g.pedal[data-id="${dtId}"]`)
      if (!dtPedal) {
        setAnimation({
          element: pedal,
          id: atId,
          localName: 'pedal',
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

      // Get pedal positions from the use element
      const atUse = pedal.querySelector('use')
      const dtUse = dtPedal.querySelector('use')

      if (!atUse || !dtUse) {
        return
      }

      // Extract AT position from transform="translate(x, y) scale(...)"
      // Extract DT position from x="..." y="..." attributes
      const atTransform = atUse.getAttribute('transform')
      const dtX = parseFloat(dtUse.getAttribute('x'))
      const dtY = parseFloat(dtUse.getAttribute('y'))

      const atMatch = atTransform?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)

      if (!atMatch || !dtX || !dtY) {
        return
      }

      const atPos = {
        x: parseFloat(atMatch[1]),
        y: parseFloat(atMatch[2])
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

      logger.debug(`[Pedal ${atId}] AT: (${atPos.x}, ${atPos.y}), DT: (${dtPos.x}, ${dtPos.y}), newPos: (${newPos.x}, ${newPos.y}), diff: (${diffX}, ${diffY})`)

      // Apply animation to the pedal group (not the use element, to avoid conflicts with transform attribute)
      const atVal = '0 0'
      const dtVal = `${diffX} ${diffY}`
      setAnimation({
        element: pedal,
        id: atId,
        localName: 'pedal',
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
