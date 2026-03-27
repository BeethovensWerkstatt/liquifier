/**
 * @file Handles animation of dynamics elements with cross-fade between DT text and AT symbols
 * @module liquify/dynams
 */

import { computeTextDiff } from '../../utils/textDiff.js'

/**
 * Liquifies dynamics elements, handling two cases:
 *
 * Case 1: AT has symbol (use element), DT has text
 *   Creates cross-fade animation from DT text to AT symbol.
 *   Animation sequence:
 *   - findings: DT text at DT position (DT opacity: 1, AT opacity: 0)
 *   - diplomatic: Cross-fade (DT opacity: 0, AT opacity: 1) at DT position
 *   - supplements: AT symbol at AT position (DT opacity: 0, AT opacity: 1)
 *
 * Case 2: AT has text, DT has text
 *   Textual variation - currently only animates position.
 *   Full textual variation handling to be implemented.
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

      // Check if AT has a use element (symbol) or text element (textual content)
      const atUseElement = atDynam.querySelector('use')
      const atTextElement = atDynam.querySelector('text')

      if (!atUseElement && !atTextElement) {
        logger.warn(`[liquifyDynams] No use or text element found in AT dynam ${atId}`)
        return
      }

      // Determine AT position and element type
      let atX, atY, atElement, isAtSymbol

      if (atUseElement) {
      // AT has a symbol (use element)
        isAtSymbol = true
        atElement = atUseElement

        // Extract AT position from transform attribute
        const atTransform = atUseElement.getAttribute('transform')
        const atTransformMatch = atTransform?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
        if (!atTransformMatch) {
          logger.warn(`[liquifyDynams] Could not parse AT transform for dynam ${atId}: ${atTransform}`)
          return
        }
        atX = parseFloat(atTransformMatch[1])
        atY = parseFloat(atTransformMatch[2])
      } else {
      // AT has text (textual content)
        isAtSymbol = false
        atElement = atTextElement

        // Extract AT position from text element
        atX = parseFloat(atTextElement.getAttribute('x'))
        atY = parseFloat(atTextElement.getAttribute('y'))

        if (isNaN(atX) || isNaN(atY)) {
          logger.warn(`[liquifyDynams] Invalid AT text position for dynam ${atId}: x=${atX}, y=${atY}`)
          return
        }
      }

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
        logger.warn('[liquifyDynams] No text element found in DT dynam')
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

      logger.debug(`[liquifyDynams] Animating dynam ${atId}: AT(${atX}, ${atY}) -> DT(${dtX}, ${dtY}) -> newPos(${newPos.x}, ${newPos.y}), isAtSymbol: ${isAtSymbol}`)

      if (isAtSymbol) {
      // Case 1: AT has symbol, DT has text -> cross-fade from DT text to AT symbol

        // Clone the DT text element into the FT for cross-fade
        const dtTextClone = dtTextElement.cloneNode(true)
        dtTextClone.setAttribute('data-dt-clone', 'true')
        dtTextClone.setAttribute('class', 'dynam-dt')

        // Position the cloned text at the AT symbol's position (both will be moved by group transform)
        dtTextClone.setAttribute('x', atX)
        dtTextClone.setAttribute('y', atY)

        // Insert DT clone before the AT use element
        atElement.parentNode.insertBefore(dtTextClone, atElement)

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

        // Animate DT text: visible at findings and diplomatic, fades out between diplomatic and supplements
        setAnimation({
          element: dtTextClone,
          id: `${atId}-dt`,
          localName: 'dynam-dt-text',
          states: {
            findings: { type: 'opacity', val: '1' },
            diplomatic: { type: 'opacity', val: '1' },
            supplements: { type: 'opacity', val: '0' },
            conjectures: { type: 'opacity', val: '0' },
            annotated: { type: 'opacity', val: '0' }
          }
        })

        // Animate AT symbol: hidden at findings and diplomatic, fades in between diplomatic and supplements
        setAnimation({
          element: atElement,
          id: `${atId}-at`,
          localName: 'dynam-at-symbol',
          states: {
            findings: { type: 'opacity', val: '0' },
            diplomatic: { type: 'opacity', val: '0' },
            supplements: { type: 'opacity', val: '1' },
            conjectures: { type: 'opacity', val: '1' },
            annotated: { type: 'opacity', val: '1' }
          }
        })

        logger.debug(`[liquifyDynams] Added symbol cross-fade for dynam ${atId}`)
      } else {
      // Case 2: AT has text, DT has text -> textual variation
      // Compute diff between DT and AT text to animate character changes

        const dtText = dtTextElement.textContent.trim()
        const atText = atTextElement.textContent.trim()

        logger.debug(`[liquifyDynams] Text diff for ${atId}: "${dtText}" -> "${atText}"`)

        // Compute the differences between the two text strings
        const diffSegments = computeTextDiff(dtText, atText)

        logger.debug(`[liquifyDynams] Diff segments: ${JSON.stringify(diffSegments)}`)

        // Clear the AT text element's content
        atTextElement.textContent = ''

        // Get or create the tspan container (AT structure: text > tspan > tspan)
        let tspanContainer = atTextElement.querySelector('tspan[data-class="text"]')
        if (!tspanContainer) {
          tspanContainer = atTextElement.querySelector('tspan')
        }

        if (!tspanContainer) {
        // Create a tspan container if it doesn't exist
          tspanContainer = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
          tspanContainer.setAttribute('data-class', 'text')
          tspanContainer.setAttribute('class', 'text')
          atTextElement.appendChild(tspanContainer)
        } else {
        // Clear existing content
          tspanContainer.textContent = ''
        }

        // Get font-size from existing tspan if available
        const existingInnerTspan = tspanContainer.querySelector('tspan')
        const fontSize = existingInnerTspan?.getAttribute('font-size') || '405px'
        const fontStyle = existingInnerTspan?.getAttribute('font-style') || atTextElement.getAttribute('font-style') || 'italic'

        // Create tspan elements for each diff segment with appropriate animations
        diffSegments.forEach((segment, index) => {
          const segmentTspan = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
          segmentTspan.setAttribute('font-size', fontSize)
          if (fontStyle) {
            segmentTspan.setAttribute('font-style', fontStyle)
          }
          segmentTspan.textContent = segment.text
          segmentTspan.setAttribute('data-diff-type', segment.type)
          segmentTspan.setAttribute('data-diff-index', index)

          tspanContainer.appendChild(segmentTspan)

          // Apply opacity animation based on segment type
          if (segment.type === 'common') {
          // Common text: visible throughout
            setAnimation({
              element: segmentTspan,
              id: `${atId}-text-common-${index}`,
              localName: 'dynam-text-common',
              states: {
                findings: { type: 'opacity', val: '1' },
                diplomatic: { type: 'opacity', val: '1' },
                supplements: { type: 'opacity', val: '1' },
                conjectures: { type: 'opacity', val: '1' },
                annotated: { type: 'opacity', val: '1' }
              }
            })
          } else if (segment.type === 'delete') {
          // DT-only text: visible at findings/diplomatic, hidden and doesn't occupy space from supplements
            setAnimation({
              element: segmentTspan,
              id: `${atId}-text-delete-${index}`,
              localName: 'dynam-text-delete',
              states: {
                findings: { type: 'opacity', val: '1' },
                diplomatic: { type: 'opacity', val: '1' },
                supplements: { type: 'opacity', val: '0' },
                conjectures: { type: 'opacity', val: '0' },
                annotated: { type: 'opacity', val: '0' }
              }
            })
            // Make it not occupy space when hidden
            setAnimation({
              element: segmentTspan,
              id: `${atId}-text-delete-display-${index}`,
              localName: 'dynam-text-delete-display',
              states: {
                findings: { type: 'display', val: 'inline' },
                diplomatic: { type: 'display', val: 'inline' },
                supplements: { type: 'display', val: 'none' },
                conjectures: { type: 'display', val: 'none' },
                annotated: { type: 'display', val: 'none' }
              }
            })
          } else if (segment.type === 'insert') {
          // AT-only text: hidden at findings/diplomatic, fades in at supplements
          // Add "supplied" class for CSS styling
            segmentTspan.classList.add('supplied')

            setAnimation({
              element: segmentTspan,
              id: `${atId}-text-insert-${index}`,
              localName: 'dynam-text-insert',
              states: {
                findings: { type: 'opacity', val: '0' },
                diplomatic: { type: 'opacity', val: '0' },
                supplements: { type: 'opacity', val: '1' },
                conjectures: { type: 'opacity', val: '1' },
                annotated: { type: 'opacity', val: '1' }
              }
            })
            // Make it not occupy space when hidden
            setAnimation({
              element: segmentTspan,
              id: `${atId}-text-insert-display-${index}`,
              localName: 'dynam-text-insert-display',
              states: {
                findings: { type: 'display', val: 'none' },
                diplomatic: { type: 'display', val: 'none' },
                supplements: { type: 'display', val: 'inline' },
                conjectures: { type: 'display', val: 'inline' },
                annotated: { type: 'display', val: 'inline' }
              }
            })
          }
        })

        // Animate the position of the entire dynam group
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

        logger.info(`[liquifyDynams] Text-to-text dynam ${atId}: animated ${diffSegments.length} text segments`)
      }
    } catch (error) {
      logger.error(`[liquifyDynams] ERROR in dynams.js processing dynam ${atDynam?.getAttribute('data-id') || 'unknown'}: ${error.message}`)
      logger.error('[liquifyDynams] Stack trace:')
      logger.error(error.stack)
    }
  })

  logger.info('[liquifyDynams] Finished processing dynamics successfully')
}
