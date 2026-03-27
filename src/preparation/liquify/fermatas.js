/**
 * Animate fermatas between AT and DT transcriptions
 *
 * For each fermata in the AT (fluid transcription):
 * - Animates the fermata symbol position based on corresponding DT fermata position
 * - Handles fermatas without DT correspondence by fading them out
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing fermata metadata
 * @param {Object} tools - Tools object containing helper functions and data
 */
export const liquifyFermatas = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  const fermatas = ftSvg.querySelectorAll('g.fermata:not(.bounding-box)')
  logger.debug(`[Fermatas] Found ${fermatas.length} fermatas to animate`)

  fermatas.forEach(fermata => {
    const atId = fermata.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      logger.debug(`[Fermatas] No corresp for fermata ${atId}`)
      setAnimation({
        element: fermata,
        id: atId,
        localName: 'fermata',
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

    logger.debug(`[Fermatas] Processing fermata ${atId}, dtIds: ${dtIds.join(', ')}`)

    dtIds.forEach(dtId => {
      const dtFermata = dtSvg.querySelector(`g.fermata[data-id="${dtId}"]`)
      if (!dtFermata) {
        setAnimation({
          element: fermata,
          id: atId,
          localName: 'fermata',
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

      // Get fermata positions from the use element
      const atUse = fermata.querySelector('use')
      const dtUse = dtFermata.querySelector('use')

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

      logger.debug(`[Fermata ${atId}] AT: (${atPos.x}, ${atPos.y}), DT: (${dtPos.x}, ${dtPos.y}), newPos: (${newPos.x}, ${newPos.y}), diff: (${diffX}, ${diffY})`)

      // Apply animation to the fermata group (not the use element, to avoid conflicts with transform attribute)
      const atVal = '0 0'
      const dtVal = `${diffX} ${diffY}`
      setAnimation({
        element: fermata,
        id: atId,
        localName: 'fermata',
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
