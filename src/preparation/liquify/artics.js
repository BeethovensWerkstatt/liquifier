/**
 * Animate articulation symbols between AT and DT transcriptions
 * 
 * Articulations are performance markings like staccato dots, accent marks, tenuto lines, etc.
 * In this dataset, articulations are typically editorial additions and may not have
 * corresponding elements in the DT.
 * 
 * SVG Structure:
 * - AT: <g class="artic"> contains <use> element with transform="translate(x, y)"
 * - DT: Articulations are typically not present (editorial additions)
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions
 */
export const liquifyArtics = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, addTransformTranslate, generateHideAnimation, logger } = tools

  // Get all articulation groups from fluid transcription (excluding bounding boxes)
  const artics = ftSvg.querySelectorAll('g.artic:not(.bounding-box)')
  
  logger.info(`[liquifyArtics] Processing ${artics.length} articulations`)

  artics.forEach(atArtic => {
    const atId = atArtic.getAttribute('data-id')
    
    if (!atId) {
      logger.warn('[liquifyArtics] Artic element missing data-id, skipping')
      return
    }

    // Get the corresponding DT element IDs from MEI @corresp
    const dtIds = correspMappings.get(atId)
    
    // If no DT correspondence, this is an editorial addition - fade it out
    if (!dtIds || dtIds.length === 0) {
      logger.debug(`[liquifyArtics] No DT correspondence for artic ${atId}, fading out (editorial)`)
      generateHideAnimation(atArtic)
      return
    }

    // Find the <use> element within the artic group
    const atUse = atArtic.querySelector('use')
    if (!atUse) {
      logger.warn(`[liquifyArtics] No use element found in artic ${atId}`)
      return
    }

    // Extract AT position from transform attribute
    const atTransform = atUse.getAttribute('transform')
    const atMatch = atTransform?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
    
    if (!atMatch) {
      logger.warn(`[liquifyArtics] Could not parse transform for artic ${atId}: ${atTransform}`)
      return
    }

    const atX = parseFloat(atMatch[1])
    const atY = parseFloat(atMatch[2])

    // Try to find corresponding DT artic element
    let dtArtic = null
    for (const dtId of dtIds) {
      const candidate = dtSvg.querySelector(`[data-id="${dtId}"]`)
      if (candidate) {
        dtArtic = candidate
        break
      }
    }

    if (!dtArtic) {
      logger.debug(`[liquifyArtics] No matching DT element found for artic ${atId}, fading out`)
      generateHideAnimation(atArtic)
      return
    }

    // Find the <use> element in DT artic
    const dtUse = dtArtic.querySelector('use')
    if (!dtUse) {
      logger.warn(`[liquifyArtics] No use element found in DT artic`)
      generateHideAnimation(atArtic)
      return
    }

    // Extract DT position from x and y attributes (DT uses attributes, not transform)
    const dtX = parseFloat(dtUse.getAttribute('x'))
    const dtY = parseFloat(dtUse.getAttribute('y'))

    if (isNaN(dtX) || isNaN(dtY)) {
      logger.warn(`[liquifyArtics] Invalid DT position for artic ${atId}: x=${dtX}, y=${dtY}`)
      generateHideAnimation(atArtic)
      return
    }

    // Calculate the new position using coordinate transformation
    const newPos = getNewPos({ x: atX, y: atY }, { x: dtX, y: dtY })
    
    // Calculate the translation offset needed
    const translateX = newPos.x - atX
    const translateY = newPos.y - atY

    logger.debug(`[liquifyArtics] Animating artic ${atId}: AT(${atX}, ${atY}) -> DT(${dtX}, ${dtY}) -> newPos(${newPos.x}, ${newPos.y})`)

    // Add animation to the artic group
    addTransformTranslate(atArtic, [`0 0`, `${translateX} ${translateY}`])
  })

  logger.info('[liquifyArtics] Finished processing articulations')
}
