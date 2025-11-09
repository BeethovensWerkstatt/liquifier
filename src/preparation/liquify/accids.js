/**
 * Animate accidentals between AT and DT transcriptions
 * 
 * For each accidental in the AT (fluid transcription):
 * - Animates the accidental position based on corresponding DT accidental position
 * - Handles accidentals without DT correspondence by fading them out
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data
 */
export const liquifyAccids = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { scaleFactor, getNewPos, convertD, correspMappings, setAnimation, logger } = tools
  
  // TODO: Implement keyAccids!

  const accidentals = ftSvg.querySelectorAll('.accid:not(.bounding-box), .keyAccid:not(.bounding-box)')
  accidentals.forEach(accid => {
    const atId = accid.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      setAnimation({
        element: accid,
        id: atId,
        localName: 'accid',
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

    // Find the parent note's or chord's animation values (if accid is inside a note/chord)
    // We need to account for the note/chord's movement when calculating accid animation
    // Key signature accidentals don't have parent notes, so skip for them
    const isKeyAccid = accid.classList.contains('keyAccid')
    let noteAnimationDiff = { x: 0, y: 0 }
    
    if (!isKeyAccid) {
      const parentChord = accid.closest('g.chord:not(.bounding-box)')
      const parentNote = accid.closest('g.note:not(.bounding-box)')
      
      // Check chord first, as notes inside chords are children of the chord
      const parentToCheck = parentChord || parentNote
      
      if (parentToCheck) {
        // Extract the parent's animation values from its animateTransform
        const parentAnimation = parentToCheck.querySelector(':scope > animateTransform[type="translate"]')
        if (parentAnimation) {
          const parentValues = parentAnimation.getAttribute('values')
          // Extract the first position (findings/diplomatic state)
          // Pattern: "x y;..." where we want the first x y values
          const parentMatch = parentValues?.match(/^\s*([-\d.]+)\s+([-\d.]+)/)
          if (parentMatch) {
            noteAnimationDiff = { x: parseFloat(parentMatch[1]), y: parseFloat(parentMatch[2]) }
            logger.debug(`[Accid] Parent ${parentChord ? 'chord' : 'note'} animation diff: (${noteAnimationDiff.x}, ${noteAnimationDiff.y})`)
          }
        }
      }
    }

    // Create array to hold the original and cloned accidentals
    const accidElements = [accid]
    
    // If multiple dtIds, create clones for each additional one
    if (dtIds.length > 1) {
      const parent = accid.parentNode
      for (let i = 1; i < dtIds.length; i++) {
        const clone = accid.cloneNode(true)
        // Insert clone after the previous element
        parent.insertBefore(clone, accidElements[i - 1].nextSibling)
        accidElements.push(clone)
      }
    }

    // Now iterate dtIds with corresponding accid elements
    dtIds.forEach((dtId, index) => {
      const currentAccid = accidElements[index]
      const dtAccid = dtSvg.querySelector(`.accid[data-id="${dtId}"]`)
      if (!dtAccid) {
        setAnimation({
          element: currentAccid,
          id: `${atId}-${index}`,
          localName: 'accid',
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
      
      const atUse = currentAccid.querySelector('use')
      const dtUse = dtAccid.querySelector('use')
      if (atUse && dtUse) {
        // AT accidentals use transform="translate(x, y) scale(...)" on the use element
        const atTransform = atUse.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
        if (!atTransform) return
        
        const atX = parseFloat(atTransform[1])
        const atY = parseFloat(atTransform[2])
        
        // DT accidentals use x and y attributes on the use element
        const dtX = parseFloat(dtUse.getAttribute('x') || 0)
        const dtY = parseFloat(dtUse.getAttribute('y') || 0)
        
        // Transform DT position to AT coordinate system
        const newPos = getNewPos({ x: atX, y: atY }, { x: dtX, y: dtY })
        
        // Calculate the accidental's absolute movement
        const absDiffX = newPos.x - atX
        const absDiffY = newPos.y - atY
        
        // Subtract the parent note's movement to get relative accid movement
        const diffX = absDiffX - noteAnimationDiff.x
        const diffY = absDiffY - noteAnimationDiff.y
        
        logger.debug(`[Accid Animation ${index}] ${atId} -> ${dtId}`)
        logger.debug(`  AT pos: (${atX}, ${atY})`)
        logger.debug(`  DT pos: (${dtX}, ${dtY})`)
        logger.debug(`  newPos: (${newPos.x}, ${newPos.y})`)
        logger.debug(`  abs diff:  (${absDiffX}, ${absDiffY})`)
        logger.debug(`  note diff: (${noteAnimationDiff.x}, ${noteAnimationDiff.y})`)
        logger.debug(`  rel diff:  (${diffX}, ${diffY})`)
        
        // Apply relative animation to the parent accid group
        const atVal = '0 0'
        const dtVal = `${diffX} ${diffY}`
        setAnimation({
          element: currentAccid,
          id: `${atId}-${index}`,
          localName: 'accid',
          states: {
          findings: { type: 'translate', val: dtVal },
          diplomatic: { type: 'translate', val: dtVal },
          supplements: { type: 'translate', val: atVal },
          conjectures: { type: 'translate', val: atVal },
          annotated: { type: 'translate', val: atVal }
        }
        })
      }
    })
  })
}
