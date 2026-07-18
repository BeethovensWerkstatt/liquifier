import { removeElement } from '../../utils/dom.js'

/**
 * Merge AT barLine paths sharing the same x position into single continuous lines
 * For each barLine group in the AT, identifies all vertical path segments and groups them
 * by their x coordinate. Paths with the same x position (representing the same vertical
 * line across multiple staves) are merged into a single continuous path stretching from
 * the topmost to the lowest y coordinate. This consolidates multi-staff barlines that
 * are rendered as separate segments per staff into unified lines.
 *
 * @param {SVGElement} svg - AT SVG DOM containing barLine elements
 * @returns {void} No return value.
 */
const adjustAtBarLines = (svg) => {
  const barLines = svg.querySelectorAll('g.measure:not(.bounding-box) .barLine:not(.bounding-box)')

  barLines.forEach(barLineG => {
    const paths = barLineG.querySelectorAll('path')
    if (paths.length === 0) return

    // Group paths by their x position
    const linesByX = new Map()

    paths.forEach(path => {
      const d = path.getAttribute('d')
      const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
      if (!match) return

      const x1 = parseFloat(match[1])
      const y1 = parseFloat(match[2])
      const x2 = parseFloat(match[3])
      const y2 = parseFloat(match[4])
      const strokeWidth = path.getAttribute('stroke-width')

      // Check if this is a vertical line (x1 === x2)
      if (x1 === x2) {
        const x = x1
        if (!linesByX.has(x)) {
          linesByX.set(x, { yCoords: [], strokeWidth })
        }
        linesByX.get(x).yCoords.push(y1, y2)
      }
    })

    // Remove all existing paths
    paths.forEach(path => removeElement(path))

    // Create merged paths
    linesByX.forEach(({ yCoords, strokeWidth }, x) => {
      const minY = Math.min(...yCoords)
      const maxY = Math.max(...yCoords)

      const doc = barLineG.ownerDocument || barLineG
      const newPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
      newPath.setAttribute('d', `M${x} ${minY} L${x} ${maxY}`)
      newPath.setAttribute('stroke-width', strokeWidth)
      barLineG.appendChild(newPath)
    })
  })
}

/**
 * Animate barlines between AT and DT transcriptions
 * First merges multi-staff barlines in the AT into single continuous lines,
 * then animates each barline path based on corresponding DT barline position.
 * Handles measures without DT correspondence by fading them out.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data
 * @returns {Element|null} Resulting object.
 */
export const liquifyBarlines = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation } = tools

  // First, merge multi-staff barlines into single continuous lines
  adjustAtBarLines(ftSvg)

  const measures = ftSvg.querySelectorAll('.measure:not(.bounding-box)')
  measures.forEach(measure => {
    const atId = measure.getAttribute('data-id')

    // Animate the barline
    const atBarline = [...measure.querySelectorAll('.barLine > path')]
    if (atBarline.length === 0) return

    const dtIds = correspMappings.get(atId)
    if (!dtIds || dtIds.length === 0) {
      atBarline.forEach((barLine) =>
        setAnimation({
          element: barLine,
          states: {
            finding: null,
            normalization: null,
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'd', val: barLine.getAttribute('d') },
            supplements: { type: 'd', val: barLine.getAttribute('d') },
            interventions: { type: 'd', val: barLine.getAttribute('d') }
          }
        })
      )
      return
    }

    // Filter to only DT barlines that exist in this system's DT SVG
    const availableDtIds = dtIds.filter(dtId => {
      return dtSvg.querySelector('.barLine[data-id="' + dtId + '"] path') !== null
    })

    if (availableDtIds.length === 0) {
      // No DT barline in this system - fade out
      atBarline.forEach((barLine) =>
        setAnimation({
          element: barLine,
          states: {
            finding: null,
            normalization: null,
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'd', val: barLine.getAttribute('d') },
            supplements: { type: 'd', val: barLine.getAttribute('d') },
            interventions: { type: 'd', val: barLine.getAttribute('d') }
          }
        })
      )
      return
    }

    // Create array to hold the original and cloned barLine paths
    const barLineElements = atBarline.slice()

    // If multiple DT barlines in this system, create clones for each additional one
    if (availableDtIds.length > atBarline.length) {
      const parent = atBarline[atBarline.length - 1].parentNode
      for (let i = atBarline.length; i < availableDtIds.length; i++) {
        const clone = atBarline[0].cloneNode(true)
        // Insert clone after the previous element
        parent.insertBefore(clone, atBarline[i - 1].nextSibling)
        barLineElements.push(clone)
      }
    }

    // Iterate through available DT barlines with corresponding AT elements
    availableDtIds.forEach((dtId, index) => {
      const currentBarLine = barLineElements[index]
      const dtBarline = dtSvg.querySelector('.barLine[data-id="' + dtId + '"] path')

      if (!dtBarline) {
        // Should not happen after filtering, but handle it anyway
        setAnimation({
          element: currentBarLine,
          states: {
            finding: null,
            normalization: null,
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'd', val: currentBarLine.getAttribute('d') },
            supplements: { type: 'd', val: currentBarLine.getAttribute('d') },
            interventions: { type: 'd', val: currentBarLine.getAttribute('d') }
          }
        })
        return
      }

      const atPath = currentBarLine.getAttribute('d')
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

      setAnimation({
        element: currentBarLine,
        states: {
          finding: { type: 'd', val: dtVal },
          normalization: { type: 'd', val: dtVal },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'd', val: atVal },
          supplements: { type: 'd', val: atVal },
          interventions: { type: 'd', val: atVal }
        }
      })
    })
  })
}
