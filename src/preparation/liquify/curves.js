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
  const { scaleFactor, getNewPos, convertD, correspMappings, setAnimation } = tools
  
  const curves = ftSvg.querySelectorAll('.slur:not(.bounding-box), .tie:not(.bounding-box)')
  curves.forEach(curve => {
  const atId = curve.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)
    if (!dtIds || dtIds.length === 0) {
      setAnimation({
        element: curve,
        id: atId,
        localName: 'curve',
        states: {
          findings: null,
          diplomatic: null,
          supplements: { type: 'd', val: curve.querySelector('path')?.getAttribute('d') || '' },
          conjectures: { type: 'd', val: curve.querySelector('path')?.getAttribute('d') || '' },
          annotated: { type: 'd', val: curve.querySelector('path')?.getAttribute('d') || '' }
        }
      })
      return
    }
     
    dtIds.forEach(dtId => {
      const dtCurve = dtSvg.querySelector(`.curve[data-id="${dtId}"]`)
      if (!dtCurve) {
        setAnimation({
          element: curve,
          id: atId,
          localName: 'curve',
          states: {
          findings: null,
          diplomatic: null,
          supplements: { type: 'd', val: curve.querySelector('path')?.getAttribute('d') || '' },
          conjectures: { type: 'd', val: curve.querySelector('path')?.getAttribute('d') || '' },
          annotated: { type: 'd', val: curve.querySelector('path')?.getAttribute('d') || '' }
        }
        })
        return
      }

      // Animate curve path
      const atPath = curve.querySelector('path')
      const dtPath = dtCurve.querySelector('path')
      if (atPath && dtPath) {
        const atD = atPath.getAttribute('d')
        const dtD = dtPath.getAttribute('d')
        const newD = convertD(atD, dtD)
        setAnimation({
          element: atPath,
          id: `${atId}-path`,
          localName: 'curve-path',
          states: {
          findings: { type: 'd', val: newD },
          diplomatic: { type: 'd', val: newD },
          supplements: { type: 'd', val: atD },
          conjectures: { type: 'd', val: atD },
          annotated: { type: 'd', val: atD }
        }
        })
      }
    })
  })
}
