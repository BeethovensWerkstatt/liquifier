/**
 * Animate curves (slurs, ties, etc.) between AT and DT transcriptions
 * 
 * For each curve in the AT (fluid transcription):
 * - Animates the curve path based on corresponding DT curve position
 * - Handles curves without DT correspondence by fading them out
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data
 */
export const liquifyCurves = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { scaleFactor, getNewPos, convertD, correspMappings, addTransform, addTransformTranslate, generateHideAnimation } = tools
  
  const curves = ftSvg.querySelectorAll('.slur:not(.bounding-box), .tie:not(.bounding-box)')
  curves.forEach(curve => {
  const atId = curve.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)
    if (!dtIds || dtIds.length === 0) {
      generateHideAnimation(curve)
      return
    }
     
    dtIds.forEach(dtId => {
      const dtCurve = dtSvg.querySelector(`.curve[data-id="${dtId}"]`)
      if (!dtCurve) {
        generateHideAnimation(curve)
        return
      }

      // Animate curve path
      const atPath = curve.querySelector('path')
      const dtPath = dtCurve.querySelector('path')
      if (atPath && dtPath) {
        const atD = atPath.getAttribute('d')
        const dtD = dtPath.getAttribute('d')
        const newD = convertD(atD, dtD)
        addTransform(atPath, 'd', [atD, newD])
      }
    })
  })
}
