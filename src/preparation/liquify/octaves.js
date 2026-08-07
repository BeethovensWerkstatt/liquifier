const getOctaveAnchor = octave => {
  const use = octave.querySelector('use')
  if (use) {
    const transform = use.getAttribute('transform')
    const transformMatch = transform?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
    if (transformMatch) {
      return { x: Number(transformMatch[1]), y: Number(transformMatch[2]) }
    }

    const x = Number.parseFloat(use.getAttribute('x'))
    const y = Number.parseFloat(use.getAttribute('y'))
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
  }

  const text = octave.querySelector('text')
  if (!text) return null

  const x = Number.parseFloat(text.getAttribute('x'))
  const y = Number.parseFloat(text.getAttribute('y'))
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

const parsePathPoints = path => {
  const match = path?.getAttribute('d')?.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
  if (!match) return null

  return [
    { x: Number(match[1]), y: Number(match[2]) },
    { x: Number(match[3]), y: Number(match[4]) }
  ]
}

const parsePolylinePoints = polyline => {
  const points = polyline?.getAttribute('points')
  if (!points) return null

  const parsed = points.trim().split(/\s+/).map(point => {
    const [x, y] = point.split(',').map(Number)
    return { x, y }
  })
  return parsed.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)) ? parsed : null
}

const formatPath = points => `M${points[0].x} ${points[0].y} L${points[1].x} ${points[1].y}`
const formatPoints = points => points.map(point => `${point.x},${point.y}`).join(' ')

const getLocalDtGeometry = (atPoints, dtPoints, getNewPos, groupOffset) => {
  if (!atPoints || !dtPoints || atPoints.length !== dtPoints.length) return null

  return atPoints.map((atPoint, index) => {
    const target = getNewPos(atPoint, dtPoints[index])
    return { x: target.x - groupOffset.x, y: target.y - groupOffset.y }
  })
}

/**
 * Animate octave markings, including their extenders and ending brackets.
 * Verovio renders the AT glyph with a translated <use>, whereas Thulemeier
 * renders the DT glyph with x/y attributes; translating the parent group keeps
 * each renderer's complete octave geometry together.
 *
 * @param {SVGElement} ftSvg - Fluid transcript SVG.
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG.
 * @param {Document} atMeiDom - Annotated transcript MEI DOM.
 * @param {Object} tools - Shared animation helpers.
 * @returns {void} No return value.
 */
export const liquifyOctaves = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation, applyUnmatchedClass, logger } = tools
  const octaves = ftSvg.querySelectorAll('g.octave:not(.bounding-box)')

  octaves.forEach(octave => {
    const atId = octave.getAttribute('data-id')
    if (!atId) return

    const dtIds = correspMappings.get(atId) || []
    const dtOctave = dtIds
      .map(dtId => dtSvg.querySelector(`g.octave[data-id="${dtId}"]`))
      .find(Boolean)

    if (!dtOctave) {
      applyUnmatchedClass?.(octave)
      setAnimation({
        element: octave,
        states: {
          finding: null,
          normalization: null,
          regulation: { type: 'translate', val: '0 0' },
          supplements: { type: 'translate', val: '0 0' },
          interventions: { type: 'translate', val: '0 0' }
        }
      })
      return
    }

    const atAnchor = getOctaveAnchor(octave)
    const dtAnchor = getOctaveAnchor(dtOctave)
    if (!atAnchor || !dtAnchor) {
      logger.warn(`[Octaves] Could not determine anchors for AT ${atId}`)
      return
    }

    const normalizedAnchor = getNewPos(atAnchor, dtAnchor)
    const groupOffset = { x: normalizedAnchor.x - atAnchor.x, y: normalizedAnchor.y - atAnchor.y }
    const findingOffset = `${groupOffset.x} ${groupOffset.y}`
    setAnimation({
      element: octave,
      referenceId: dtOctave.getAttribute('data-id'),
      states: {
        finding: { type: 'translate', val: findingOffset },
        normalization: { type: 'translate', val: findingOffset },
        regulation: { type: 'translate', val: '0 0' },
        supplements: { type: 'translate', val: '0 0' },
        interventions: { type: 'translate', val: '0 0' }
      }
    })

    animateExtenderGeometry(octave, dtOctave, getNewPos, groupOffset, setAnimation)
  })
}

const animateExtenderGeometry = (atOctave, dtOctave, getNewPos, groupOffset, setAnimation) => {
  const atPath = atOctave.querySelector('path')
  const dtPath = dtOctave.querySelector('path')
  const atPathPoints = parsePathPoints(atPath)
  const dtPathPoints = parsePathPoints(dtPath)
  const normalizedPathPoints = getLocalDtGeometry(atPathPoints, dtPathPoints, getNewPos, groupOffset)

  if (atPathPoints && normalizedPathPoints) {
    const atPathValue = formatPath(atPathPoints)
    const normalizedPathValue = formatPath(normalizedPathPoints)
    setAnimation({
      element: atPath,
      states: {
        finding: { type: 'd', val: normalizedPathValue },
        normalization: { type: 'd', val: normalizedPathValue },
        regulation: { type: 'd', val: atPathValue },
        supplements: { type: 'd', val: atPathValue },
        interventions: { type: 'd', val: atPathValue }
      }
    })
  }

  const atPolyline = atOctave.querySelector('polyline')
  const dtPolyline = dtOctave.querySelector('polyline')
  const atPolylinePoints = parsePolylinePoints(atPolyline)
  const dtPolylinePoints = parsePolylinePoints(dtPolyline)
  const normalizedPolylinePoints = getLocalDtGeometry(atPolylinePoints, dtPolylinePoints, getNewPos, groupOffset)

  if (atPolylinePoints && normalizedPolylinePoints) {
    const atPolylineValue = formatPoints(atPolylinePoints)
    const normalizedPolylineValue = formatPoints(normalizedPolylinePoints)
    setAnimation({
      element: atPolyline,
      states: {
        finding: { type: 'points', val: normalizedPolylineValue },
        normalization: { type: 'points', val: normalizedPolylineValue },
        regulation: { type: 'points', val: atPolylineValue },
        supplements: { type: 'points', val: atPolylineValue },
        interventions: { type: 'points', val: atPolylineValue }
      }
    })
  }
}
