/**
 * Animate figured bass numbers (<f> elements) between AT and DT transcriptions
 *
 * For each fi      logger.debug(`[F ${atId}] AT: (${atPos.x}, ${atPos.y}), DT: (${dtPos.x}, ${dtPos.y}), newPos: (${newPos.x}, ${newPos.y}), diff: (${diffX}, ${diffY})`)

      // Apply animation to the parent text element
      const atVal = '0 0'
      const dtVal = `${diffX} ${diffY}`
      setAnimation({
        element: atText,
        id: `${atId}-text`,
        localName: 'f-text',
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
}s number in the AT (fluid transcription):
 * - Animates the individual number position based on corresponding DT position
 * - Handles figured bass numbers without DT correspondence by fading them out
 *
 * Figured bass numbers (<f>) are individual digits or symbols within figured bass notation,
 * typically found in Baroque and Classical music to indicate harmony above a bass line.
 * They are wrapped in <tspan> elements within <text> elements.
 *
 * Note: In many cases, figured bass is editorial (not in the original manuscript),
 * so these elements will often fade out as they have no DT correspondence.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing figured bass metadata
 * @param {Object} tools - Tools object containing helper functions and data
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
      // Fade out the parent text element to hide the entire figured bass number
      const parentText = f.closest('text')
      if (parentText) {
        setAnimation({
          element: parentText,
          id: `${atId}-text`,
          localName: 'f-text',
          states: {
            findings: null,
            diplomatic: null,
            supplements: { type: 'translate', val: '0 0' },
            conjectures: { type: 'translate', val: '0 0' },
            annotated: { type: 'translate', val: '0 0' }
          }
        })
      }
      return
    }

    logger.debug(`[Fs] Processing figured bass number ${atId}, dtIds: ${dtIds.join(', ')}`)

    dtIds.forEach(dtId => {
      const dtF = dtSvg.querySelector(`tspan.f[data-id="${dtId}"]`)
      if (!dtF) {
        const parentText = f.closest('text')
        if (parentText) {
          setAnimation({
            element: parentText,
            id: `${atId}-text`,
            localName: 'f-text',
            states: {
              findings: null,
              diplomatic: null,
              supplements: { type: 'translate', val: '0 0' },
              conjectures: { type: 'translate', val: '0 0' },
              annotated: { type: 'translate', val: '0 0' }
            }
          })
        }
        return
      }

      // Get positions from the parent text element's x and y attributes
      const atText = f.closest('text')
      const dtText = dtF.closest('text')

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
