import { closestElement } from '../../utils/dom.js'

/**
 * Animate chords between AT and DT transcriptions, including noteheads, stems, ledger lines, and flags
 * For each chord in the AT (fluid transcription):
 * - Animates the chord position based on corresponding DT chord position
 * - Animates all noteheads within the chord
 * - Animates associated ledger lines to follow the chord
 * - Scales and animates the stem length based on DT stem length and scale factor
 * - Animates flags (if present) to follow the stem endpoint
 * - Handles chords without DT correspondence by fading them out
 * Stem animation logic:
 * - For stem.dir="up": keeps the bottom fixed and extends/contracts upward
 * - For stem.dir="down": keeps the top fixed and extends/contracts downward
 * - Handles both drawing directions (M-top-L-bottom and M-bottom-L-top)
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing chord metadata (stem.dir, etc.)
 * @param {Object} tools - Animation helper bundle
 * @param {number} tools.scaleFactor - DT-to-AT scale factor
 * @param {Function} tools.getNewPos - Converts DT coordinates into FT coordinate space
 * @param {Map<string, string[]>} tools.correspMappings - AT element id to DT ids mapping
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer
 * @param {Object} tools.logger - Logger instance
 * @returns {Object} Resulting object.
 */
export const liquifyChords = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { scaleFactor, getNewPos, correspMappings, setAnimation, logger } = tools

  const chords = ftSvg.querySelectorAll('g.chord:not(.bounding-box)')
  logger.debug(`[Chords] Found ${chords.length} chords to animate`)

  chords.forEach(chord => {
    const atId = chord.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      logger.debug(`[Chords] No corresp for chord ${atId}`)
      return
    }

    logger.debug(`[Chords] Processing chord ${atId}, dtIds: ${dtIds.join(', ')}`)

    dtIds.forEach(dtId => {
      const dtChord = dtSvg.querySelector(`g.chord[data-id="${dtId}"]`)
      if (!dtChord) {
        setAnimation({
          element: chord,
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

      // Get positions directly from notehead elements
      // In AT (ftSvg), notes are separate elements within the chord
      // In DT, noteheads are direct children of the chord (no note wrapper)

      // Get AT chord position from first notehead's transform
      const atNotes = chord.querySelectorAll('g.note:not(.bounding-box)')

      if (atNotes.length === 0) {
        return
      }

      const atNotesPositions = [...atNotes].map(atNote => {
        const atHeadUse = atNote.querySelector('.notehead > use')
        const atHeadTranslate = atHeadUse?.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)

        if (!atHeadTranslate) {
          return null
        }

        return {
          id: atNote.getAttribute('data-id'),
          x: parseFloat(atHeadTranslate[1]),
          y: parseFloat(atHeadTranslate[2])
        }
      }).filter(Boolean)

      const dtNotes = dtChord.querySelectorAll('.notehead > use')
      const dtNotesPositions = Array.from(dtNotes).map(dtHeadUse => {
        return {
          id: closestElement(dtHeadUse, 'g.note')?.getAttribute('data-id'),
          x: parseFloat(dtHeadUse.getAttribute('x')),
          y: parseFloat(dtHeadUse.getAttribute('y'))
        }
      })

      if (atNotesPositions.length === 0 || dtNotesPositions.length === 0) {
        return
      }

      // sort both arrays by y position to match notes correctly
      atNotesPositions.sort((a, b) => a.y - b.y)
      dtNotesPositions.sort((a, b) => a.y - b.y)

      // animate each notehead individually
      atNotesPositions.forEach((atHead, index) => {
        const dtHead = dtNotesPositions[index]
        if (!dtHead) return

        // Transform DT position to AT coordinate system
        const newPos = getNewPos(atHead, dtHead)

        // Calculate relative offset
        const diffX = newPos.x - atHead.x
        const diffY = newPos.y - atHead.y

        logger.debug(`[Chord ${atId} Note ${index}] AT: (${atHead.x}, ${atHead.y}), DT: (${dtHead.x}, ${dtHead.y}), newPos: (${newPos.x}, ${newPos.y}), diff: (${diffX}, ${diffY})`)

        // Apply animation to the notehead use element
        const atVal = '0 0'
        const dtVal = `${diffX} ${diffY}`
        atHead.atVal = atVal
        atHead.dtVal = dtVal
        const atNote = chord.querySelector('g.note:not(.bounding-box)[data-id="' + atHead.id + '"]')
        if (atNote) {
          const atHeadUse = atNote.querySelector('.notehead')
          setAnimation({
            element: atHeadUse,
            states: {
              finding: { type: 'translate', val: dtVal },
              normalization: { type: 'translate', val: dtVal },
              // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
              regulation: { type: 'translate', val: atVal },
              supplements: { type: 'translate', val: atVal },
              interventions: { type: 'translate', val: atVal }
            }
          })

          // Keep augmentation dots synchronized with the animated notehead.
          const dotGroups = atNote.querySelectorAll('.dots:not(.bounding-box)')
          dotGroups.forEach((dotGroup, dotIndex) => {
            setAnimation({
              element: dotGroup,
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
        }
      })

      // Animate the stem
      const atStem = chord.querySelector('.stem > path')
      if (atStem) {
        const dtStem = dtChord.querySelector('.stem > path')
        if (!dtStem) return

        const atD = atStem.getAttribute('d')
        const dtD = dtStem.getAttribute('d')

        // Parse d attributes to get start and end points
        const atMatch = atD.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
        const dtMatch = dtD.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
        if (!atMatch || !dtMatch) return

        // Extract coordinates
        const atX1 = parseFloat(atMatch[1])
        const atY1 = parseFloat(atMatch[2])
        const atX2 = parseFloat(atMatch[3])
        const atY2 = parseFloat(atMatch[4])
        const dtY1 = parseFloat(dtMatch[2])
        const dtY2 = parseFloat(dtMatch[4])

        // Calculate stem lengths
        const atLength = Math.abs(atY2 - atY1)
        const dtLength = Math.abs(dtY2 - dtY1)
        const newLength = dtLength * scaleFactor

        // Get stem direction from MEI - use attribute selector that works in Node.js
        const meiChord = atMeiDom.querySelector(`chord[xml\\:id="${atId}"]`)
        const stemDir = meiChord?.getAttribute('stem.dir') || 'up'

        // Calculate new d attribute based on stem direction for FINDINGS and DIPLOMATIC states
        let findingsD, findingsStemEndY, diplomaticD, diplomaticStemEndY
        if (stemDir === 'up') {
          // Stem goes up: keep bottom (higher y) fixed, extend upward (lower y)
          if (atY1 > atY2) {
            // M is bottom, L is top - keep M fixed
            findingsStemEndY = atY1 - newLength
            findingsD = `M${atX1} ${atY1} L${atX2} ${findingsStemEndY}`
            diplomaticStemEndY = atY1 - atLength
            diplomaticD = `M${atX1} ${atY1} L${atX2} ${diplomaticStemEndY}`
            setAnimation({
              element: atStem,
              states: {
                finding: { type: 'translate', val: atNotesPositions[0].dtVal },
                normalization: { type: 'translate', val: atNotesPositions[0].dtVal },
                // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
                regulation: { type: 'translate', val: atNotesPositions[0].atVal },
                supplements: { type: 'translate', val: atNotesPositions[0].atVal },
                interventions: { type: 'translate', val: atNotesPositions[0].atVal }
              }
            })
          } else {
            // M is top, L is bottom - keep L fixed
            findingsStemEndY = atY2 - newLength
            findingsD = `M${atX1} ${findingsStemEndY} L${atX2} ${atY2}`
            diplomaticStemEndY = atY2 - atLength
            diplomaticD = `M${atX1} ${diplomaticStemEndY} L${atX2} ${atY2}`
            setAnimation({
              element: atStem,
              states: {
                finding: { type: 'translate', val: atNotesPositions[0].dtVal },
                normalization: { type: 'translate', val: atNotesPositions[0].dtVal },
                // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
                regulation: { type: 'translate', val: atNotesPositions[0].atVal },
                supplements: { type: 'translate', val: atNotesPositions[0].atVal },
                interventions: { type: 'translate', val: atNotesPositions[0].atVal }
              }
            })
          }
        } else {
          // Stem goes down: keep top (lower y) fixed, extend downward (higher y)
          if (atY1 < atY2) {
            // M is top, L is bottom - keep M fixed
            findingsStemEndY = atY1 + newLength
            findingsD = `M${atX1} ${atY1} L${atX2} ${findingsStemEndY}`
            diplomaticStemEndY = atY1 + atLength
            diplomaticD = `M${atX1} ${atY1} L${atX2} ${diplomaticStemEndY}`
            setAnimation({
              element: atStem,
              states: {
                finding: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].dtVal },
                normalization: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].dtVal },
                // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
                regulation: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].atVal },
                supplements: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].atVal },
                interventions: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].atVal }
              }
            })
          } else {
            // M is bottom, L is top - keep L fixed
            findingsStemEndY = atY2 + newLength
            findingsD = `M${atX1} ${findingsStemEndY} L${atX2} ${atY2}`
            diplomaticStemEndY = atY2 + atLength
            diplomaticD = `M${atX1} ${diplomaticStemEndY} L${atX2} ${atY2}`
            setAnimation({
              element: atStem,
              states: {
                finding: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].dtVal },
                normalization: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].dtVal },
                // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
                regulation: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].atVal },
                supplements: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].atVal },
                interventions: { type: 'translate', val: atNotesPositions[atNotesPositions.length - 1].atVal }
              }
            })
          }
        }

        setAnimation({
          element: atStem,
          states: {
            finding: { type: 'd', val: findingsD },
            normalization: { type: 'd', val: diplomaticD },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'd', val: atD },
            supplements: { type: 'd', val: atD },
            interventions: { type: 'd', val: atD }
          }
        })

        // Animate the flag if present
        const flag = chord.querySelector('.flag')
        if (flag) {
          // Calculate the difference in stem end Y position for finding and normalization
          const originalStemEndY = stemDir === 'up' ? Math.min(atY1, atY2) : Math.max(atY1, atY2)
          const findingsDiff = findingsStemEndY - originalStemEndY
          const diplomaticDiff = diplomaticStemEndY - originalStemEndY

          // Match the note-derived translation applied to the stem itself.
          const stemPosition = stemDir === 'up'
            ? atNotesPositions[0]
            : atNotesPositions[atNotesPositions.length - 1]
          const [regulationStemX, regulationStemY] = stemPosition.atVal.split(' ').map(Number)
          const [findingStemX, findingStemY] = stemPosition.dtVal.split(' ').map(Number)
          const findingsFlagVal = `${findingStemX} ${findingStemY + findingsDiff}`
          const diplomaticFlagVal = `${findingStemX} ${findingStemY + diplomaticDiff}`

          // Add translate animation: flags follow the stem endpoint
          setAnimation({
            element: flag,
            states: {
              finding: { type: 'translate', val: findingsFlagVal },
              normalization: { type: 'translate', val: diplomaticFlagVal },
              // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
              regulation: { type: 'translate', val: `${regulationStemX} ${regulationStemY}` },
              supplements: { type: 'translate', val: `${regulationStemX} ${regulationStemY}` },
              interventions: { type: 'translate', val: `${regulationStemX} ${regulationStemY}` }
            }
          })
        }
      }
    })
  })
}
