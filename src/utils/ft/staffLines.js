import { computeApproxBBox } from '../svgGeometry.js'

const parseLinePath = (d) => {
  const match = String(d || '').match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
  if (!match) return null

  return {
    start: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
    end: { x: parseFloat(match[3]), y: parseFloat(match[4]) }
  }
}

const parseRotationStyle = (style = '') => {
  const rotateMatch = String(style).match(/rotate\(\s*([\d.-]+)deg\s*\)/)
  const originMatch = String(style).match(/transform-origin:\s*([\d.-]+)px\s+([\d.-]+)px/)

  if (!rotateMatch || !originMatch) return null

  return {
    angle: parseFloat(rotateMatch[1]) || 0,
    origin: {
      x: parseFloat(originMatch[1]) || 0,
      y: parseFloat(originMatch[2]) || 0
    }
  }
}

const applyRotationToPoint = (point, rotation) => {
  if (!rotation || rotation.angle === 0) return point

  const radians = rotation.angle * Math.PI / 180
  const dx = point.x - rotation.origin.x
  const dy = point.y - rotation.origin.y

  return {
    x: rotation.origin.x + (dx * Math.cos(radians)) - (dy * Math.sin(radians)),
    y: rotation.origin.y + (dx * Math.sin(radians)) + (dy * Math.cos(radians))
  }
}

const getClosestRotatedAncestor = (element) => {
  let current = element?.parentNode || null

  while (current && current.nodeType === 1) {
    const style = current.getAttribute?.('style') || ''
    if (style.includes('rotate(')) return current
    current = current.parentNode
  }

  return null
}

const convertStaffLineD = (atD, dtPath, getNewPos) => {
  const atLine = parseLinePath(atD)
  const dtLine = parseLinePath(dtPath?.getAttribute('d'))

  if (!atLine || !dtLine) return atD

  const rotatedAncestor = getClosestRotatedAncestor(dtPath)
  const rotation = parseRotationStyle(rotatedAncestor?.getAttribute?.('style') || '')
  const dtStart = applyRotationToPoint(dtLine.start, rotation)
  const dtEnd = applyRotationToPoint(dtLine.end, rotation)

  const newStart = getNewPos(atLine.start, dtStart)
  const newEnd = getNewPos(atLine.end, dtEnd)

  return `M${newStart.x} ${newStart.y} L${newEnd.x} ${newEnd.y}`
}

const getDtSystemContentXRange = (system) => {
  if (!system) return null

  let min = Infinity
  let max = -Infinity
  const directChildren = Array.from(system.childNodes || []).filter(child => child?.nodeType === 1)

  directChildren.forEach(child => {
    const classes = (child.getAttribute?.('class') || '').split(/\s+/)
    if (classes.includes('rastrum') || classes.includes('bounding-box')) return

    const bbox = computeApproxBBox(child)
    if (!bbox) return

    min = Math.min(min, bbox.x)
    max = Math.max(max, bbox.x + bbox.width)
  })

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { min, max }
}

const trimDtStaffLinePath = (line, minX, maxX) => {
  const parsed = parseLinePath(line?.getAttribute('d'))
  if (!parsed) return

  const originalMinX = Math.min(parsed.start.x, parsed.end.x)
  const originalMaxX = Math.max(parsed.start.x, parsed.end.x)
  const clampedMinX = Math.max(originalMinX, minX)
  const clampedMaxX = Math.min(originalMaxX, maxX)

  if (!Number.isFinite(clampedMinX) || !Number.isFinite(clampedMaxX) || clampedMaxX <= clampedMinX) {
    return
  }

  line.setAttribute('d', `M${clampedMinX} ${parsed.start.y} L${clampedMaxX} ${parsed.end.y}`)
}

export const trimDtStaffLinesToContent = (dtLayer, sideMargin, logger) => {
  const dtSystems = Array.from(dtLayer.querySelectorAll('g.system:not(.bounding-box)'))
  if (dtSystems.length === 0) return

  const rastrumLinesById = new Map()
  Array.from(dtLayer.querySelectorAll('g.rastrum[data-id]')).forEach(rastrum => {
    const rastrumId = rastrum.getAttribute('data-id')
    if (!rastrumId) return

    const lines = Array.from(rastrum.childNodes || []).filter(child => child?.nodeType === 1 && child.localName === 'path')
    rastrumLinesById.set(rastrumId, lines)
  })

  dtSystems.forEach(system => {
    const contentRange = getDtSystemContentXRange(system)
    if (!contentRange) return

    const minX = contentRange.min - sideMargin
    const maxX = contentRange.max + sideMargin
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX <= minX) return

    const nestedLines = Array.from(system.querySelectorAll('.rastrum:not(.bounding-box) > path'))
    if (nestedLines.length > 0) {
      nestedLines.forEach(line => trimDtStaffLinePath(line, minX, maxX))
      return
    }

    const seenRastrumIds = new Set()
    Array.from(system.querySelectorAll('g.staff[data-rastrum]')).forEach(staff => {
      const rastrumRef = (staff.getAttribute('data-rastrum') || '').trim()
      const rastrumId = rastrumRef.split(/\s+/)[0]
      if (!rastrumId || seenRastrumIds.has(rastrumId)) return

      seenRastrumIds.add(rastrumId)
      const lines = rastrumLinesById.get(rastrumId) || []
      lines.forEach(line => trimDtStaffLinePath(line, minX, maxX))
    })
  })

  logger.debug?.('[trimDtStaffLinesToContent] Trimmed DT staff lines to per-system content ranges')
}

const groupFtStaffLinesByBlock = (staffLines) => {
  const byBlock = new Map()

  staffLines.forEach(line => {
    const blockRaw = line.getAttribute('data-bw-block')
    const blockIndex = Number.parseInt(blockRaw, 10)
    if (!Number.isFinite(blockIndex)) return

    if (!byBlock.has(blockIndex)) byBlock.set(blockIndex, [])
    byBlock.get(blockIndex).push(line)
  })

  byBlock.forEach(lines => {
    lines.sort((a, b) => {
      const aIdx = Number.parseInt(a.getAttribute('data-bw-line-index') || '0', 10)
      const bIdx = Number.parseInt(b.getAttribute('data-bw-line-index') || '0', 10)
      return aIdx - bIdx
    })
  })

  return byBlock
}

const groupDtStaffLinesByMatchedBlocks = (dtLayer, matchedBlocks, blockToDtSystemId, logger) => {
  const byBlock = new Map()
  if (!(matchedBlocks instanceof Set) || matchedBlocks.size === 0) return byBlock
  if (!(blockToDtSystemId instanceof Map) || blockToDtSystemId.size === 0) {
    logger.warn('[animateFtStaffLines] Missing strict AT block -> DT system mapping; falling back to DT document order.')
    return byBlock
  }

  const sortedBlocks = Array.from(matchedBlocks).sort((a, b) => a - b)
  const dtSystems = Array.from(dtLayer.querySelectorAll('g.system:not(.bounding-box)'))
  const rastrumLinesById = new Map()
  const dtSystemById = new Map()

  dtSystems.forEach(system => {
    const systemId = system.getAttribute('data-id')
    if (!systemId) return
    dtSystemById.set(systemId, system)
  })

  Array.from(dtLayer.querySelectorAll('g.rastrum[data-id]')).forEach(rastrum => {
    const classes = (rastrum.getAttribute('class') || '').split(/\s+/)
    if (classes.includes('bounding-box')) return

    const rastrumId = rastrum.getAttribute('data-id')
    if (!rastrumId) return

    const lines = Array.from(rastrum.childNodes || []).filter(child => child?.nodeType === 1 && child.localName === 'path')
    rastrumLinesById.set(rastrumId, lines)
  })

  if (dtSystems.length > 0) {
    sortedBlocks.forEach(blockIndex => {
      const systemId = blockToDtSystemId.get(blockIndex)
      const system = systemId ? dtSystemById.get(systemId) : null
      if (!system) {
        logger.warn(`[animateFtStaffLines] Missing DT system '${systemId || 'unknown'}' for AT block ${blockIndex}.`)
        return
      }

      const nestedLines = Array.from(system.querySelectorAll('.rastrum:not(.bounding-box) > path'))
      if (nestedLines.length > 0) {
        byBlock.set(blockIndex, nestedLines)
        return
      }

      const seenRastrumIds = new Set()
      const orderedRastrumIds = []
      Array.from(system.querySelectorAll('g.staff[data-rastrum]')).forEach(staff => {
        const rastrumRef = (staff.getAttribute('data-rastrum') || '').trim()
        const rastrumId = rastrumRef.split(/\s+/)[0]
        if (!rastrumId || seenRastrumIds.has(rastrumId)) return

        seenRastrumIds.add(rastrumId)
        orderedRastrumIds.push(rastrumId)
      })

      const referencedLines = orderedRastrumIds.flatMap(rastrumId => rastrumLinesById.get(rastrumId) || [])
      byBlock.set(blockIndex, referencedLines)
    })

    return byBlock
  }

  const dtLines = Array.from(dtLayer.querySelectorAll('.rastrum:not(.bounding-box) > path'))
  if (sortedBlocks.length === 1) {
    byBlock.set(sortedBlocks[0], dtLines)
  } else if (sortedBlocks.length > 1 && dtLines.length > 0) {
    logger.warn('[animateFtStaffLines] DT has no system groups; cannot distribute DT staff lines across multiple matched blocks reliably.')
  }

  return byBlock
}

const getLineBounds = (lineNodes, transformPoint = point => point) => {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  lineNodes.forEach(line => {
    const segment = parseLinePath(line.getAttribute('d'))
    if (!segment) return

    ;[segment.start, segment.end].map(transformPoint).forEach(point => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    })
  })

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return null

  return { minX, maxX, minY, maxY }
}

const getDtSystemIdByAtSbId = (atMeiDom, dtLayer) => {
  const dtSystemIds = new Set(Array.from(dtLayer.querySelectorAll('g.system[data-id]')).map(system => system.getAttribute('data-id')))
  const mapping = new Map()

  atMeiDom.querySelectorAll('sb[corresp]').forEach(sb => {
    const sbId = sb.getAttribute('xml:id')
    if (!sbId) return

    const dtSystemId = String(sb.getAttribute('corresp'))
      .trim()
      .split(/\s+/)
      .map(token => token.split('#')[1] || '')
      .find(candidate => dtSystemIds.has(candidate))

    if (dtSystemId) mapping.set(sbId, dtSystemId)
  })

  return mapping
}

const getDtSystemStaffLines = (dtSystem, dtLayer) => {
  const nestedLines = Array.from(dtSystem.querySelectorAll('.rastrum:not(.bounding-box) > path'))
  if (nestedLines.length > 0) return nestedLines

  const rastrumById = new Map(
    Array.from(dtLayer.querySelectorAll('g.rastrum[data-id]'))
      .filter(rastrum => !(rastrum.getAttribute('class') || '').split(/\s+/).includes('bounding-box'))
      .map(rastrum => [
        rastrum.getAttribute('data-id'),
        Array.from(rastrum.childNodes || []).filter(child => child?.nodeType === 1 && child.localName === 'path')
      ])
  )
  const seen = new Set()

  return Array.from(dtSystem.querySelectorAll('g.staff[data-rastrum]')).flatMap(staff => {
    const rastrumId = String(staff.getAttribute('data-rastrum')).trim().split(/\s+/)[0]
    if (!rastrumId || seen.has(rastrumId)) return []
    seen.add(rastrumId)
    return rastrumById.get(rastrumId) || []
  })
}

/**
 * Animates each matched Verovio system as a rigid reading-order unit.
 *
 * @param {SVGElement} atLayer - Annotated-transcript SVG layer.
 * @param {SVGElement} dtLayer - Diplomatic-transcript SVG layer.
 * @param {Document} atMeiDom - Annotated transcript MEI DOM.
 * @param {{getNewPos: Function, setAnimation: Function, logger: Object}} tools - Animation utilities.
 * @param {number} readingOrderSystemDistance - Phase-five gap between adjacent systems in SVG units.
 * @returns {void} No return value.
 */
export const animateFtReadingOrderSystems = (atLayer, dtLayer, atMeiDom, { getNewPos, setAnimation, logger }, readingOrderSystemDistance = 0) => {
  const systemBeginById = new Map(
    Array.from(atLayer.querySelectorAll('g.systemBegin[data-system-id]'))
      .map(system => [system.getAttribute('data-system-id'), system])
  )
  const rastrumBySystemId = new Map(
    Array.from(atLayer.querySelectorAll('g.bw-system-rastrum[data-system-id]'))
      .map(rastrum => [rastrum.getAttribute('data-system-id'), rastrum])
  )
  const dtSystemById = new Map(
    Array.from(dtLayer.querySelectorAll('g.system[data-id]'))
      .map(system => [system.getAttribute('data-id'), system])
  )
  const dtSystemIdByAtSbId = getDtSystemIdByAtSbId(atMeiDom, dtLayer)
  let nextLeft = null

  systemBeginById.forEach((systemBegin, atSbId) => {
    const rastrum = rastrumBySystemId.get(atSbId)
    const dtSystem = dtSystemById.get(dtSystemIdByAtSbId.get(atSbId))
    if (!rastrum || !dtSystem) {
      logger.warn(`[animateFtReadingOrderSystems] Missing strict rastrum or DT system for AT sb '${atSbId}'.`)
      return
    }

    const atBounds = getLineBounds(Array.from(rastrum.querySelectorAll('path.rastrum')))
    const dtBounds = getLineBounds(
      getDtSystemStaffLines(dtSystem, dtLayer),
      point => getNewPos({ x: 0, y: 0 }, point)
    )
    if (!atBounds || !dtBounds) {
      logger.warn(`[animateFtReadingOrderSystems] Missing staff-line bounds for AT sb '${atSbId}'.`)
      return
    }

    if (nextLeft === null) nextLeft = atBounds.minX
    const readingOrderOffset = `${Math.round(nextLeft - dtBounds.minX)} ${Math.round(((atBounds.minY + atBounds.maxY) / 2) - ((dtBounds.minY + dtBounds.maxY) / 2))}`
    nextLeft += (dtBounds.maxX - dtBounds.minX) + readingOrderSystemDistance
    const states = {
      digitalFacsimile: { type: 'translate', val: '0 0' },
      writingZone: { type: 'translate', val: '0 0' },
      finding: { type: 'translate', val: '0 0' },
      normalization: { type: 'translate', val: '0 0' },
      readingOrder: { type: 'translate', val: readingOrderOffset },
      regulation: { type: 'translate', val: '0 0' },
      supplements: { type: 'translate', val: '0 0' },
      interventions: { type: 'translate', val: '0 0' }
    }

    setAnimation({ element: systemBegin, states })
    setAnimation({ element: rastrum, states })
  })
}

export const animateFtStaffLines = (atLayer, dtLayer, { getNewPos, setAnimation, logger }, matchedStaffLineContext = null) => {
  const ftStaffLines = Array.from(atLayer.querySelectorAll('path.rastrum'))
  const dtStaffLines = Array.from(dtLayer.querySelectorAll('.rastrum:not(.bounding-box) > path'))

  if (ftStaffLines.length === 0) {
    logger.warn('[animateFtStaffLines] Missing FT staff lines; skipping staff-line animation')
    return
  }

  if (dtStaffLines.length === 0) {
    logger.warn('[animateFtStaffLines] Missing DT staff lines; skipping staff-line animation')
    return
  }

  const matchedBlocks = matchedStaffLineContext?.matchedStaffLineBlocks || null
  const blockToDtSystemId = matchedStaffLineContext?.blockToDtSystemId || null
  const ftByBlock = groupFtStaffLinesByBlock(ftStaffLines)
  const dtByBlock = groupDtStaffLinesByMatchedBlocks(dtLayer, matchedBlocks, blockToDtSystemId, logger)
  const hasStrictBlockMapping = dtByBlock.size > 0 && ftByBlock.size > 0

  if (hasStrictBlockMapping) {
    Array.from(matchedBlocks).sort((a, b) => a - b).forEach(blockIndex => {
      const ftLines = ftByBlock.get(blockIndex) || []
      const dtLinesForBlock = dtByBlock.get(blockIndex) || []

      if (ftLines.length === 0 || dtLinesForBlock.length === 0) {
        logger.warn(`[animateFtStaffLines] Missing FT or DT staff lines for block ${blockIndex}; skipping this block.`)
        return
      }

      const sharedCount = Math.min(ftLines.length, dtLinesForBlock.length)
      for (let index = 0; index < sharedCount; index++) {
        const ftLine = ftLines[index]
        const dtLine = dtLinesForBlock[index]
        const atD = ftLine.getAttribute('d')
        const dtAsAtD = convertStaffLineD(atD, dtLine, getNewPos)

        setAnimation({
          element: ftLine,
          states: {
            digitalFacsimile: { type: 'd', val: dtAsAtD },
            writingZone: { type: 'd', val: dtAsAtD },
            finding: { type: 'd', val: dtAsAtD },
            normalization: { type: 'd', val: dtAsAtD },
            readingOrder: { type: 'd', val: dtAsAtD },
            regulation: { type: 'd', val: atD },
            supplements: { type: 'd', val: atD },
            interventions: { type: 'd', val: atD }
          }
        })
      }
    })

    return
  }

  const targetCount = Math.max(ftStaffLines.length, dtStaffLines.length)
  const expandedFtLines = Array.from({ length: targetCount }).map((_, index) => {
    const baseLine = ftStaffLines[index % ftStaffLines.length]
    if (index < ftStaffLines.length) return baseLine

    const clone = baseLine.cloneNode(true)
    clone.setAttribute('data-bw-staff-clone', String(index))
    baseLine.parentNode.appendChild(clone)
    return clone
  })

  expandedFtLines.forEach((ftLine, index) => {
    const dtLine = dtStaffLines[index % dtStaffLines.length]
    if (!dtLine) return

    const atD = ftLine.getAttribute('d')
    const dtAsAtD = convertStaffLineD(atD, dtLine, getNewPos)

    setAnimation({
      element: ftLine,
      states: {
        digitalFacsimile: { type: 'd', val: dtAsAtD },
        writingZone: { type: 'd', val: dtAsAtD },
        finding: { type: 'd', val: dtAsAtD },
        normalization: { type: 'd', val: dtAsAtD },
        readingOrder: { type: 'd', val: dtAsAtD },
        regulation: { type: 'd', val: atD },
        supplements: { type: 'd', val: atD },
        interventions: { type: 'd', val: atD }
      }
    })
  })
}
