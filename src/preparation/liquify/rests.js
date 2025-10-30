import { appendNewElement } from '../../utils/dom.js'

/**
 * Animates rest elements in a fluid transcript.
 * Rests are simpler than notes as they only need position animation,
 * without stems, flags, or other child elements.
 * 
 * @param {SVGElement} ftSvg - The fluid transcript SVG element
 * @param {SVGElement} dtSvg - The diplomatic transcript SVG element
 * @param {Document} atMeiDom - The annotated transcript MEI DOM (for corresp mapping)
 * @param {Object} tools - Utility functions and data
 * @param {Function} tools.getNewPos - Transforms coordinates from DT to AT system
 * @param {Function} tools.convertD - Transforms entire path d attributes
 * @param {number} tools.scaleFactor - Scale factor between AT and DT
 * @param {Map} tools.correspMappings - Maps AT IDs to DT IDs
 * @param {Function} tools.addTransformTranslate - Adds animateTransform for translate
 * @param {Function} tools.addTransform - Adds animate element for any attribute
 * @param {Function} tools.generateHideAnimation - Fades out elements without DT correspondence
 * 
 * @example
 * // Rest structure in AT:
 * // <g data-id="x123" class="rest">
 * //   <use href="#E4E5" transform="translate(1234, 5678) scale(0.72, 0.72)"/>
 * // </g>
 * 
 * // Rest structure in DT:
 * // <g data-id="d456" class="rest">
 * //   <use href="#sym_rest_quarter" x="2345" y="13456"/>
 * // </g>
 */
export function liquifyRests (ftSvg, dtSvg, atMeiDom, tools) {
  const { scaleFactor, getNewPos, correspMappings, addTransformTranslate, generateHideAnimation, logger } = tools
  
  const rests = ftSvg.querySelectorAll('g.rest:not(.bounding-box)')
  rests.forEach(rest => {
    const atId = rest.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)
    
    if (!dtIds || dtIds.length === 0) {
      generateHideAnimation(rest)
      return
    }

    // Extract AT position from the use element's transform
    const atUse = rest.querySelector('use')
    if (!atUse) return
    
    const atTransform = atUse.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
    if (!atTransform) return
    
    const atX = parseFloat(atTransform[1])
    const atY = parseFloat(atTransform[2])

    // Animate to the first DT correspondence (rests typically have 1:1 correspondence)
    dtIds.forEach(dtId => {
      const dtRest = dtSvg.querySelector(`g.rest[data-id="${dtId}"]`)
      if (!dtRest) {
        generateHideAnimation(rest)
        return
      }

      const dtUse = dtRest.querySelector('use')
      if (!dtUse) return

      // Extract DT position from x/y attributes
      const dtX = parseFloat(dtUse.getAttribute('x') || 0)
      const dtY = parseFloat(dtUse.getAttribute('y') || 0)

      // Transform DT position to AT coordinate system
      const newPos = getNewPos({ x: atX, y: atY }, { x: dtX, y: dtY })

      // Calculate relative offset
      const diffX = newPos.x - atX
      const diffY = newPos.y - atY

      logger.debug(`[Rest Animation] AT: (${atX}, ${atY}), DT: (${dtX}, ${dtY}), newPos: (${newPos.x}, ${newPos.y}), diff: (${diffX}, ${diffY})`)

      // Apply animation to the rest group
      const atVal = '0 0'
      const dtVal = `${diffX} ${diffY}`
      addTransformTranslate(rest, [atVal, dtVal])
    })
  })
}
