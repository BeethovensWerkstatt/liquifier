/**
 * Animates tempo elements between diplomatic and annotated transcripts
 */

import { computeTextDiff } from '../../utils/textDiff.js'

/**
 * Liquify tempo elements
 * @param {SVGElement} ftSvg - The fluid transcript SVG (based on AT)
 * @param {SVGElement} dtSvg - The diplomatic transcript SVG
 * @param {Document} atMeiDom - The annotated transcript MEI DOM
 * @param {Object} tools - Utility functions and mappings
 */
export function liquifyTempo (ftSvg, dtSvg, atMeiDom, tools) {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  logger.info('[liquifyTempo] Starting tempo liquification')

  // Get all tempo elements from FT (based on AT)
  const atTempos = ftSvg.querySelectorAll('g.tempo:not(.bounding-box)')

  logger.info(`[liquifyTempo] Processing ${atTempos.length} tempo elements`)

  atTempos.forEach(atTempo => {
    try {
      const atId = atTempo.getAttribute('data-id')

      if (!atId) {
        logger.warn('[liquifyTempo] Tempo element missing data-id, skipping')
        return
      }

      logger.debug(`[liquifyTempo] Processing AT tempo: ${atId}`)

      // Get the corresponding DT element IDs
      const dtIds = correspMappings.get(atId)

      if (!dtIds || dtIds.length === 0) {
        // AT element has no DT correspondence - it's editorial
        logger.debug(`[liquifyTempo] No DT correspondence for tempo ${atId}, fading in (editorial)`)
        setAnimation({
          element: atTempo,
          id: atId,
          localName: 'tempo',
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

      // Get the first DT ID (tempo should only have one correspondence)
      const dtId = dtIds[0]

      // Find the DT tempo element
      const dtTempo = dtSvg.querySelector(`[data-id="${dtId}"]`)

      if (!dtTempo) {
        logger.warn(`[liquifyTempo] Could not find DT tempo ${dtId} for AT tempo ${atId}`)
        return
      }

      // Get text elements from both AT and DT
      const atTextElement = atTempo.querySelector('text')
      const dtTextElement = dtTempo.querySelector('text')

      if (!atTextElement || !dtTextElement) {
        logger.warn(`[liquifyTempo] Missing text element in tempo ${atId}`)
        return
      }

      // Extract AT position from text element
      const atX = parseFloat(atTextElement.getAttribute('x'))
      const atY = parseFloat(atTextElement.getAttribute('y'))

      if (isNaN(atX) || isNaN(atY)) {
        logger.warn(`[liquifyTempo] Invalid AT position for tempo ${atId}: x=${atX}, y=${atY}`)
        return
      }

      // Extract DT position from text element
      const dtX = parseFloat(dtTextElement.getAttribute('x'))
      const dtY = parseFloat(dtTextElement.getAttribute('y'))

      if (isNaN(dtX) || isNaN(dtY)) {
        logger.warn(`[liquifyTempo] Invalid DT position for tempo ${atId}: x=${dtX}, y=${dtY}`)
        setAnimation({
          element: atTempo,
          id: atId,
          localName: 'tempo',
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

      // Calculate the new position using coordinate transformation
      const newPos = getNewPos({ x: atX, y: atY }, { x: dtX, y: dtY })

      // Calculate the translation offset needed
      const translateX = newPos.x - atX
      const translateY = newPos.y - atY

      logger.debug(`[liquifyTempo] Animating tempo ${atId}: AT(${atX}, ${atY}) -> DT(${dtX}, ${dtY}) -> newPos(${newPos.x}, ${newPos.y})`)

      // Extract text content from DT and AT
      const dtText = dtTextElement.textContent.trim()
      const atText = atTextElement.textContent.trim()

      logger.debug(`[liquifyTempo] Text diff for ${atId}: "${dtText}" -> "${atText}"`)

      // Compute the differences between the two text strings
      const diffSegments = computeTextDiff(dtText, atText)

      logger.debug(`[liquifyTempo] Diff segments: ${JSON.stringify(diffSegments)}`)

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
            localName: 'tempo-text-common',
            states: {
              finding: { type: 'opacity', val: '1' },
              normalization: { type: 'opacity', val: '1' },
              // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
              regulation: { type: 'opacity', val: '1' },
              supplements: { type: 'opacity', val: '1' },
              interventions: { type: 'opacity', val: '1' }
            }
          })
        } else if (segment.type === 'delete') {
          // DT-only text: visible at finding/normalization, hidden and doesn't occupy space from supplements
          setAnimation({
            element: segmentTspan,
            id: `${atId}-text-delete-${index}`,
            localName: 'tempo-text-delete',
            states: {
              finding: { type: 'opacity', val: '1' },
              normalization: { type: 'opacity', val: '1' },
              // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
              regulation: { type: 'opacity', val: '0' },
              supplements: { type: 'opacity', val: '0' },
              interventions: { type: 'opacity', val: '0' }
            }
          })
          // Make it not occupy space when hidden
          setAnimation({
            element: segmentTspan,
            id: `${atId}-text-delete-display-${index}`,
            localName: 'tempo-text-delete-display',
            states: {
              finding: { type: 'display', val: 'inline' },
              normalization: { type: 'display', val: 'inline' },
              // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
              regulation: { type: 'display', val: 'none' },
              supplements: { type: 'display', val: 'none' },
              interventions: { type: 'display', val: 'none' }
            }
          })
        } else if (segment.type === 'insert') {
          // AT-only text: hidden at finding/normalization, fades in at supplements
          // Add "supplied" class for CSS styling
          segmentTspan.classList.add('supplied')

          setAnimation({
            element: segmentTspan,
            id: `${atId}-text-insert-${index}`,
            localName: 'tempo-text-insert',
            states: {
              finding: { type: 'opacity', val: '0' },
              normalization: { type: 'opacity', val: '0' },
              // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
              regulation: { type: 'opacity', val: '1' },
              supplements: { type: 'opacity', val: '1' },
              interventions: { type: 'opacity', val: '1' }
            }
          })
          // Make it not occupy space when hidden
          setAnimation({
            element: segmentTspan,
            id: `${atId}-text-insert-display-${index}`,
            localName: 'tempo-text-insert-display',
            states: {
              finding: { type: 'display', val: 'none' },
              normalization: { type: 'display', val: 'none' },
              // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
              regulation: { type: 'display', val: 'inline' },
              supplements: { type: 'display', val: 'inline' },
              interventions: { type: 'display', val: 'inline' }
            }
          })
        }
      })

      // Animate the position of the entire tempo group
      setAnimation({
        element: atTempo,
        id: atId,
        localName: 'tempo',
        states: {
          finding: { type: 'translate', val: `${translateX} ${translateY}` },
          normalization: { type: 'translate', val: `${translateX} ${translateY}` },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'translate', val: '0 0' },
          supplements: { type: 'translate', val: '0 0' },
          interventions: { type: 'translate', val: '0 0' }
        }
      })

      logger.info(`[liquifyTempo] Tempo ${atId}: animated ${diffSegments.length} text segments`)
    } catch (error) {
      logger.error(`[liquifyTempo] ERROR processing tempo ${atTempo?.getAttribute('data-id') || 'unknown'}: ${error.message}`)
      logger.error('[liquifyTempo] Stack trace:')
      logger.error(error.stack)
    }
  })

  logger.info('[liquifyTempo] Completed tempo liquification')
}
