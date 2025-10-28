/**
 * Animate barlines between AT and DT transcriptions
 * 
 * For each measure in the AT (fluid transcription):
 * - Animates the barline path based on corresponding DT barline position
 * - Handles measures without DT correspondence by fading them out
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data
 */
export const liquifyBarlines = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { scaleFactor, getNewPos, convertD, correspMappings, addTransform, addTransformTranslate, generateHideAnimation } = tools
  
  const measures = ftSvg.querySelectorAll('.measure:not(.bounding-box)')
  measures.forEach(measure => {
    const atId = measure.getAttribute('data-id')
    
    // Animate the barline
    const atBarline = [...measure.querySelectorAll('.barLine > path')]
    if (atBarline.length === 0) return

    const dtIds = correspMappings.get(atId)
    if (!dtIds || dtIds.length === 0) { 
      atBarline.forEach((barLine) =>
        generateHideAnimation(barLine)
      )
      return
    }

    dtIds.forEach(dtId => {
      const dtBarline = dtSvg.querySelector('.barLine[data-id="' + dtId + '"] path')
      if (!dtBarline) {
        atBarline.forEach((barLine) =>
          generateHideAnimation(barLine)
        )
        return
      }

      const atPath = atBarline[0].getAttribute('d')
      const dtPath = dtBarline.getAttribute('d')
      const atX1 = parseFloat(atPath.match(/M\s*([\d.-]+)\s+([\d.-]+)/)[1])
      const atY1 = parseFloat(atPath.match(/M\s*([\d.-]+)\s+([\d.-]+)/)[2])
      const atX2 = parseFloat(atPath.match(/L\s*([\d.-]+)\s+([\d.-]+)/)[1])
      const atY2 = parseFloat(atPath.match(/L\s*([\d.-]+)\s+([\d.-]+)/)[2])
      const dtX1 = parseFloat(dtPath.match(/M\s*([\d.-]+)\s+([\d.-]+)/)[1])
      const dtY1 = parseFloat(dtPath.match(/M\s*([\d.-]+)\s+([\d.-]+)/)[2])
      const dtX2 = parseFloat(dtPath.match(/L\s*([\d.-]+)\s+([\d.-]+)/)[1])
      const dtY2 = parseFloat(dtPath.match(/L\s*([\d.-]+)\s+([\d.-]+)/)[2])

      const newStartPos = getNewPos({ x: atX1, y: atY1 }, { x: dtX1, y: dtY1 })
      const newEndPos = getNewPos({ x: atX2, y: atY2 }, { x: dtX2, y: dtY2 })

      const atVal = atPath
      const dtVal = `M${newStartPos.x} ${newStartPos.y} L${newEndPos.x} ${newEndPos.y}`

      addTransform(atBarline[0], 'd', [atVal, dtVal])
    })
  })
}
