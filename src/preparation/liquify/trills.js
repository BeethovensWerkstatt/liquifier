/**
 * Animate trills between AT and DT transcriptions
 * 
 * For each trill in the AT (fluid transcription):
 * - Animates the trill symbol position based on corresponding DT trill position
 * - Handles trills without DT correspondence by fading them out
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing trill metadata
 * @param {Object} tools - Tools object containing helper functions and data
 */
export const liquifyTrills = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { scaleFactor, getNewPos, correspMappings, setAnimation, logger } = tools
  
  const trills = ftSvg.querySelectorAll('g.trill:not(.bounding-box)')
  logger.debug(`[Trills] Found ${trills.length} trills to animate`)
  
  trills.forEach(trill => {
    const atId = trill.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)
    
    if (!dtIds || dtIds.length === 0) {
      logger.debug(`[Trills] No corresp for trill ${atId}`)
      setAnimation({
        element: trill,
        id: atId,
        localName: 'trill',
        states: {
          findings: null,
          diplomatic: null,
          supplements: { type: 'translate', val: '0 0' },
          conjectures: { type: 'translate', val: '0 0' },
          annotated: { type: 'translate', val: '0 0' }
        }
      })
      return
    }
    
    logger.debug(`[Trills] Processing trill ${atId}, dtIds: ${dtIds.join(', ')}`)

    dtIds.forEach(dtId => {
      const dtTrill = dtSvg.querySelector(`g.trill[data-id="${dtId}"]`)
      if (!dtTrill) {
        setAnimation({
          element: trill,
          id: atId,
          localName: 'trill',
          states: {
          findings: null,
          diplomatic: null,
          supplements: { type: 'translate', val: '0 0' },
          conjectures: { type: 'translate', val: '0 0' },
          annotated: { type: 'translate', val: '0 0' }
        }
        })
        return
      }

      // Get trill positions from the use element's transform attribute
      const atUse = trill.querySelector('use')
      const dtUse = dtTrill.querySelector('use')
      
      if (!atUse || !dtUse) {
        return
      }

      // Extract position from transform="translate(x, y) scale(...)"
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
      const atVal = '0 0'
      const dtVal = parseFloat(newPos.x - atPos.x) + ' ' + parseFloat(newPos.y - atPos.y)

      
      logger.debug(`[Trill ${atId}] AT: (${atPos.x}, ${atPos.y}), DT: (${dtPos.x}, ${dtPos.y}), newPos: (${newPos.x}, ${newPos.y}), diff: (${atVal}, ${dtVal})`)

      // Apply animation to the trill use element
      setAnimation({
        element: trill,
        id: atId,
        localName: 'trill',
        states: {
          findings: { type: 'translate', val: dtVal },
          diplomatic: { type: 'translate', val: dtVal },
          supplements: { type: 'translate', val: atVal },
          conjectures: { type: 'translate', val: atVal },
          annotated: { type: 'translate', val: atVal }
        }
      })
    })
  })
}
