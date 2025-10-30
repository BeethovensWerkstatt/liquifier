/**
 * Prepare AT beam elements for animation
 * 
 * Beams consist of polygon elements representing beam lines. Typically there is:
 * - One main beam spanning the full length
 * - Additional segmented beams (e.g., for 16th notes, 32nd notes)
 * 
 * This function merges connected segments into continuous polygons by detecting
 * segments that share endpoints (indicating they connect). Only segments that
 * attach to each other are combined.
 * 
 * @param {SVGElement} svg - AT SVG DOM containing beam elements
 */
const adjustAtBeams = (svg) => {
  const beams = svg.querySelectorAll('g.beam:not(.bounding-box)')
  
  beams.forEach(beamG => {
    const polygons = beamG.querySelectorAll('polygon')
    if (polygons.length === 0) return // Nothing to merge if no polygons
    if (polygons.length === 1) { // Nothing to merge if only one polygon, but still need to adjust winding order
      const pointsStr = polygons[0].getAttribute('points')
      const points = pointsStr.trim().split(/\s+/).map(point => {
        const [x, y] = point.split(',').map(Number)
        return { x, y }
      })
      const newPoints = normalizeBeamPolygonToDtOrder(points)
      const newPointsStr = newPoints.map(p => `${p.x},${p.y}`).join(' ')

      polygons[0].setAttribute('points', newPointsStr)
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
      
      console.log(`[Adjust AT Beams] Merged ${group.length} segments into one polygon`)
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
        console.warn(`[Adjust AT Beams] Expected 4 points, got ${points.length}`)
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
 * Normalize a beam polygon to DT's winding order
 * 
 * DT (Thulemeier) always uses: [upper left, upper right, lower right, lower left]
 * 
 * For beam trapezoids, the left and right edges are vertical, so points
 * on each side share the same X coordinate. We group by X, then order by Y.
 * 
 * @param {Array} points - Array of {x, y} coordinates
 * @returns {Array} Reordered coordinates in DT format
 */
const normalizeBeamPolygonToDtOrder = (points, debug = false) => {
  if (points.length !== 4) return points
  
  if (debug) {
    console.log(`[Normalize] Input points: ${points.map(p => `[${p.x.toFixed(1)},${p.y.toFixed(1)}]`).join(' ')}`)
  }
  
  // Group points by X coordinate (with small tolerance for floating point)
  const tolerance = 0.5
  const groups = []
  
  points.forEach(point => {
    let foundGroup = false
    for (const group of groups) {
      if (Math.abs(group[0].x - point.x) < tolerance) {
        group.push(point)
        foundGroup = true
        break
      }
    }
    if (!foundGroup) {
      groups.push([point])
    }
  })
  
  // Should have 2 groups (left edge and right edge)
  if (groups.length !== 2) {
    console.warn(`[Adjust AT Beams] Expected 2 X groups for polygon, got ${groups.length}`)
    return points
  }
  
  // Sort groups by X (left edge first, right edge second)
  groups.sort((a, b) => a[0].x - b[0].x)
  
  if (debug) {
    console.log(`[Normalize] Left edge X: ${groups[0][0].x.toFixed(1)}, Right edge X: ${groups[1][0].x.toFixed(1)}`)
  }
  
  // Within each group, sort by Y (top first, bottom second)
  const leftEdge = groups[0].sort((a, b) => a.y - b.y)
  const rightEdge = groups[1].sort((a, b) => a.y - b.y)
  
  if (debug) {
    console.log(`[Normalize] Left edge: top Y=${leftEdge[0].y.toFixed(1)}, bottom Y=${leftEdge[1].y.toFixed(1)}`)
    console.log(`[Normalize] Right edge: top Y=${rightEdge[0].y.toFixed(1)}, bottom Y=${rightEdge[1].y.toFixed(1)}`)
  }
  
  // Return in DT order: [upper left, upper right, lower right, lower left]
  const result = [
    leftEdge[0],   // upper left
    rightEdge[0],  // upper right
    rightEdge[1],  // lower right
    leftEdge[1]    // lower left
  ]
  
  if (debug) {
    console.log(`[Normalize] Output points: ${result.map(p => `[${p.x.toFixed(1)},${p.y.toFixed(1)}]`).join(' ')}`)
  }
  
  return result
}

/**
 * Check if two polygons connect (share an edge)
 * 
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
 */
const pointsEqual = (p1, p2, tolerance = 0.1) => {
  return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance
}

/**
 * Remove duplicate consecutive points from an array
 */
const removeDuplicatePoints = (points) => {
  if (points.length === 0) return points
  
  const unique = [points[0]]
  for (let i = 1; i < points.length; i++) {
    if (!pointsEqual(points[i], points[i - 1])) {
      unique.push(points[i])
    }
  }
  return unique
}

/**
 * Animate beam elements between AT and DT transcriptions
 * 
 * First prepares beam paths in the AT, then animates each beam path based on 
 * corresponding DT beam position. Handles beams without DT correspondence by 
 * fading them out.
 * 
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Tools object containing helper functions and data:
 *   - getNewPos: Function to calculate new position
 *   - convertD: Function to convert path d attribute
 *   - scaleFactor: Scale factor between DT and AT
 *   - correspMappings: Map of AT to DT element IDs
 *   - addTransform: Function to add animate element
 *   - addTransformTranslate: Function to add animateTransform element
 *   - generateHideAnimation: Function to generate fade-out animation
 */
export const liquifyBeams = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { scaleFactor, getNewPos, convertD, correspMappings, addTransform, addTransformTranslate, generateHideAnimation } = tools
  
  // First, prepare/adjust beam paths in the AT
  adjustAtBeams(ftSvg)
  
  const beams = ftSvg.querySelectorAll('g.beam:not(.bounding-box)')
  beams.forEach(beam => {
    const atId = beam.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)
    
    if (!dtIds || dtIds.length === 0) {
      // Fade out beams without DT correspondence
      const polygons = beam.querySelectorAll('polygon')
      polygons.forEach(polygon => generateHideAnimation(polygon))
      return
    }

    // Get the beam polygons (now merged)
    const atPolygons = beam.querySelectorAll('polygon')
    if (atPolygons.length === 0) return

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
      atPolygons.forEach(polygon => generateHideAnimation(polygon))
      return
    }

    // Sort polygons by vertical position (average Y coordinate)
    const atSorted = sortPolygonsByPosition(Array.from(atPolygons))
    
    // Sort DT polygons and keep track of their source beam ID
    const dtSorted = allDtPolygons.map(item => {
      const pointsStr = item.element.getAttribute('points')
      const points = pointsStr.trim().split(/\s+/).map(point => {
        const [x, y] = point.split(',').map(Number)
        return { x, y }
      })
      const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length
      return { element: item.element, dtId: item.dtId, avgY, points }
    }).sort((a, b) => a.avgY - b.avgY)

    // Match polygons from top to bottom
    const minCount = Math.min(atSorted.length, dtSorted.length)
    
    if (atSorted.length !== dtSorted.length) {
      console.warn(`[Beam Animation] Mismatched polygon counts - AT: ${atSorted.length}, DT: ${dtSorted.length} (from ${dtIds.length} DT beams)`)
    }

    // Animate each matched pair
    for (let i = 0; i < minCount; i++) {
      const atPolygon = atSorted[i].element
      const dtPolygon = dtSorted[i].element
      
      const atPoints = atPolygon.getAttribute('points')
      const dtPoints = dtPolygon.getAttribute('points')
      
      // Convert polygon points using getNewPos for each coordinate pair
      const newPoints = convertPolygonPoints(atPoints, dtPoints, getNewPos)
      
      console.log(`[Beam Animation] AT ID: ${atId}, DT ID: ${dtSorted[i].dtId}, line ${i} (AT y~${Math.round(atSorted[i].avgY)}, DT y~${Math.round(dtSorted[i].avgY)})`)
      
      addTransform(atPolygon, 'points', [atPoints, newPoints])
    }
    
    // Fade out any extra AT polygons that don't have DT matches
    for (let i = minCount; i < atSorted.length; i++) {
      generateHideAnimation(atSorted[i].element)
    }
  })
}

/**
 * Sort polygons by their vertical position (top to bottom)
 * 
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
 * 
 * Takes the points attribute string, parses each coordinate pair, transforms
 * them using getNewPos, and reconstructs the points string.
 * 
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
    console.warn(`[Beam Animation] Expected 4 points, got AT: ${atCoords.length}, DT: ${dtCoords.length}`)
  }
  
  // Transform each coordinate pair (both now have same winding order from prep phase)
  const newCoords = atCoords.map((atPos, i) => {
    const dtPos = dtCoords[i] || atPos // fallback if counts don't match
    return getNewPos(atPos, dtPos)
  })
  
  // Reconstruct points string
  return newCoords.map(p => `${p.x},${p.y}`).join(' ')
}
