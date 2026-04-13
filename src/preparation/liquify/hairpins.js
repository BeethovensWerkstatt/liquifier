/**
 * Prepares animations for <hairpin> elements (crescendo/diminuendo wedges)
 * between DT (diplomatic transcript) and AT (annotated transcript).
 *
 * HAIRPIN ELEMENT COMPLEXITY:
 * - Visual wedge elements with form attribute: "cres" (crescendo) or "dim" (diminuendo)
 * - Multiple DT correspondence: one AT hairpin can map to multiple DT hairpins (space-separated corresp attribute)
 * - Different SVG rendering patterns:
 *   DT (Thulemeier):
 *     - Single 3-point polyline forming wedge (e.g., "27369,945 23976,1422 27369,2115")
 *     - Two separate 2-point polylines for top/bottom lines
 *   AT (Verovio):
 *     - Polyline representation (various point counts)
 *
 * ANIMATION STRATEGY:
 * Hairpins consist of two legs (upper and lower). To create smooth morphing animation:
 * 1. Find AT hairpin in FT SVG (cloned from AT SVG rendered by Verovio)
 * 2. Find corresponding DT hairpin(s) in DT SVG (rendered by Thulemeier)
 * 3. Split AT hairpin polyline into two separate line elements (upper and lower legs)
 * 4. Split DT hairpin into two legs:
 *    - If 3-point wedge: upper edge (points 0→1) and lower edge (points 2→1)
 *    - If two 2-point polylines: use top and bottom as-is
 * 5. Create independent animations for each leg from AT position to DT position
 *
 * This allows both legs to morph independently, creating a smooth transition between
 * the AT and DT hairpin shapes (e.g., from AT center line to DT wedge).
 *
 * @param {SVGSVGElement} ftSvg - The fluid transcript SVG (output, will be modified)
 * @param {SVGSVGElement} dtSvg - The diplomatic transcript SVG (reference, read-only)
 * @param {Document} atMeiDom - The annotated transcript MEI DOM (source of hairpin elements)
 * @param {object} tools - Object containing:
 *   - getNewPos(atPos, dtPos): Calculate transformed position between systems
 *   - setAnimation(options): Apply animation states to SVG elements
 *   - logger: Debug logging utility
 */
export function liquifyHairpins (ftSvg, dtSvg, atMeiDom, tools) {
  const { setAnimation, logger } = tools

  // Find all AT hairpin groups in FT SVG (system-specific)
  // Query SVG first (not MEI) to only get hairpins in this system
  const atHairpinGroups = ftSvg.querySelectorAll('g.hairpin:not(.bounding-box)')
  logger.debug(`[liquifyHairpins] Found ${atHairpinGroups.length} AT hairpin elements in FT SVG`)

  atHairpinGroups.forEach((atHairpinGroup) => {
    const atId = atHairpinGroup.getAttribute('data-id')
    if (!atId) {
      logger.warn('[liquifyHairpins] AT hairpin group missing data-id, skipping')
      return
    }

    // Warn about spanning hairpins (partial representations that cross system boundaries)
    // This indicates a data issue where the hairpin should be placed in the correct system
    if (atHairpinGroup.classList.contains('spanning')) {
      logger.warn(`[liquifyHairpins] Spanning hairpin ${atId} detected - this hairpin crosses system boundaries and may have incorrect DT correspondence data. This should be fixed in the source data.`)
    }

    // Find corresponding MEI element
    const atHairpin = atMeiDom.querySelector(`hairpin[xml\\:id="${atId}"]`)
    if (!atHairpin) {
      logger.warn(`[liquifyHairpins] AT hairpin ${atId} not found in MEI, skipping`)
      return
    }

    // Get correspondence to DT hairpin(s)
    const correspAttr = atHairpin.getAttribute('corresp')
    if (!correspAttr) {
      // Editorial hairpin (no DT correspondence) - fade in from supplements
      logger.debug(`[liquifyHairpins] AT hairpin ${atId} has no corresp (editorial)`)
      handleEditorialHairpin(atHairpinGroup, setAnimation)
      return
    }

    // Parse corresp: space-separated list of DT hairpin IDs
    // Format: "#id" or "../path/file.xml#id" → extract just the ID
    const dtHairpinIds = correspAttr.trim().split(/\s+/).map(id => {
      const hashIndex = id.lastIndexOf('#')
      return hashIndex >= 0 ? id.substring(hashIndex + 1) : id
    })

    logger.debug(`[liquifyHairpins] AT hairpin ${atId} corresp: ${dtHairpinIds.join(', ')}`)

    if (dtHairpinIds.length === 1) {
      // Simple 1:1 correspondence
      handleSingleCorrespondence(atHairpinGroup, dtHairpinIds[0], atId, dtSvg, tools)
    } else {
      // Multi-correspondence: animate to first DT hairpin
      handleMultiCorrespondence(atHairpinGroup, dtHairpinIds, atId, dtSvg, tools)
    }
  })

  logger.debug('[liquifyHairpins] Hairpin liquification complete')
}

/**
 * Handle editorial hairpins (no DT correspondence).
 * Mark as supplied and fade in from supplements state.
 */
function handleEditorialHairpin (atHairpinGroup, setAnimation) {
  atHairpinGroup.classList.add('supplied')

  setAnimation({
    element: atHairpinGroup,
    id: atHairpinGroup.getAttribute('data-id'),
    localName: 'hairpin',
    states: {
      finding: null,
      normalization: null,
      supplements: { type: 'display', val: 'inline' },
      regulation: { type: 'display', val: 'inline' },
      interventions: { type: 'display', val: 'inline' }
    }
  })
}

/**
 * Handle 1:1 correspondence between AT and DT hairpin.
 * Splits both hairpins into two legs and animates each independently.
 */
function handleSingleCorrespondence (atHairpinGroup, dtHairpinId, atId, dtSvg, tools) {
  const { getNewPos, setAnimation, logger } = tools

  // Find DT hairpin in DT SVG
  // Try multiple selectors for compatibility (class name bug: "hairpincres" vs "hairpin cres")
  const dtHairpinGroup = dtSvg.querySelector(`[data-id="${dtHairpinId}"]`)

  // Debug: check what hairpins exist in DT SVG
  if (!dtHairpinGroup) {
    const allHairpins = dtSvg.querySelectorAll('[data-class*="hairpin"]')
    logger.debug(`[liquifyHairpins] DT SVG has ${allHairpins.length} hairpin elements`)
    if (allHairpins.length > 0 && allHairpins.length <= 5) {
      allHairpins.forEach(h => logger.debug(`  - DT hairpin: ${h.getAttribute('data-id')}`))
    }
    logger.warn(`[liquifyHairpins] DT hairpin ${dtHairpinId} not found in DT SVG`)
    return
  }

  // Extract polylines from both AT and DT hairpins
  const atPolylines = Array.from(atHairpinGroup.querySelectorAll('polyline'))
  const dtPolylines = Array.from(dtHairpinGroup.querySelectorAll('polyline'))

  if (atPolylines.length === 0) {
    logger.warn(`[liquifyHairpins] AT hairpin ${atId} has no polylines`)
    return
  }

  if (dtPolylines.length === 0) {
    logger.warn(`[liquifyHairpins] DT hairpin ${dtHairpinId} has no polylines`)
    return
  }

  logger.debug(`[liquifyHairpins] AT hairpin ${atId}: ${atPolylines.length} polyline(s), DT: ${dtPolylines.length} polyline(s)`)

  // Split AT hairpin into two legs
  const atLegs = splitHairpinIntoLegs(atPolylines, 'AT', logger)

  // Split DT hairpin into two legs
  const dtLegs = splitHairpinIntoLegs(dtPolylines, 'DT', logger)

  if (!atLegs || !dtLegs) {
    logger.warn(`[liquifyHairpins] Could not split hairpins into legs for ${atId}`)
    return
  }

  // Now we have: atLegs.upper, atLegs.lower, dtLegs.upper, dtLegs.lower
  // Each is an array of {x, y} points

  // Convert coordinates and animate each leg
  animateHairpinLeg(atPolylines[0], atLegs.upper, dtLegs.upper, `${atId}-upper`, getNewPos, setAnimation, logger)

  // For the lower leg, we need to either use an existing polyline or create a new one
  if (atPolylines.length > 1) {
    animateHairpinLeg(atPolylines[1], atLegs.lower, dtLegs.lower, `${atId}-lower`, getNewPos, setAnimation, logger)
  } else {
    // Clone the first polyline for the lower leg
    const lowerPolyline = atPolylines[0].cloneNode(true)
    atHairpinGroup.appendChild(lowerPolyline)
    animateHairpinLeg(lowerPolyline, atLegs.lower, dtLegs.lower, `${atId}-lower`, getNewPos, setAnimation, logger)
  }
}

/**
 * Handle multi-correspondence: multiple DT hairpins → single AT hairpin.
 * Filters to find DT hairpins that exist in the current system, then animates to the first available one.
 */
function handleMultiCorrespondence (atHairpinGroup, dtHairpinIds, atId, dtSvg, tools) {
  const { logger } = tools

  logger.debug(`[liquifyHairpins] Multi-correspondence for AT ${atId}: ${dtHairpinIds.length} DT hairpins`)

  // Filter to only DT hairpins that exist in this system's DT SVG
  const availableDtIds = dtHairpinIds.filter(dtId => {
    const exists = dtSvg.querySelector(`[data-id="${dtId}"]`) !== null
    if (!exists) {
      logger.debug(`[liquifyHairpins] DT hairpin ${dtId} not in this system's DT SVG, skipping`)
    }
    return exists
  })

  if (availableDtIds.length === 0) {
    logger.warn(`[liquifyHairpins] None of the ${dtHairpinIds.length} DT hairpins for AT ${atId} exist in this system's DT SVG`)
    return
  }

  logger.debug(`[liquifyHairpins] Using DT hairpin ${availableDtIds[0]} from ${availableDtIds.length} available in this system`)

  // Use the first available DT hairpin in this system
  const firstDtId = availableDtIds[0]
  handleSingleCorrespondence(atHairpinGroup, firstDtId, atId, dtSvg, tools)
}

/**
 * Split hairpin polyline(s) into upper and lower legs.
 *
 * Handles two cases:
 * 1. Single polyline with 3 points (wedge): split into upper (0→1) and lower (2→1) edges
 * 2. Two polylines: treat as upper and lower legs
 *
 * @param {Array<SVGPolylineElement>} polylines - Hairpin polylines
 * @param {string} label - 'AT' or 'DT' for logging
 * @param {Object} logger - Logger instance
 * @returns {{upper: Array, lower: Array}|null} - Upper and lower leg points, or null
 */
function splitHairpinIntoLegs (polylines, label, logger) {
  if (polylines.length === 0) return null

  // Parse points from first polyline
  const firstPolyline = polylines[0]
  const pointsAttr = firstPolyline.getAttribute('points')
  if (!pointsAttr) return null

  const points = parsePolylinePoints(pointsAttr)

  if (polylines.length === 1) {
    // Single polyline: check if it's a 3-point wedge
    if (points.length === 3) {
      // 3-point wedge: middle point is the closed end
      // The two outer points form the open end
      // Identify upper vs lower by Y coordinate (lower Y = higher on screen = upper)
      const outerPoints = [points[0], points[2]]
      const closedPoint = points[1]

      // Sort outer points by Y coordinate (ascending = top to bottom on screen)
      outerPoints.sort((a, b) => a.y - b.y)

      logger.debug(`[liquifyHairpins] ${label} single 3-point wedge, upper Y=${outerPoints[0].y}, lower Y=${outerPoints[1].y}`)
      return {
        upper: [outerPoints[0], closedPoint], // Lower Y value = upper on screen
        lower: [outerPoints[1], closedPoint] // Higher Y value = lower on screen
      }
    } else if (points.length === 2) {
      // 2-point line: duplicate for both legs (will be at same position)
      logger.debug(`[liquifyHairpins] ${label} single 2-point line`)
      return {
        upper: [points[0], points[1]],
        lower: [points[0], points[1]]
      }
    } else {
      logger.warn(`[liquifyHairpins] ${label} unexpected point count: ${points.length}`)
      // Try to use first and last point
      return {
        upper: [points[0], points[points.length - 1]],
        lower: [points[0], points[points.length - 1]]
      }
    }
  } else {
    // Two polylines: determine which is upper vs lower by Y coordinate
    const secondPolyline = polylines[1]
    const points2Attr = secondPolyline.getAttribute('points')
    if (!points2Attr) return null

    const points2 = parsePolylinePoints(points2Attr)

    // Compare Y coordinates of first points to determine which is upper
    // (In SVG, lower Y = higher on screen = upper)
    const firstY = points[0].y
    const secondY = points2[0].y

    logger.debug(`[liquifyHairpins] ${label} two polylines: first Y=${firstY}, second Y=${secondY}`)

    if (firstY < secondY) {
      // First polyline is higher on screen (upper)
      return {
        upper: points,
        lower: points2
      }
    } else {
      // Second polyline is higher on screen (upper)
      return {
        upper: points2,
        lower: points
      }
    }
  }
}

/**
 * Parse polyline points attribute into array of {x, y} objects.
 *
 * @param {string} pointsAttr - Points attribute value (e.g., "708,297 8335,387")
 * @returns {Array<{x: number, y: number}>} - Array of point objects
 */
function parsePolylinePoints (pointsAttr) {
  return pointsAttr.trim().split(/\s+/).map(point => {
    const [x, y] = point.split(',').map(Number)
    return { x, y }
  }).filter(p => !isNaN(p.x) && !isNaN(p.y))
}

/**
 * Animate a single hairpin leg from AT to DT position.
 *
 * @param {SVGPolylineElement} polyline - The polyline element to animate
 * @param {Array<{x, y}>} atPoints - AT leg points
 * @param {Array<{x, y}>} dtPoints - DT leg points
 * @param {string} id - Unique ID for this leg animation
 * @param {Function} getNewPos - Position transformation function
 * @param {Function} setAnimation - Animation setter function
 * @param {Object} logger - Logger instance
 */
function animateHairpinLeg (polyline, atPoints, dtPoints, id, getNewPos, setAnimation, logger) {
  // Update the polyline's base points attribute to match this leg's AT position
  const basePointsStr = atPoints.map(p => `${p.x},${p.y}`).join(' ')
  polyline.setAttribute('points', basePointsStr)

  // Check if hairpin direction is reversed between AT and DT
  // If AT goes left→right but DT goes right→left (or vice versa), reverse DT points
  if (atPoints.length >= 2 && dtPoints.length >= 2) {
    const atDirection = atPoints[atPoints.length - 1].x - atPoints[0].x // Positive if left→right
    const dtDirection = dtPoints[dtPoints.length - 1].x - dtPoints[0].x

    // If directions have opposite signs, reverse DT points to match AT direction
    if ((atDirection > 0 && dtDirection < 0) || (atDirection < 0 && dtDirection > 0)) {
      logger.debug(`[liquifyHairpins] Reversing DT leg direction for ${id} (AT: ${atDirection > 0 ? 'L→R' : 'R→L'}, DT: ${dtDirection > 0 ? 'L→R' : 'R→L'})`)
      dtPoints.reverse()
    }
  }

  // Ensure both legs have the same number of points (pad if needed)
  const maxLen = Math.max(atPoints.length, dtPoints.length)

  while (atPoints.length < maxLen) {
    atPoints.push(atPoints[atPoints.length - 1]) // Duplicate last point
  }

  while (dtPoints.length < maxLen) {
    dtPoints.push(dtPoints[dtPoints.length - 1]) // Duplicate last point
  }

  // Convert DT points to transformed positions
  const findingsPoints = atPoints.map((atPt, i) => {
    const dtPt = dtPoints[i]
    return getNewPos(atPt, dtPt)
  })

  // Format as points attribute strings
  const atPointsStr = atPoints.map(p => `${p.x},${p.y}`).join(' ')
  const findingsPointsStr = findingsPoints.map(p => `${p.x},${p.y}`).join(' ')

  logger.debug(`[liquifyHairpins] Animating leg ${id}: AT ${atPointsStr} -> finding ${findingsPointsStr}`)

  // Apply animation
  setAnimation({
    element: polyline,
    id,
    localName: 'hairpin-leg',
    states: {
      finding: { type: 'points', val: findingsPointsStr },
      normalization: { type: 'points', val: findingsPointsStr },
      supplements: { type: 'points', val: atPointsStr },
      regulation: { type: 'points', val: atPointsStr },
      interventions: { type: 'points', val: atPointsStr }
    }
  })
}
