/**
 * Prepare AT beam elements for animation
 * Beams consist of polygon elements representing beam lines. Typically there is:
 * - One main beam spanning the full length
 * - Additional segmented beams (e.g., for 16th notes, 32nd notes)
 * This function merges connected segments into continuous polygons by detecting
 * segments that share endpoints (indicating they connect). Only segments that
 * attach to each other are combined.
 * Also handles beamSpan elements which have the same structure as beam elements.
 *
 * @param {SVGElement} svg - AT SVG DOM containing beam elements
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance
 * @returns {Object} Resulting object.
 */
const adjustAtBeams = (svg, logger) => {
  const beams = svg.querySelectorAll('g.beam:not(.bounding-box), g.beamSpan:not(.bounding-box)')

  beams.forEach(beamG => {
    const polygons = beamG.querySelectorAll('polygon')
    if (polygons.length === 0) return // Nothing to merge if no polygons
    if (polygons.length === 1) { // Nothing to merge if only one polygon, but still need to adjust winding order
      const pointsStr = polygons[0].getAttribute('points')
      const points = pointsStr.trim().split(/\s+/).map(point => {
        const [x, y] = point.split(',').map(Number)
        return { x, y }
      })

      if (points.length === 4) {
        // Reorder from Verovio format to Thulemeier format: [3, 2, 1, 0]
        const reordered = [points[3], points[2], points[1], points[0]]
        const newPointsStr = reordered.map(p => `${p.x},${p.y}`).join(' ')
        polygons[0].setAttribute('points', newPointsStr)
      }
      return
    }

    // Parse polygon points into structured data
    const polygonData = Array.from(polygons).map((polygon, index) => {
      const pointsStr = polygon.getAttribute('points')
      const points = pointsStr.trim().split(/\s+/).map(point => {
        const [x, y] = point.split(',').map(Number)
        return { x, y }
      })
      return {
        element: polygon,
        points,
        index,
        merged: false
      }
    })

    // Group polygons that connect to each other
    const groups = []

    polygonData.forEach(poly => {
      if (poly.merged) return

      // Start a new group with this polygon
      const group = [poly]
      poly.merged = true

      // Find all polygons that connect to any polygon in this group
      let foundConnection = true
      while (foundConnection) {
        foundConnection = false

        for (const unmerged of polygonData.filter(p => !p.merged)) {
          // Check if unmerged connects to any polygon in the current group
          for (const groupPoly of group) {
            if (polygonsConnect(groupPoly.points, unmerged.points)) {
              group.push(unmerged)
              unmerged.merged = true
              foundConnection = true
              break
            }
          }
          if (foundConnection) break
        }
      }

      groups.push(group)
    })

    // Merge each group into a single polygon
    groups.forEach(group => {
      if (group.length === 1) return // No merging needed

      // Sort polygons in the group by their leftmost x coordinate
      group.sort((a, b) => {
        const minXA = Math.min(...a.points.map(p => p.x))
        const minXB = Math.min(...b.points.map(p => p.x))
        return minXA - minXB
      })

      // Build the merged polygon by connecting segments
      // Beam polygons are trapezoids with 4 points: top-left, top-right, bottom-right, bottom-left (clockwise)

      // The first polygon's top-left and bottom-left points
      const startTopLeft = group[0].points[0]
      const startBottomLeft = group[0].points[3]

      // The last polygon's top-right and bottom-right points
      const endTopRight = group[group.length - 1].points[1]
      const endBottomRight = group[group.length - 1].points[2]

      // Construct merged polygon with 4 points (trapezoid): top-left, top-right, bottom-right, bottom-left
      const mergedPoints = [
        startTopLeft,
        endTopRight,
        endBottomRight,
        startBottomLeft
      ]

      // Create new merged polygon
      const doc = beamG.ownerDocument || beamG
      const mergedPolygon = doc.createElementNS('http://www.w3.org/2000/svg', 'polygon')
      const pointsStr = mergedPoints.map(p => `${p.x},${p.y}`).join(' ')
      mergedPolygon.setAttribute('points', pointsStr)
      mergedPolygon.setAttribute('stroke-opacity', '1')
      mergedPolygon.setAttribute('fill-opacity', '1')

      // Insert merged polygon before the first polygon in the group
      beamG.insertBefore(mergedPolygon, group[0].element)

      // Remove original segment polygons
      group.forEach(poly => poly.element.remove())

      logger.debug(`[Adjust AT Beams] Merged ${group.length} segments into one polygon`)
    })

    // After merging, reorder all remaining polygons from AT (Verovio) format to DT (Thulemeier) format
    // AT format: [lower left, lower right, upper right, upper left]
    // DT format: [upper left, upper right, lower right, lower left]
    const allPolygons = beamG.querySelectorAll('polygon')
    allPolygons.forEach(polygon => {
      const pointsStr = polygon.getAttribute('points')
      const points = pointsStr.trim().split(/\s+/).map(point => {
        const [x, y] = point.split(',').map(Number)
        return { x, y }
      })

      if (points.length !== 4) {
        logger.warn(`[Adjust AT Beams] Expected 4 points, got ${points.length}`)
        return
      }

      // AT order: [0]=lower left, [1]=lower right, [2]=upper right, [3]=upper left
      // DT order: [0]=upper left, [1]=upper right, [2]=lower right, [3]=lower left
      // Reorder: [3, 2, 1, 0] -> [upper left, upper right, lower right, lower left]
      const reordered = [points[3], points[2], points[1], points[0]]
      const newPointsStr = reordered.map(p => `${p.x},${p.y}`).join(' ')
      polygon.setAttribute('points', newPointsStr)
    })
  })
}

/**
 * Check if two polygons connect (share an edge)
 * Two beam segments connect if they share two points (an edge).
 * For example: segment1 ends with points [x1,y1] [x2,y2] and segment2 starts with [x1,y1] [x2,y2]
 *
 * @param {Array} points1 - Array of {x, y} points for first polygon
 * @param {Array} points2 - Array of {x, y} points for second polygon
 * @returns {boolean} True if polygons share an edge
 */
const polygonsConnect = (points1, points2) => {
  const tolerance = 0.1 // Allow small floating point differences

  // Check if any two points from polygon1 match any two points from polygon2
  for (let i = 0; i < points1.length; i++) {
    for (let j = i + 1; j < points1.length; j++) {
      const p1a = points1[i]
      const p1b = points1[j]

      for (let k = 0; k < points2.length; k++) {
        for (let l = k + 1; l < points2.length; l++) {
          const p2a = points2[k]
          const p2b = points2[l]

          // Check if these two pairs match (in either order)
          const match1 = pointsEqual(p1a, p2a, tolerance) && pointsEqual(p1b, p2b, tolerance)
          const match2 = pointsEqual(p1a, p2b, tolerance) && pointsEqual(p1b, p2a, tolerance)

          if (match1 || match2) return true
        }
      }
    }
  }

  return false
}

/**
 * Check if two points are equal within a tolerance
 *
 * @param {{x: number, y: number}} p1 - Input object used by this function.
 * @param {{x: number, y: number}} p2 - Input object used by this function.
 * @param {number} tolerance - Numeric input used by this function.
 * @returns {Array<*>} Resulting list.
 */
const pointsEqual = (p1, p2, tolerance = 0.1) => {
  return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance
}

/**
 * Calculate normalized beam polygons for the diplomatic state
 * The normalization state normalizes beams by:
 * 1. Finding which notes' stems attach to the beam (from MEI)
 * 2. Calculating beam endpoints from first and last note stem endpoints
 * 3. Positioning shorter beam lines to attach to the correct notes
 * 4. Ensuring all lines are parallel with AT spacing
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG
 * @param {Document} atMeiDom - AT MEI DOM for beam-note relationships
 * @param {string} beamId - The beam's AT ID
 * @param {Array<SVGPolygonElement>} atPolygons - AT beam polygons (sorted top to bottom)
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance
 * @returns {Array<string>} Array of diplomatic polygon points strings
 */
const calculateDiplomaticBeams = (ftSvg, atMeiDom, beamId, atPolygons, logger) => {
  // Find the beam element in MEI to get note relationships
  const meiBeam = atMeiDom.querySelector(`beam[xml\\:id="${beamId}"]`)
  if (!meiBeam) {
    logger.debug(`[Beam Normalization] Could not find MEI beam ${beamId}`)
    return null
  }

  // Get all notes/chords in this beam
  const beamNotes = Array.from(meiBeam.querySelectorAll('note, chord'))
  if (beamNotes.length < 2) {
    logger.debug(`[Beam Normalization] Beam ${beamId} has fewer than 2 notes`)
    return null
  }

  // Get the SVG elements for first and last notes to find stem endpoints
  const firstNoteId = beamNotes[0].getAttribute('xml:id')
  const lastNoteId = beamNotes[beamNotes.length - 1].getAttribute('xml:id')

  const firstNoteGroup = ftSvg.querySelector(`g[data-id="${firstNoteId}"]`)
  const lastNoteGroup = ftSvg.querySelector(`g[data-id="${lastNoteId}"]`)

  if (!firstNoteGroup || !lastNoteGroup) {
    logger.debug(`[Beam Normalization] Could not find note groups for beam ${beamId}`)
    return null
  }

  // Get stem paths - need to look at the animated path's values attribute
  const firstStem = firstNoteGroup.querySelector('.stem > path')
  const lastStem = lastNoteGroup.querySelector('.stem > path')

  if (!firstStem || !lastStem) {
    logger.debug(`[Beam Normalization] Could not find stems for beam ${beamId}`)
    return null
  }

  // Get stem direction from MEI
  const firstNoteStemDir = beamNotes[0].getAttribute('stem.dir')
  const lastNoteStemDir = beamNotes[beamNotes.length - 1].getAttribute('stem.dir')

  // Parse stem path to get endpoint for a specific state
  // Frame indices: 0=finding, 1=normalization, 2=readingOrder, 3=regulation, 4=supplements, 5=interventions
  /**
   * Returns stem endpoint from the current data context.
   *
   * @param {string} stemPath - File or resource path.
   * @param {string} stemDir - String input used by this function.
   * @param {number} frameIndex - Zero-based phase index.
   * @returns {Object} Resulting object.
   */
  const getStemEndpoint = (stemPath, stemDir, frameIndex) => {
    const animates = stemPath.querySelectorAll('animate[attributeName="d"]')

    if (animates.length === 0) {
      // No animation, use current d attribute
      const d = stemPath.getAttribute('d')
      return parseStemPath(d, stemDir)
    }

    // Get the state from values
    const animate = animates[0]
    const values = animate.getAttribute('values')
    if (!values) return null

    const frames = values.split(';')
    if (frames.length <= frameIndex) return null

    const pathD = frames[frameIndex]
    return parseStemPath(pathD, stemDir)
  }

  // Also need to get the note/chord group position for X coordinate
  /**
   * Returns note position from the current data context.
   *
   * @param {Element} noteGroup - Element processed by this function.
   * @param {number} frameIndex - Zero-based phase index.
   * @returns {Object} Resulting object.
   */
  const getNotePosition = (noteGroup, frameIndex) => {
    // The animate element should have been set by liquifyNotes/liquifyChords
    // It's an animateTransform element that is a DIRECT child of the note group (not nested in accidentals etc)
    const animateElement = noteGroup.querySelector(':scope > animateTransform[attributeName="transform"]')

    if (!animateElement) {
      // No animation found
      const transform = noteGroup.getAttribute('transform')
      return parseTransform(transform)
    }

    // Get the state from values
    const values = animateElement.getAttribute('values')
    if (!values) return null

    const frames = values.split(';')
    if (frames.length <= frameIndex) return null

    const transform = frames[frameIndex]
    return parseTransform(transform)
  }

  /**
   * Parses transform from serialized input values.
   *
   * @param {Function} transform - Callback invoked by this function.
   * @returns {Object} Resulting object.
   */
  const parseTransform = (transform) => {
    if (!transform) return { x: 0, y: 0 }

    // Check for translate(x, y) format
    const translateMatch = transform.match(/translate\(([\d.-]+)[,\s]+([\d.-]+)\)/)
    if (translateMatch) {
      return {
        x: parseFloat(translateMatch[1]),
        y: parseFloat(translateMatch[2])
      }
    }

    // Check for space-separated numbers format (from animateTransform values)
    const spaceMatch = transform.trim().match(/^([\d.-]+)\s+([\d.-]+)$/)
    if (spaceMatch) {
      return {
        x: parseFloat(spaceMatch[1]),
        y: parseFloat(spaceMatch[2])
      }
    }

    return { x: 0, y: 0 }
  }

  /**
   * Parses stem path from serialized input values.
   *
   * @param {Object} d - Input object used by this function.
   * @param {string} stemDir - String input used by this function.
   * @returns {Object} Resulting object.
   */
  const parseStemPath = (d, stemDir) => {
    const match = d.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
    if (!match) return null

    const x2 = parseFloat(match[3])
    const y2 = parseFloat(match[4])

    // The stem coordinates are in the note's local coordinate system
    // M point is the notehead, L point is the stem endpoint
    // For down stems, the beam connects at the L point (stem endpoint away from notehead)
    // For up stems, the beam connects at the L point (stem endpoint away from notehead)
    // Both use the L point - it's always the far end of the stem
    return { x: x2, y: y2 }
  }

  // Get stem endpoints for normalization state (frame 1) only
  const firstStemEndDiplomatic = getStemEndpoint(firstStem, firstNoteStemDir, 1)
  const lastStemEndDiplomatic = getStemEndpoint(lastStem, lastNoteStemDir, 1)

  // Get note positions for normalization state (frame 1) only
  // Note: We only need the X offset from the transform animation
  const firstNotePosDiplomatic = getNotePosition(firstNoteGroup, 1)
  const lastNotePosDiplomatic = getNotePosition(lastNoteGroup, 1)

  if (!firstStemEndDiplomatic || !lastStemEndDiplomatic) {
    logger.debug(`[Beam Normalization] Could not parse stem endpoints for beam ${beamId}`)
    return null
  }

  if (!firstNotePosDiplomatic || !lastNotePosDiplomatic) {
    logger.debug(`[Beam Normalization] Could not parse note positions for beam ${beamId}`)
    return null
  }

  // Get AT beam spacing (distance between consecutive polygons)
  let beamSpacing = 50 // Default fallback
  if (atPolygons.length >= 2) {
    const polygon1Points = parsePolygonPoints(atPolygons[0].getAttribute('points'))
    const polygon2Points = parsePolygonPoints(atPolygons[1].getAttribute('points'))

    // Calculate vertical distance between polygons (using left edge midpoints)
    const y1 = (polygon1Points[0].y + polygon1Points[3].y) / 2
    const y2 = (polygon2Points[0].y + polygon2Points[3].y) / 2
    beamSpacing = Math.abs(y2 - y1)
  }

  // Get beam thickness from AT polygon
  const firstPolygonPoints = parsePolygonPoints(atPolygons[0].getAttribute('points'))
  const beamThickness = Math.abs(firstPolygonPoints[0].y - firstPolygonPoints[3].y)

  // Determine beam direction (down stems = beams above notes, up stems = beams below)
  const beamDirection = firstNoteStemDir === 'down' ? 1 : -1

  // Generate polygons for normalization state only (finding uses original DT-transformed position)
  const diplomaticPolygons = []

  atPolygons.forEach((polygon, index) => {
    // Calculate Y offset for this beam line (index * spacing * direction)
    const yOffset = index * beamSpacing * beamDirection

    // TODO: Determine which notes this specific beam line spans
    // For now, assume primary beam spans all notes, secondary beams need more logic

    // DIPLOMATIC state: Add the X offset from the transform animation to the stem X coordinates
    // The stem X coordinate is already in the note's local space,
    // so we need to add the note's transform X offset
    const diplomaticLeftX = firstStemEndDiplomatic.x + firstNotePosDiplomatic.x
    const diplomaticLeftY = firstNotePosDiplomatic.y + firstStemEndDiplomatic.y + yOffset
    const diplomaticRightX = lastStemEndDiplomatic.x + lastNotePosDiplomatic.x
    const diplomaticRightY = lastNotePosDiplomatic.y + lastStemEndDiplomatic.y + yOffset

    const diplomaticPoints = [
      { x: diplomaticLeftX, y: diplomaticLeftY },
      { x: diplomaticRightX, y: diplomaticRightY },
      { x: diplomaticRightX, y: diplomaticRightY + beamThickness * beamDirection },
      { x: diplomaticLeftX, y: diplomaticLeftY + beamThickness * beamDirection }
    ]

    const pointsStr = diplomaticPoints.map(p => `${p.x},${p.y}`).join(' ')
    diplomaticPolygons.push(pointsStr)
  })

  logger.debug(`[Beam Normalization] Beam ${beamId}: ${beamNotes.length} notes, ${atPolygons.length} lines, stem.dir=${firstNoteStemDir}`)

  return { diplomaticPolygons }
}

/**
 * Parse polygon points string into array of {x, y} objects
 *
 * @param {Array<*>} pointsStr - Collection of values used by this function.
 * @returns {Object} Resulting object.
 */
const parsePolygonPoints = (pointsStr) => {
  return pointsStr.trim().split(/\s+/).map(point => {
    const [x, y] = point.split(',').map(Number)
    return { x, y }
  })
}

/**
 * Animate beam elements between AT and DT transcriptions
 * First prepares beam paths in the AT, then animates each beam path based on
 * corresponding DT beam position. Handles beams without DT correspondence by
 * fading them out.
 * - getNewPos: Function to calculate new position
 * - convertD: Function to convert path d attribute
 * - scaleFactor: Scale factor between DT and AT
 * - correspMappings: Map of AT to DT element IDs
 * - setAnimation: Function to create 5-state animations from descriptors
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data:
 * @returns {Object} Resulting object.
 */
export const liquifyBeams = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  // First, prepare/adjust beam paths in the AT
  adjustAtBeams(ftSvg, logger)

  const beams = ftSvg.querySelectorAll('g.beam:not(.bounding-box), g.beamSpan:not(.bounding-box)')
  beams.forEach(beam => {
    const atId = beam.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      // Fade out beams without DT correspondence
      const polygons = beam.querySelectorAll('polygon')
      polygons.forEach(polygon => setAnimation({
        element: polygon,
        id: `${atId}-polygon`,
        localName: 'beam-polygon',
        states: {
          finding: null,
          normalization: null,
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'points', val: polygon.getAttribute('points') },
          supplements: { type: 'points', val: polygon.getAttribute('points') },
          interventions: { type: 'points', val: polygon.getAttribute('points') }
        }
      }))
      return
    }

    // Get the beam polygons (now merged)
    const atPolygons = beam.querySelectorAll('polygon')
    if (atPolygons.length === 0) return

    // Calculate normalized beams for finding and normalization states
    const atSorted = sortPolygonsByPosition(Array.from(atPolygons))
    const normalizedBeams = calculateDiplomaticBeams(ftSvg, atMeiDom, atId, atSorted.map(p => p.element), logger)

    // Collect all DT polygons from all corresponding DT beams
    const allDtPolygons = []
    dtIds.forEach(dtId => {
      const dtBeam = dtSvg.querySelector(`g.beam[data-id="${dtId}"]`)
      if (dtBeam) {
        const dtPolygons = dtBeam.querySelectorAll('polygon')
        dtPolygons.forEach(polygon => {
          allDtPolygons.push({ element: polygon, dtId })
        })
      }
    })

    if (allDtPolygons.length === 0) {
      // Only fade out if there are truly no DT matches
      atPolygons.forEach((polygon, index) => {
        setAnimation({
          element: polygon,
          id: `${atId}-polygon`,
          localName: 'beam-polygon',
          states: {
            finding: null,
            normalization: null,
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'points', val: polygon.getAttribute('points') },
            supplements: { type: 'points', val: polygon.getAttribute('points') },
            interventions: { type: 'points', val: polygon.getAttribute('points') }
          }
        })
      })
      return
    }

    // Sort DT polygons and keep track of their source beam ID
    const dtSorted = allDtPolygons.map(item => {
      const pointsStr = item.element.getAttribute('points')
      const points = parsePolygonPoints(pointsStr)
      const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length
      return { element: item.element, dtId: item.dtId, avgY, points }
    }).sort((a, b) => a.avgY - b.avgY)

    // Match polygons from top to bottom
    const minCount = Math.min(atSorted.length, dtSorted.length)

    if (atSorted.length !== dtSorted.length) {
      logger.warn(`[Beam Animation] Mismatched polygon counts - AT: ${atSorted.length}, DT: ${dtSorted.length} (from ${dtIds.length} DT beams)`)
    }

    // Animate each matched pair
    for (let i = 0; i < minCount; i++) {
      const atPolygon = atSorted[i].element
      const dtPolygon = dtSorted[i].element

      const atPoints = atPolygon.getAttribute('points')
      const dtPoints = dtPolygon.getAttribute('points')

      // Convert polygon points using getNewPos for finding state (original DT-transformed position)
      const findingsPoints = convertPolygonPoints(atPoints, dtPoints, getNewPos)

      // Use normalized beam points for normalization state (aligned with normalized stems)
      const diplomaticPoints = normalizedBeams?.diplomaticPolygons?.[i] || findingsPoints

      logger.debug(`[Beam Animation] AT ID: ${atId}, DT ID: ${dtSorted[i].dtId}, line ${i} (AT y~${Math.round(atSorted[i].avgY)}, DT y~${Math.round(dtSorted[i].avgY)})`)

      setAnimation({
        element: atPolygon,
        id: `${atId}-polygon-${i}`,
        localName: 'beam-polygon',
        states: {
          finding: { type: 'points', val: findingsPoints },
          normalization: { type: 'points', val: diplomaticPoints },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'points', val: atPoints },
          supplements: { type: 'points', val: atPoints },
          interventions: { type: 'points', val: atPoints }
        }
      })
    }

    // Fade out any extra AT polygons that don't have DT matches
    for (let i = minCount; i < atSorted.length; i++) {
      setAnimation({
        element: atSorted[i].element,
        id: `${atId}-polygon-${i}`,
        localName: 'beam-polygon',
        states: {
          finding: null,
          normalization: null,
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'points', val: atSorted[i].element.getAttribute('points') },
          supplements: { type: 'points', val: atSorted[i].element.getAttribute('points') },
          interventions: { type: 'points', val: atSorted[i].element.getAttribute('points') }
        }
      })
    }
  })
}

/**
 * Sort polygons by their vertical position (top to bottom)
 * Calculates the average Y coordinate of each polygon's points and sorts
 * from smallest (top) to largest (bottom).
 *
 * @param {Array<SVGPolygonElement>} polygons - Array of polygon elements
 * @returns {Array<Object>} Sorted array of {element, avgY} objects
 */
const sortPolygonsByPosition = (polygons) => {
  return polygons.map(polygon => {
    const pointsStr = polygon.getAttribute('points')
    const points = pointsStr.trim().split(/\s+/).map(point => {
      const [x, y] = point.split(',').map(Number)
      return { x, y }
    })

    // Calculate average Y position
    const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length

    return { element: polygon, avgY, points }
  }).sort((a, b) => a.avgY - b.avgY)
}

/**
 * Convert polygon points from AT to DT coordinate system
 * Takes the points attribute string, parses each coordinate pair, transforms
 * them using getNewPos, and reconstructs the points string.
 * Assumes both AT and DT polygons already have the same winding order
 * (handled in adjustAtBeams preparation phase).
 *
 * @param {string} atPoints - AT polygon points attribute (already normalized)
 * @param {string} dtPoints - DT polygon points attribute
 * @param {Function} getNewPos - Function to transform coordinates
 * @returns {string} New points attribute with transformed coordinates
 */
const convertPolygonPoints = (atPoints, dtPoints, getNewPos) => {
  const atCoords = atPoints.trim().split(/\s+/).map(point => {
    const [x, y] = point.split(',').map(Number)
    return { x, y }
  })

  const dtCoords = dtPoints.trim().split(/\s+/).map(point => {
    const [x, y] = point.split(',').map(Number)
    return { x, y }
  })

  // Ensure both polygons are 4-point trapezoids
  if (atCoords.length !== 4 || dtCoords.length !== 4) {
    // Continue with best-effort point mapping even if input polygons are unexpected.
  }

  // Transform each coordinate pair (both now have same winding order from prep phase)
  const newCoords = atCoords.map((atPos, i) => {
    const dtPos = dtCoords[i] || atPos // fallback if counts don't match
    return getNewPos(atPos, dtPos)
  })

  // Reconstruct points string
  return newCoords.map(p => `${p.x},${p.y}`).join(' ')
}
