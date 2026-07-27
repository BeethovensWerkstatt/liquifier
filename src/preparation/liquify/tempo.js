import { applyTextLengthAnimation, getStaticTextLengthStates, getTextLengthStates } from './textAnimation.js'

/**
 * Liquify tempo elements
 *
 * @param {SVGElement} ftSvg - The fluid transcript SVG (based on AT)
 * @param {SVGElement} dtSvg - The diplomatic transcript SVG
 * @param {Document} atMeiDom - The annotated transcript MEI DOM
 * @param {Object} tools - Utility functions and mappings
 * @returns {void} No return value.
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
      const textLengthStates = getTextLengthStates({
        atTextElement,
        dtTextElement,
        atPosition: { x: atX, y: atY },
        dtPosition: { x: dtX, y: dtY },
        getNewPos
      })

      const fontSize = atTextElement.querySelector('tspan[font-size]')?.getAttribute('font-size') || '405px'
      const fontStyle = atTextElement.getAttribute('font-style')
      const diplomaticRun = createTempoTextRun(atTextElement, dtText, fontSize, fontStyle, 'diplomatic')
      const annotatedRun = createTempoTextRun(atTextElement, atText, fontSize, fontStyle, 'annotated')

      atTempo.replaceChild(annotatedRun, atTextElement)
      atTempo.insertBefore(diplomaticRun, annotatedRun)

      const diplomaticTextLengthStates = textLengthStates
        ? getStaticTextLengthStates(textLengthStates.finding.val)
        : null
      const annotatedTextLengthStates = textLengthStates
        ? getStaticTextLengthStates(textLengthStates.supplements.val)
        : null
      applyTextLengthAnimation(diplomaticRun, diplomaticTextLengthStates, setAnimation)
      applyTextLengthAnimation(annotatedRun, annotatedTextLengthStates, setAnimation)
      setAnimation({
        element: diplomaticRun,
        states: {
          finding: { type: 'opacity', val: '1' },
          normalization: { type: 'opacity', val: '1' },
          regulation: { type: 'opacity', val: '1' },
          supplements: { type: 'opacity', val: '0' },
          interventions: { type: 'opacity', val: '0' }
        }
      })
      setAnimation({
        element: annotatedRun,
        states: {
          finding: { type: 'opacity', val: '0' },
          normalization: { type: 'opacity', val: '0' },
          regulation: { type: 'opacity', val: '0' },
          supplements: { type: 'opacity', val: '1' },
          interventions: { type: 'opacity', val: '1' }
        }
      })

      // Animate the position of the entire tempo group
      setAnimation({
        element: atTempo,
        states: {
          finding: { type: 'translate', val: `${translateX} ${translateY}` },
          normalization: { type: 'translate', val: `${translateX} ${translateY}` },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'translate', val: '0 0' },
          supplements: { type: 'translate', val: '0 0' },
          interventions: { type: 'translate', val: '0 0' }
        }
      })

      logger.info(`[liquifyTempo] Tempo ${atId}: animated diplomatic and annotated text runs`)
    } catch (error) {
      logger.error(`[liquifyTempo] ERROR processing tempo ${atTempo?.getAttribute('data-id') || 'unknown'}: ${error.message}`)
      logger.error('[liquifyTempo] Stack trace:')
      logger.error(error.stack)
    }
  })

  logger.info('[liquifyTempo] Completed tempo liquification')
}

const createTempoTextRun = (textElement, text, fontSize, fontStyle, role) => {
  const run = textElement.cloneNode(false)
  run.removeAttribute('textLength')
  run.setAttribute('font-size', '0px')
  if (fontStyle) run.setAttribute('font-style', fontStyle)
  run.setAttribute('data-text-role', role)
  const content = textElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
  content.setAttribute('font-size', fontSize)
  content.textContent = text
  run.appendChild(content)
  return run
}
