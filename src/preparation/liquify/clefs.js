/**
 * Animate clefs between AT and DT transcriptions
 * 
 * For each clef in the AT (fluid transcription):
 * - Animates the clef position based on corresponding DT clef position
 * - Handles clefs without DT correspondence by fading them out
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data
 */
export const liquifyClefs = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { scaleFactor, getNewPos, convertD, correspMappings, setAnimation, logger } = tools

  const clefs = ftSvg.querySelectorAll('.clef:not(.bounding-box)')
  clefs.forEach(clef => {
    const atId = clef.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      setAnimation({
        element: clef,
        id: atId,
        localName: 'clef',
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

    // Create array to hold the original and cloned clefs
    const clefElements = [clef]
    
    // If multiple dtIds, create clones for each additional one
    if (dtIds.length > 1) {
      const parent = clef.parentNode
      for (let i = 1; i < dtIds.length; i++) {
        const clone = clef.cloneNode(true)
        // Insert clone after the previous element
        parent.insertBefore(clone, clefElements[i - 1].nextSibling)
        clefElements.push(clone)
      }
    }

    // Now iterate dtIds with corresponding clef elements
    dtIds.forEach((dtId, index) => {
      const currentClef = clefElements[index]
      const dtClef = dtSvg.querySelector(`.clef[data-id="${dtId}"]`)
      if (!dtClef) {
        setAnimation({
          element: currentClef,
          id: `${atId}-${index}`,
          localName: 'clef',
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
      
      const atUse = currentClef.querySelector('use')
      const dtUse = dtClef.querySelector('use')
      if (atUse && dtUse) {
        // AT clefs use transform="translate(x, y) scale(...)" on the use element
        const atTransform = atUse.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
        if (!atTransform) return
        
        const atX = parseFloat(atTransform[1])
        const atY = parseFloat(atTransform[2])
        
        // DT clefs use x and y attributes on the use element
        const dtX = parseFloat(dtUse.getAttribute('x') || 0)
        const dtY = parseFloat(dtUse.getAttribute('y') || 0)
        
        // Transform DT position to AT coordinate system
        const newPos = getNewPos({ x: atX, y: atY }, { x: dtX, y: dtY })
        
        // Calculate the movement difference
        const diffX = newPos.x - atX
        const diffY = newPos.y - atY
        
        logger.debug(`[Clef Animation ${index}]`)
        logger.debug(`  AT pos: (${atX}, ${atY})`)
        logger.debug(`  DT pos: (${dtX}, ${dtY})`)
        logger.debug(`  newPos: (${newPos.x}, ${newPos.y})`)
        logger.debug(`  diff: (${diffX}, ${diffY})`)
        logger.debug(`  AT ID: ${atId}, DT ID: ${dtId}`)
        
        // Apply animation to the clef group
        const atVal = '0 0'
        const dtVal = `${diffX} ${diffY}`
        setAnimation({
          element: currentClef,
          id: `${atId}-${index}`,
          localName: 'clef',
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
