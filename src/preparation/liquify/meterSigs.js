/**
 * Animate meter signatures between AT and DT transcriptions
 *
 * For each meter signature in the AT (fluid transcription):
 * - Animates the meter signature position based on corresponding DT meter signature position
 * - Handles meter signatures without DT correspondence by fading them out
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data
 */
export const liquifyMeterSigs = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  const meterSigs = ftSvg.querySelectorAll('.meterSig:not(.bounding-box)')
  meterSigs.forEach(meterSig => {
    const atId = meterSig.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      setAnimation({
        element: meterSig,
        id: atId,
        localName: 'meterSig',
        states: {
          finding: null,
          normalization: null,
          supplements: { type: 'translate', val: '0 0' },
          regulation: { type: 'translate', val: '0 0' },
          interventions: { type: 'translate', val: '0 0' }
        }
      })
      return
    }

    // Create array to hold the original and cloned meter signatures
    const meterSigElements = [meterSig]

    // If multiple dtIds, create clones for each additional one
    if (dtIds.length > 1) {
      const parent = meterSig.parentNode
      for (let i = 1; i < dtIds.length; i++) {
        const clone = meterSig.cloneNode(true)
        // Insert clone after the previous element
        parent.insertBefore(clone, meterSigElements[i - 1].nextSibling)
        meterSigElements.push(clone)
      }
    }

    // Now iterate dtIds with corresponding meterSig elements
    dtIds.forEach((dtId, index) => {
      const currentMeterSig = meterSigElements[index]
      const dtMeterSig = dtSvg.querySelector(`.meterSig[data-id="${dtId}"]`)
      if (!dtMeterSig) {
        setAnimation({
          element: currentMeterSig,
          id: `${atId}-${index}`,
          localName: 'meterSig',
          states: {
            finding: null,
            normalization: null,
            supplements: { type: 'translate', val: '0 0' },
            regulation: { type: 'translate', val: '0 0' },
            interventions: { type: 'translate', val: '0 0' }
          }
        })
        return
      }

      const atUse = currentMeterSig.querySelector('use')
      const dtUse = dtMeterSig.querySelector('use')
      if (atUse && dtUse) {
        // AT meter signatures use transform="translate(x, y) scale(...)" on the use element
        const atTransform = atUse.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
        if (!atTransform) return

        const atX = parseFloat(atTransform[1])
        const atY = parseFloat(atTransform[2])

        // DT meter signatures use x and y attributes on the use element
        const dtX = parseFloat(dtUse.getAttribute('x') || 0)
        const dtY = parseFloat(dtUse.getAttribute('y') || 0)

        // Transform DT position to AT coordinate system
        const newPos = getNewPos({ x: atX, y: atY }, { x: dtX, y: dtY })

        // Calculate the movement difference
        const diffX = newPos.x - atX
        const diffY = newPos.y - atY

        logger.debug(`[MeterSig Animation ${index}]`)
        logger.debug(`  AT pos: (${atX}, ${atY})`)
        logger.debug(`  DT pos: (${dtX}, ${dtY})`)
        logger.debug(`  newPos: (${newPos.x}, ${newPos.y})`)
        logger.debug(`  diff: (${diffX}, ${diffY})`)
        logger.debug(`  AT ID: ${atId}, DT ID: ${dtId}`)

        // Apply animation to the meter signature group
        const atVal = '0 0'
        const dtVal = `${diffX} ${diffY}`
        setAnimation({
          element: currentMeterSig,
          id: `${atId}-${index}`,
          localName: 'meterSig',
          states: {
            finding: { type: 'translate', val: dtVal },
            normalization: { type: 'translate', val: dtVal },
            supplements: { type: 'translate', val: atVal },
            regulation: { type: 'translate', val: atVal },
            interventions: { type: 'translate', val: atVal }
          }
        })
      }
    })
  })
}
