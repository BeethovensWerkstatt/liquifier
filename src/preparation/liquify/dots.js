import { hasClass, queryDirectChildren } from '../../utils/dom.js'

/**
 * Animate repeat dots between AT and DT transcriptions.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG.
 * @param {Document} atMeiDom - Annotated transcript MEI DOM.
 * @param {Object} tools - Animation helper bundle.
 * @param {Function} tools.getNewPos - Converts DT coordinates into FT coordinate space.
 * @param {Map<string, string[]>} tools.correspMappings - AT measure id to DT ids mapping.
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer.
 * @returns {void} No return value.
 */
export const liquifyDots = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation } = tools

  ftSvg.querySelectorAll('g.measure:not(.bounding-box)').forEach(measure => {
    const atDots = getAtRepeatDots(measure)
    if (atDots.length === 0) return

    const dtIds = correspMappings.get(measure.getAttribute('data-id')) || []
    const dtDots = getDtRepeatDots(dtSvg, dtIds, getNewPos)
    const dotElements = atDots.map(dot => ({ ...dot, element: wrapDot(dot.element) }))
    const matchedDots = new Map()

    dtDots.forEach(dtDot => {
      const atDot = findMatchingAtDot(dotElements, dtDot, matchedDots)
      if (atDot) matchedDots.set(atDot, dtDot)
    })

    dotElements.forEach(atDot => {
      const dtDot = matchedDots.get(atDot)
      if (!dtDot) {
        setAnimation({
          element: atDot.element,
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

      const dtVal = `${dtDot.x - atDot.x} ${dtDot.y - atDot.y}`
      setAnimation({
        element: atDot.element,
        referenceId: dtDot.id,
        states: {
          finding: { type: 'translate', val: dtVal },
          normalization: { type: 'translate', val: dtVal },
          regulation: { type: 'translate', val: '0 0' },
          supplements: { type: 'translate', val: '0 0' },
          interventions: { type: 'translate', val: '0 0' }
        }
      })
    })
  })
}

const getAtRepeatDots = (measure) => {
  const staffRanges = getAtStaffRanges(measure)
  const dots = []

  measure.querySelectorAll('g.barLine:not(.bounding-box)').forEach(barLine => {
    queryDirectChildren(barLine, 'use').forEach(element => {
      const position = getUsePosition(element)
      if (!position) return

      dots.push({
        element,
        ...position,
        staff: getStaffAtY(staffRanges, position.y),
        side: getBarlineX(barLine)
      })
    })
  })

  return dots
}

const getDtRepeatDots = (dtSvg, dtIds, getNewPos) => {
  return dtIds.flatMap(dtId => {
    const dot = dtSvg.querySelector(`g.dot.repeat[data-id="${dtId}"]`)
    const ellipse = dot?.querySelector('ellipse')
    const cx = parseFloat(ellipse?.getAttribute('cx'))
    const cy = parseFloat(ellipse?.getAttribute('cy'))
    const staff = getParentStaff(dot)?.getAttribute('data-n')
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !staff) return []

    const position = getNewPos({ x: 0, y: 0 }, { x: cx, y: cy })
    return [{ id: dtId, x: position.x, y: position.y, staff }]
  })
}

const getAtStaffRanges = (measure) => {
  return queryDirectChildren(measure, 'g.staff').filter(staff => !hasClass(staff, 'bounding-box')).flatMap((staff, index) => {
    const boundingBox = queryDirectChildren(staff, 'g.staff.bounding-box')[0]?.querySelector('rect')
    const minY = parseFloat(boundingBox?.getAttribute('y'))
    const height = parseFloat(boundingBox?.getAttribute('height'))
    if (Number.isFinite(minY) && Number.isFinite(height)) {
      return [{
        staff: staff.getAttribute('data-n') || String(index + 1),
        minY,
        maxY: minY + height
      }]
    }

    const ys = Array.from(staff.querySelectorAll('path'))
      .flatMap(path => getPathYCoordinates(path.getAttribute('d')))
    if (ys.length === 0) return []

    return [{
      staff: staff.getAttribute('data-n') || String(index + 1),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    }]
  })
}

const getParentStaff = (element) => {
  let current = element?.parentNode

  while (current?.nodeType === 1) {
    if (current.localName === 'g' && hasClass(current, 'staff')) return current
    current = current.parentNode
  }

  return null
}

const getPathYCoordinates = (d) => {
  const match = String(d || '').match(/M\s*[\d.-]+\s+([\d.-]+)\s+L\s*[\d.-]+\s+([\d.-]+)/)
  return match ? [parseFloat(match[1]), parseFloat(match[2])] : []
}

const getStaffAtY = (staffRanges, y) => {
  if (staffRanges.length === 0) return null

  return staffRanges.reduce((closest, staff) => {
    const distance = y < staff.minY ? staff.minY - y : Math.max(0, y - staff.maxY)
    return distance < closest.distance ? { staff: staff.staff, distance } : closest
  }, { staff: null, distance: Infinity }).staff
}

const getUsePosition = (use) => {
  const match = use.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
  if (!match) return null

  return { x: parseFloat(match[1]), y: parseFloat(match[2]) }
}

const getBarlineX = (barLine) => {
  const positions = queryDirectChildren(barLine, 'path')
    .map(path => path.getAttribute('d')?.match(/M\s*([\d.-]+)/))
    .filter(Boolean)
    .map(match => parseFloat(match[1]))
  return positions.length > 0 ? positions.reduce((total, x) => total + x, 0) / positions.length : 0
}

const findMatchingAtDot = (atDots, dtDot, matchedDots) => {
  const candidates = atDots.filter(atDot => atDot.staff === dtDot.staff && !matchedDots.has(atDot))
  if (candidates.length === 0) return null

  return candidates.reduce((closest, atDot) => {
    const currentDistance = Math.abs(atDot.side - dtDot.x) + Math.abs(atDot.y - dtDot.y)
    const closestDistance = Math.abs(closest.side - dtDot.x) + Math.abs(closest.y - dtDot.y)
    return currentDistance < closestDistance ? atDot : closest
  })
}

const wrapDot = (use) => {
  const doc = use.ownerDocument
  const wrapper = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
  wrapper.setAttribute('class', 'repeatDot')
  use.parentNode.insertBefore(wrapper, use)
  wrapper.appendChild(use)
  return wrapper
}
