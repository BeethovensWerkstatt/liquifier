/**
 * Animate curves (slurs, ties, etc.) between AT and DT transcriptions
 * For each curve in the AT (fluid transcription):
 * - Animates the curve path based on corresponding DT curve position
 * - Handles curves without DT correspondence by fading them out
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data
 * @returns {Element|null} Resulting object.
 */
export const liquifyCurves = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { convertD, correspMappings, setAnimation } = tools

  const curves = ftSvg.querySelectorAll('.slur:not(.bounding-box), .tie:not(.bounding-box), .curve:not(.bounding-box)')
  curves.forEach(curve => {
    const atId = curve.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)
    if (!dtIds || dtIds.length === 0) {
      const atPath = curve.querySelector('path')
      setAnimation({
        element: atPath || curve,
        states: {
          finding: null,
          normalization: null,
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'd', val: atPath?.getAttribute('d') || '' },
          supplements: { type: 'd', val: atPath?.getAttribute('d') || '' },
          interventions: { type: 'd', val: atPath?.getAttribute('d') || '' }
        }
      })
      return
    }

    // Filter to only DT curves that exist in this system's DT SVG
    const availableDtIds = dtIds.filter(dtId => {
      return dtSvg.querySelector(`.curve[data-id="${dtId}"]`) !== null
    })

    if (availableDtIds.length === 0) {
      // No DT curves in this system - fade out
      const atPath = curve.querySelector('path')
      setAnimation({
        element: atPath || curve,
        states: {
          finding: null,
          normalization: null,
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'd', val: atPath?.getAttribute('d') || '' },
          supplements: { type: 'd', val: atPath?.getAttribute('d') || '' },
          interventions: { type: 'd', val: atPath?.getAttribute('d') || '' }
        }
      })
      return
    }

    // Create array to hold the original and cloned curves
    const curveElements = [curve]

    // If multiple DT curves in this system, create clones for each additional one
    if (availableDtIds.length > 1) {
      const parent = curve.parentNode
      for (let i = 1; i < availableDtIds.length; i++) {
        const clone = curve.cloneNode(true)
        // Insert clone after the previous element
        parent.insertBefore(clone, curveElements[i - 1].nextSibling)
        curveElements.push(clone)
      }
    }

    // Iterate through available DT curves with corresponding AT elements
    availableDtIds.forEach((dtId, index) => {
      const currentCurve = curveElements[index]
      const dtCurve = dtSvg.querySelector(`.curve[data-id="${dtId}"]`)

      if (!dtCurve) {
        // Should not happen after filtering, but handle it anyway
        const atPath = currentCurve.querySelector('path')
        setAnimation({
          element: atPath || currentCurve,
          states: {
            finding: null,
            normalization: null,
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'd', val: atPath?.getAttribute('d') || '' },
            supplements: { type: 'd', val: atPath?.getAttribute('d') || '' },
            interventions: { type: 'd', val: atPath?.getAttribute('d') || '' }
          }
        })
        return
      }

      // Animate curve path
      const atPath = currentCurve.querySelector('path')
      const dtPath = dtCurve.querySelector('path')
      if (atPath && dtPath) {
        const atD = atPath.getAttribute('d')
        const dtD = dtPath.getAttribute('d')
        const newD = convertD(atD, dtD)
        setAnimation({
          element: atPath,
          states: {
            finding: { type: 'd', val: newD },
            normalization: { type: 'd', val: newD },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'd', val: atD },
            supplements: { type: 'd', val: atD },
            interventions: { type: 'd', val: atD }
          }
        })
      }
    })
  })
}
