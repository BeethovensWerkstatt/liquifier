/**
 * Animate AT line-like elements by cross-fading mapped DT polygons.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {SVGElement} dtSvg - Diplomatic transcription SVG.
 * @param {Object} tools - Animation helper bundle.
 * @param {string[]} selectors - Selectors for AT line-like elements.
 * @returns {void}
 */
export function liquifyLinePolygons (ftSvg, dtSvg, tools, selectors) {
  const { applyUnmatchedClass, correspMappings, getNewPos, setAnimation } = tools

  ftSvg.querySelectorAll(selectors.join(', ')).forEach(atLine => {
    if (atLine.classList?.contains('bounding-box')) return

    const atId = atLine.getAttribute('data-id')
    const dtIds = atId ? correspMappings.get(atId) || [] : []
    const dtLines = dtIds
      .map(dtId => dtSvg.querySelector(`g.line[data-id="${dtId}"]`))
      .filter(Boolean)

    if (dtLines.length === 0) {
      applyUnmatchedClass(atLine)
      setAnimation({
        element: atLine,
        states: {
          finding: null,
          normalization: null,
          regulation: { type: 'display', val: 'inline' },
          supplements: { type: 'display', val: 'inline' },
          interventions: { type: 'display', val: 'inline' }
        }
      })
      return
    }

    setAnimation({
      element: atLine,
      states: {
        finding: { type: 'opacity', val: '0' },
        normalization: { type: 'opacity', val: '0' },
        readingOrder: { type: 'opacity', val: '0' },
        regulation: { type: 'opacity', val: '1' },
        supplements: { type: 'opacity', val: '1' },
        interventions: { type: 'opacity', val: '1' }
      }
    })

    dtLines.forEach((dtLine, index) => {
      const points = dtLine.querySelector('polygon')?.getAttribute('points')
      if (!points) return

      const polygon = createMappedPolygon(atLine, points, getNewPos)
      polygon.setAttribute('class', 'bw-dt-line')
      polygon.setAttribute('data-dt-line-index', String(index))
      atLine.appendChild(polygon)

      setAnimation({
        element: polygon,
        states: {
          finding: { type: 'opacity', val: '1' },
          normalization: { type: 'opacity', val: '1' },
          readingOrder: { type: 'opacity', val: '1' },
          regulation: { type: 'opacity', val: '0' },
          supplements: { type: 'opacity', val: '0' },
          interventions: { type: 'opacity', val: '0' }
        }
      })
    })
  })
}

function createMappedPolygon (parent, points, getNewPos) {
  const mappedPoints = points.trim().split(/\s+/).map(point => {
    const [x, y] = point.split(',').map(Number)
    const mapped = getNewPos({ x: 0, y: 0 }, { x, y })
    return `${mapped.x},${mapped.y}`
  })
  const polygon = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  polygon.setAttribute('points', mappedPoints.join(' '))
  polygon.setAttribute('stroke-opacity', '1')
  polygon.setAttribute('fill-opacity', '1')
  return polygon
}
