/**
 * @file Handles animation of dynamics elements with cross-fade between DT text and AT symbols
 * @module liquify/dynams
 */

/**
 * Liquifies dynamics elements, creating cross-fade animations between DT text representation
 * and AT symbol representation. The DT text is shown at findings, then cross-faded to the AT
 * symbol at diplomatic, which then moves to the AT position at supplements.
 * 
 * Animation sequence:
 * - findings: DT text at DT position (DT opacity: 1, AT opacity: 0)
 * - diplomatic: Cross-fade (DT opacity: 0, AT opacity: 1) at DT position
 * - supplements: AT symbol at AT position (DT opacity: 0, AT opacity: 1)
 * 
 * @param {Document} ftSvg - The fluid transcript SVG document
 * @param {Document} dtSvg - The diplomatic transcript SVG document
 * @param {Document} atMeiDom - The analytical transcript MEI DOM
 * @param {Object} tools - Tools object containing correspMappings and helpers
 */
export function liquifyDynams (ftSvg, dtSvg, atMeiDom, tools) {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  logger.info('[liquifyDynams] Starting dynamics animation')

  // Query all AT dynamics elements (not bounding boxes)
  const atDynams = ftSvg.querySelectorAll('g.dynam:not(.bounding-box)')
  logger.info(`[liquifyDynams] Found ${atDynams.length} dynamics elements`)

  atDynams.forEach(atDynam => {
    try {
      const atId = atDynam.getAttribute('data-id')
      if (!atId) {
        logger.warn('[liquifyDynams] Dynam element missing data-id, skipping')
        return
      }

      logger.debug(`[liquifyDynams] Processing AT dynam: ${atId}`)

      // Get the corresponding DT element IDs
      const dtIds = correspMappings.get(atId)
    
    if (!dtIds || dtIds.length === 0) {
      // AT element has no DT correspondence - it's editorial
      // Fade in from diplomatic onward
      logger.debug(`[liquifyDynams] No DT correspondence for dynam ${atId}, fading in (editorial)`)
      setAnimation({
        element: atDynam,
        id: atId,
        localName: 'dynam',
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

    // Get AT symbol element (use element)
    const atUseElement = atDynam.querySelector('use')
    if (!atUseElement) {
      logger.warn(`[liquifyDynams] No use element found in AT dynam ${atId}`)
      return
    }

    // Extract AT position from transform attribute
    const atTransform = atUseElement.getAttribute('transform')
    const atTransformMatch = atTransform?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
    if (!atTransformMatch) {
      logger.warn(`[liquifyDynams] Could not parse AT transform for dynam ${atId}: ${atTransform}`)
      return
    }

    const atX = parseFloat(atTransformMatch[1])
    const atY = parseFloat(atTransformMatch[2])

    // Try to find DT element
    let dtDynam = null
    for (const dtId of dtIds) {
      const candidate = dtSvg.querySelector(`g.dynam[data-id="${dtId}"]`)
      if (candidate) {
        dtDynam = candidate
        break
      }
    }

    if (!dtDynam) {
      logger.debug(`[liquifyDynams] No matching DT element found for dynam ${atId}, fading in`)
      setAnimation({
        element: atDynam,
        id: atId,
        localName: 'dynam',
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

    // Get DT text element
    const dtTextElement = dtDynam.querySelector('text')
    if (!dtTextElement) {
      logger.warn(`[liquifyDynams] No text element found in DT dynam`)
      setAnimation({
        element: atDynam,
        id: atId,
        localName: 'dynam',
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

    // Extract DT position from text element
    const dtX = parseFloat(dtTextElement.getAttribute('x'))
    const dtY = parseFloat(dtTextElement.getAttribute('y'))

    if (isNaN(dtX) || isNaN(dtY)) {
      logger.warn(`[liquifyDynams] Invalid DT position for dynam ${atId}: x=${dtX}, y=${dtY}`)
      setAnimation({
        element: atDynam,
        id: atId,
        localName: 'dynam',
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

    // Calculate the new position using coordinate transformation
    const newPos = getNewPos({ x: atX, y: atY }, { x: dtX, y: dtY })
    
    // Calculate the translation offset needed
    const translateX = newPos.x - atX
    const translateY = newPos.y - atY

    logger.debug(`[liquifyDynams] Animating dynam ${atId}: AT(${atX}, ${atY}) -> DT(${dtX}, ${dtY}) -> newPos(${newPos.x}, ${newPos.y})`)

    // Clone the DT text element into the FT for cross-fade
    const dtTextClone = dtTextElement.cloneNode(true)
    dtTextClone.setAttribute('data-dt-clone', 'true')
    dtTextClone.setAttribute('class', 'dynam-dt')
    
    // Insert DT clone before the AT use element
    atUseElement.parentNode.insertBefore(dtTextClone, atUseElement)

    // Add position animation to the dynam group (moves both DT text and AT symbol together)
    setAnimation({
      element: atDynam,
      id: atId,
      localName: 'dynam',
      states: {
        findings: { type: 'translate', val: `${translateX} ${translateY}` },
        diplomatic: { type: 'translate', val: `${translateX} ${translateY}` },
        supplements: { type: 'translate', val: '0 0' },
        conjectures: { type: 'translate', val: '0 0' },
        annotated: { type: 'translate', val: '0 0' }
      }
    })

    // Animate DT text: visible at findings, fades out at diplomatic and thereafter
    setAnimation({
      element: dtTextClone,
      id: `${atId}-dt`,
      localName: 'dynam-dt-text',
      states: {
        findings: { type: 'opacity', val: '1' },
        diplomatic: { type: 'opacity', val: '0' },
        supplements: { type: 'opacity', val: '0' },
        conjectures: { type: 'opacity', val: '0' },
        annotated: { type: 'opacity', val: '0' }
      }
    })

    // Animate AT symbol: hidden at findings, fades in at diplomatic, visible thereafter
    setAnimation({
      element: atUseElement,
      id: `${atId}-at`,
      localName: 'dynam-at-symbol',
      states: {
        findings: { type: 'opacity', val: '0' },
        diplomatic: { type: 'opacity', val: '1' },
        supplements: { type: 'opacity', val: '1' },
        conjectures: { type: 'opacity', val: '1' },
        annotated: { type: 'opacity', val: '1' }
      }
    })
    
    logger.debug(`[liquifyDynams] Added cross-fade for dynam ${atId}`)
    } catch (error) {
      logger.error(`[liquifyDynams] ERROR in dynams.js processing dynam ${atDynam?.getAttribute('data-id') || 'unknown'}: ${error.message}`)
      logger.error('[liquifyDynams] Stack trace:')
      logger.error(error.stack)
    }
  })

  logger.info('[liquifyDynams] Finished processing dynamics successfully')
}
