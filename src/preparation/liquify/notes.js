/**
 * Animate notes between AT and DT transcriptions, including noteheads, stems, ledger lines, and flags
 * 
 * For each note in the AT (fluid transcription):
 * - Animates the notehead position based on corresponding DT note position
 * - Animates associated ledger lines to follow the notehead
 * - Scales and animates the stem length based on DT stem length and scale factor
 * - Animates flags (if present) to follow the stem endpoint
 * - Handles notes without DT correspondence by fading them out
 * 
 * Stem animation logic:
 * - For stem.dir="up": keeps the bottom fixed and extends/contracts upward
 * - For stem.dir="down": keeps the top fixed and extends/contracts downward
 * - Handles both drawing directions (M-top-L-bottom and M-bottom-L-top)
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing note metadata (stem.dir, etc.)
 * @param {Object} tools - Tools object containing helper functions and data
 */
export const liquifyNotes = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { scaleFactor, getNewPos, correspMappings, setAnimation, logger } = tools
  
  const notes = ftSvg.querySelectorAll('g.note:not(.bounding-box)')
  notes.forEach(note => {
    // Skip notes that are inside chords - they will be handled by liquifyChords
    if (note.closest('g.chord:not(.bounding-box)')) {
      return
    }
    
    const atId = note.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)
    
    // Animate the notehead - extract x, y from transform translate()
    const atHeadUse = note.querySelector('.notehead > use')
    const atHeadTranslate = atHeadUse?.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
    if (!atHeadTranslate) return

    const atHead = { x: parseFloat(atHeadTranslate[1]), y: parseFloat(atHeadTranslate[2]) }

    // If no DT correspondence, hide the note
    if (!dtIds || dtIds.length === 0) {
      setAnimation({
        element: note,
        id: atId,
        localName: 'note',
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

    dtIds.forEach(dtId => {
      const dtNote = dtSvg.querySelector(`g.note[data-id="${dtId}"]`)
      if (!dtNote) {
        setAnimation({
          element: note,
          id: atId,
          localName: 'note',
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
      const dtHead = { x: parseFloat(dtNote.querySelector('.notehead > use')?.getAttribute('x')),
          y: parseFloat(dtNote.querySelector('.notehead > use')?.getAttribute('y')) }

      // Animate the notehead
      const newHeadPos = getNewPos(atHead, dtHead)
      const atVal = '0 0'
      const dtVal = parseFloat(newHeadPos.x - atHead.x) + ' ' + parseFloat(newHeadPos.y - atHead.y)

      setAnimation({
        element: note,
        id: atId,
        localName: 'note',
        states: {
          findings: { type: 'translate', val: dtVal },
          diplomatic: { type: 'translate', val: dtVal },
          supplements: { type: 'translate', val: atVal },
          conjectures: { type: 'translate', val: atVal },
          annotated: { type: 'translate', val: atVal }
        }
      })

      // identify relevant ledger lines
      note.closest('.measure').querySelectorAll('.ledgerLines .lineDash').forEach(ledgerLine => {
        if (ledgerLine.hasAttribute('data-related')) {
          const relatedIds = ledgerLine.getAttribute('data-related')
          // Check if this note's ID is included in the space-separated list of related IDs
          if (relatedIds.includes('#' + atId)) {
            const ledgerId = ledgerLine.getAttribute('data-id') || `ledger-${atId}`
            setAnimation({
              element: ledgerLine,
              id: ledgerId,
              localName: 'ledgerLine',
              states: {
                findings: { type: 'translate', val: dtVal },
                diplomatic: { type: 'translate', val: dtVal },
                supplements: { type: 'translate', val: atVal },
                conjectures: { type: 'translate', val: atVal },
                annotated: { type: 'translate', val: atVal }
              }
            })
          }
        }
      }) 

      // Animate the stem
      const atStem = note.querySelector('.stem > path')
      if (atStem) {
        const dtStem = dtNote.querySelector('.stem > path')
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
        const dtX1 = parseFloat(dtMatch[1])
        const dtY1 = parseFloat(dtMatch[2])
        const dtX2 = parseFloat(dtMatch[3])
        const dtY2 = parseFloat(dtMatch[4])
        
        // Calculate stem lengths
        const atLength = Math.abs(atY2 - atY1)
        const dtLength = Math.abs(dtY2 - dtY1)
        const newLength = dtLength * scaleFactor
        
        // Get stem direction from MEI - use attribute selector that works in Node.js
        const meiNote = atMeiDom.querySelector(`note[xml\\:id="${atId}"]`)
        const stemDir = meiNote?.getAttribute('stem.dir') || 'up'
        
        // Calculate stem path for FINDINGS state: DT position, DT length (scaled)
        let findingsD, findingsStemEndY
        if (stemDir === 'up') {
          // Stem goes up: keep bottom (higher y) fixed, extend upward (lower y)
          if (atY1 > atY2) {
            // M is bottom, L is top - keep M fixed
            findingsStemEndY = atY1 - newLength
            findingsD = `M${atX1} ${atY1} L${atX2} ${findingsStemEndY}`
          } else {
            // M is top, L is bottom - keep L fixed
            findingsStemEndY = atY2 - newLength
            findingsD = `M${atX1} ${findingsStemEndY} L${atX2} ${atY2}`
          }
        } else {
          // Stem goes down: keep top (lower y) fixed, extend downward (higher y)
          if (atY1 < atY2) {
            // M is top, L is bottom - keep M fixed
            findingsStemEndY = atY1 + newLength
            findingsD = `M${atX1} ${atY1} L${atX2} ${findingsStemEndY}`
          } else {
            // M is bottom, L is top - keep L fixed
            findingsStemEndY = atY2 + newLength
            findingsD = `M${atX1} ${findingsStemEndY} L${atX2} ${atY2}`
          }
        }
        
        // Calculate stem path for DIPLOMATIC state: DT position, AT length
        let diplomaticD, diplomaticStemEndY
        if (stemDir === 'up') {
          // Stem goes up: keep bottom (higher y) fixed, use AT length
          if (atY1 > atY2) {
            // M is bottom, L is top - keep M fixed
            diplomaticStemEndY = atY1 - atLength
            diplomaticD = `M${atX1} ${atY1} L${atX2} ${diplomaticStemEndY}`
          } else {
            // M is top, L is bottom - keep L fixed
            diplomaticStemEndY = atY2 - atLength
            diplomaticD = `M${atX1} ${diplomaticStemEndY} L${atX2} ${atY2}`
          }
        } else {
          // Stem goes down: keep top (lower y) fixed, use AT length
          if (atY1 < atY2) {
            // M is top, L is bottom - keep M fixed
            diplomaticStemEndY = atY1 + atLength
            diplomaticD = `M${atX1} ${atY1} L${atX2} ${diplomaticStemEndY}`
          } else {
            // M is bottom, L is top - keep L fixed
            diplomaticStemEndY = atY2 + atLength
            diplomaticD = `M${atX1} ${diplomaticStemEndY} L${atX2} ${atY2}`
          }
        }
        
        setAnimation({
          element: atStem,
          id: `${atId}-stem`,
          localName: 'stem',
          states: {
            findings: { type: 'd', val: findingsD },
            diplomatic: { type: 'd', val: diplomaticD },
            supplements: { type: 'd', val: atD },
            conjectures: { type: 'd', val: atD },
            annotated: { type: 'd', val: atD }
          }
        })

        // Animate the flag if present
        const flag = note.querySelector('.flag')
        if (flag) {
          // Calculate the difference in stem end Y position for each state
          const originalStemEndY = stemDir === 'up' ? Math.min(atY1, atY2) : Math.max(atY1, atY2)
          const findingsDiff = findingsStemEndY - originalStemEndY
          const diplomaticDiff = diplomaticStemEndY - originalStemEndY
          
          // Add translate animation: flags follow the stem endpoint
          setAnimation({
            element: flag,
            id: `${atId}-flag`,
            localName: 'flag',
            states: {
              findings: { type: 'translate', val: `0 ${findingsDiff}` },
              diplomatic: { type: 'translate', val: `0 ${diplomaticDiff}` },
              supplements: { type: 'translate', val: '0 0' },
              conjectures: { type: 'translate', val: '0 0' },
              annotated: { type: 'translate', val: '0 0' }
            }
          })
        }
      }
    })
  })
}
