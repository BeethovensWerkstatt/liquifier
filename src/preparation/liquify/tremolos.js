/**
 * Animate tremolo elements (`bTrem`, `fTrem`) between AT and DT transcriptions.
 *
 * Preferred strategy:
 * - Expand AT tremolo glyph `<use>` into inline `<polygon>` strokes when possible
 * - Animate each stroke's `points` from DT geometry (finding/normalization/readingOrder)
 *   to AT geometry (regulation/supplements/interventions)
 *
 * Fallback strategy:
 * - Keep the glyph `<use>` and use opacity crossfade (previous behavior) when glyph
 *   expansion cannot be resolved (missing defs, unsupported path commands, etc.)
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM (unused here, kept for API consistency)
 * @param {Object} tools - Animation helper bundle
 * @param {Function} tools.getNewPos - Converts DT coordinates into FT coordinate space
 * @param {Map<string, string[]>} tools.correspMappings - AT element id -> DT ids mapping
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer
 * @param {Object} tools.logger - Logger instance
 * @returns {void}
 */
export const liquifyTremolos = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  const tremolos = ftSvg.querySelectorAll('g.bTrem:not(.bounding-box), g.fTrem:not(.bounding-box)')

  tremolos.forEach(trem => {
    const atId = trem.getAttribute('data-id')
    if (!atId) return

    const dtIds = correspMappings.get(atId) || []
    const dtStrokes = collectDtStrokes(dtSvg, dtIds, logger)
    const glyphUse = trem.querySelector(':scope > use')
    const atStrokes = glyphUse ? expandGlyphUseToInlineStrokes(ftSvg, trem, glyphUse, logger) : []

    if (atStrokes.length === 0) {
      applyOpacityFallback(trem, atId, dtStrokes, getNewPos, setAnimation)
      return
    }

    const sortedAt = sortPolygonsByVerticalCenter(atStrokes)
    const sortedDt = dtStrokes.slice().sort((a, b) => a.avgY - b.avgY)
    const minCount = Math.min(sortedAt.length, sortedDt.length)

    for (let i = 0; i < minCount; i++) {
      const atPoly = sortedAt[i]
      const atPoints = atPoly.getAttribute('points') || ''
      const findingsPoints = convertDtPointsToFtPoints(sortedDt[i].points, getNewPos)

      setAnimation({
        element: atPoly,
        id: `${atId}-stroke-${i}`,
        localName: 'tremolo-stroke',
        states: {
          finding: { type: 'points', val: findingsPoints },
          normalization: { type: 'points', val: findingsPoints },
          regulation: { type: 'points', val: atPoints },
          supplements: { type: 'points', val: atPoints },
          interventions: { type: 'points', val: atPoints }
        }
      })
    }

    for (let i = minCount; i < sortedAt.length; i++) {
      const atPoints = sortedAt[i].getAttribute('points') || ''
      setAnimation({
        element: sortedAt[i],
        id: `${atId}-stroke-${i}`,
        localName: 'tremolo-stroke',
        states: {
          finding: null,
          normalization: null,
          regulation: { type: 'points', val: atPoints },
          supplements: { type: 'points', val: atPoints },
          interventions: { type: 'points', val: atPoints }
        }
      })
    }

    for (let i = minCount; i < sortedDt.length; i++) {
      createDtOnlyStroke(trem, atId, i, sortedDt[i].points, getNewPos, setAnimation)
    }
  })
}

/**
 * Resolve the direct AT tremolo children that represent the glyph symbol.
 * These are the elements whose opacity will be toggled.
 *
 * Priority order:
 * 1. Direct `<use>` children (most common – SMuFL glyph)
 * 2. Direct shape children (polygon, path, line, polyline)
 * 3. The tremolo group itself, if it contains no nested note/chord content
 *
 * @param {Element} trem - Tremolo group element.
 * @returns {Element[]}
 */
function resolveGlyphTargets (trem) {
  const directUses = Array.from(trem.querySelectorAll(':scope > use'))
  if (directUses.length > 0) return directUses

  const directShapes = Array.from(
    trem.querySelectorAll(':scope > polygon, :scope > path, :scope > line, :scope > polyline')
  )
  if (directShapes.length > 0) return directShapes

  if (!trem.querySelector('g.note, g.chord')) return [trem]

  return []
}

/**
 * Apply the old opacity-based crossfade strategy.
 *
 * @param {Element} trem - Tremolo group.
 * @param {string} atId - AT tremolo id.
 * @param {Array<{points: Array<{x:number, y:number}>}>} dtStrokes - DT strokes.
 * @param {Function} getNewPos - Coordinate converter.
 * @param {Function} setAnimation - Animation setter.
 * @returns {void}
 */
function applyOpacityFallback (trem, atId, dtStrokes, getNewPos, setAnimation) {
  const glyphs = resolveGlyphTargets(trem)

  glyphs.forEach((glyph, i) => {
    glyph.setAttribute('opacity', '0')
    setAnimation({
      element: glyph,
      id: `${atId}-tremolo-glyph-${i}`,
      localName: 'tremolo',
      states: {
        finding: { type: 'opacity', val: '0' },
        normalization: { type: 'opacity', val: '0' },
        readingOrder: { type: 'opacity', val: '0' },
        regulation: { type: 'opacity', val: '1' },
        supplements: { type: 'opacity', val: '1' },
        interventions: { type: 'opacity', val: '1' }
      }
    })
  })

  dtStrokes.forEach((stroke, i) => {
    const newPoly = trem.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    newPoly.setAttribute('points', convertDtPointsToFtPoints(stroke.points, getNewPos))
    newPoly.setAttribute('class', 'bw-trem-stroke')
    newPoly.setAttribute('stroke-opacity', '1')
    newPoly.setAttribute('fill-opacity', '1')
    newPoly.setAttribute('opacity', '1')
    trem.appendChild(newPoly)

    setAnimation({
      element: newPoly,
      id: `${atId}-dt-stroke-${i}`,
      localName: 'tremolo',
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
}

/**
 * Collect DT tremolo polygons and convert them to FT coordinate space once.
 *
 * @param {SVGElement} dtSvg - Diplomatic SVG.
 * @param {string[]} dtIds - Corresponding DT ids.
 * @param {Object} logger - Logger.
 * @returns {Array<{points:Array<{x:number,y:number}>, avgY:number}>}
 */
function collectDtStrokes (dtSvg, dtIds, logger) {
  const result = []

  dtIds.forEach(dtId => {
    const dtEl = dtSvg.querySelector(`[data-id="${dtId}"]`)
    if (!dtEl) {
      logger.debug?.(`[Tremolos] DT element not found: ${dtId}`)
      return
    }

    const dtPoly = dtEl.querySelector('polygon')
    if (!dtPoly) {
      logger.debug?.(`[Tremolos] No polygon in DT element: ${dtId}`)
      return
    }

    const points = parsePolygonPoints(dtPoly.getAttribute('points') || '')
    if (points.length === 0) return

    const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length
    result.push({ points, avgY })
  })

  return result
}

/**
 * Expand a glyph `<use>` into inline tremolo stroke polygons.
 *
 * @param {SVGElement} ftSvg - FT SVG root.
 * @param {Element} trem - Tremolo group containing the use.
 * @param {Element} glyphUse - Glyph use element.
 * @param {Object} logger - Logger.
 * @returns {SVGPolygonElement[]} Inline AT stroke polygons.
 */
function expandGlyphUseToInlineStrokes (ftSvg, trem, glyphUse, logger) {
  const href = (glyphUse.getAttribute('href') || glyphUse.getAttribute('xlink:href') || '').trim()
  if (!href.startsWith('#')) return []

  const symbol = ftSvg.querySelector(href)
  if (!symbol) {
    logger.debug?.(`[Tremolos] Glyph symbol not found: ${href}`)
    return []
  }

  const path = symbol.querySelector('path')
  const d = path?.getAttribute('d') || ''
  if (!d) return []

  const subpaths = parsePathToPolygons(d)
  if (subpaths.length === 0) return []

  const pathTransforms = parseTransformFunctions(path?.getAttribute('transform') || '')
  const useTransforms = parseTransformFunctions(glyphUse.getAttribute('transform') || '')

  const doc = trem.ownerDocument
  const insertBeforeNode = trem.querySelector(':scope > g.chord, :scope > g.note')
  const created = []

  subpaths.forEach((polyPoints, i) => {
    const transformed = polyPoints.map(point => {
      const pathSpace = applyTransformFunctions(point, pathTransforms)
      return applyTransformFunctions(pathSpace, useTransforms)
    })

    if (transformed.length < 3) return

    const poly = doc.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    poly.setAttribute('class', 'bw-trem-stroke bw-trem-inline')
    poly.setAttribute('stroke-opacity', '1')
    poly.setAttribute('fill-opacity', '1')
    poly.setAttribute('data-inline-stroke-index', String(i))
    poly.setAttribute('points', transformed.map(p => `${p.x},${p.y}`).join(' '))

    trem.insertBefore(poly, insertBeforeNode || null)
    created.push(poly)
  })

  if (created.length > 0) {
    glyphUse.remove()
  }

  return created
}

/**
 * Create a DT-only stroke when DT has more strokes than AT.
 *
 * @param {Element} trem - Tremolo group.
 * @param {string} atId - AT tremolo id.
 * @param {number} index - Stroke index.
 * @param {Array<{x:number,y:number}>} dtPoints - DT polygon points.
 * @param {Function} getNewPos - Coordinate converter.
 * @param {Function} setAnimation - Animation setter.
 * @returns {void}
 */
function createDtOnlyStroke (trem, atId, index, dtPoints, getNewPos, setAnimation) {
  const findingsPoints = convertDtPointsToFtPoints(dtPoints, getNewPos)
  const poly = trem.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  poly.setAttribute('class', 'bw-trem-stroke bw-trem-inline bw-trem-dt-only')
  poly.setAttribute('stroke-opacity', '1')
  poly.setAttribute('fill-opacity', '1')
  poly.setAttribute('points', findingsPoints)
  trem.appendChild(poly)

  setAnimation({
    element: poly,
    id: `${atId}-stroke-dt-only-${index}`,
    localName: 'tremolo-stroke',
    states: {
      finding: { type: 'opacity', val: '1' },
      normalization: { type: 'opacity', val: '1' },
      readingOrder: { type: 'opacity', val: '1' },
      regulation: { type: 'opacity', val: '0' },
      supplements: { type: 'opacity', val: '0' },
      interventions: { type: 'opacity', val: '0' }
    }
  })
}

/**
 * Sort polygons by average y (top to bottom).
 *
 * @param {SVGPolygonElement[]} polygons - Polygon elements.
 * @returns {SVGPolygonElement[]} Sorted polygons.
 */
function sortPolygonsByVerticalCenter (polygons) {
  return polygons.slice().sort((a, b) => {
    const ay = averageY(parsePolygonPoints(a.getAttribute('points') || ''))
    const by = averageY(parsePolygonPoints(b.getAttribute('points') || ''))
    return ay - by
  })
}

/**
 * Convert DT points to FT coordinate space.
 *
 * @param {Array<{x:number,y:number}>} dtPoints - DT points.
 * @param {Function} getNewPos - Coordinate converter.
 * @returns {string} SVG points string.
 */
function convertDtPointsToFtPoints (dtPoints, getNewPos) {
  const points = dtPoints.map(pt => getNewPos({ x: 0, y: 0 }, pt))
  return points.map(pt => `${pt.x},${pt.y}`).join(' ')
}

/**
 * Compute average y from polygon points.
 *
 * @param {{x:number,y:number}[]} points - Polygon points.
 * @returns {number} Average y.
 */
function averageY (points) {
  if (!points.length) return 0
  return points.reduce((sum, p) => sum + p.y, 0) / points.length
}

/**
 * Parse supported SVG path commands into polygon subpaths.
 * Supports M/m, L/l, H/h, V/v, Z/z.
 *
 * @param {string} d - Path data.
 * @returns {Array<Array<{x:number,y:number}>>} Polygon point arrays.
 */
function parsePathToPolygons (d) {
  const tokens = tokenizePathData(d)
  if (tokens.length === 0) return []

  const subpaths = []
  let cursor = { x: 0, y: 0 }
  let start = null
  let current = []
  let i = 0
  let cmd = null

  while (i < tokens.length) {
    if (isCommandToken(tokens[i])) {
      cmd = tokens[i++]
    } else if (!cmd) {
      return []
    }

    if (cmd === 'M' || cmd === 'm') {
      const isRelative = cmd === 'm'
      const first = readPair(tokens, i)
      if (!first) break
      i += 2
      cursor = {
        x: isRelative ? cursor.x + first.x : first.x,
        y: isRelative ? cursor.y + first.y : first.y
      }
      start = { ...cursor }
      if (current.length > 0) {
        if (current.length >= 3) subpaths.push(trimClosedDuplicate(current))
        current = []
      }
      current.push({ ...cursor })

      while (true) {
        const next = readPair(tokens, i)
        if (!next) break
        i += 2
        cursor = {
          x: isRelative ? cursor.x + next.x : next.x,
          y: isRelative ? cursor.y + next.y : next.y
        }
        current.push({ ...cursor })
      }
      continue
    }

    if (cmd === 'L' || cmd === 'l') {
      const isRelative = cmd === 'l'
      while (true) {
        const next = readPair(tokens, i)
        if (!next) break
        i += 2
        cursor = {
          x: isRelative ? cursor.x + next.x : next.x,
          y: isRelative ? cursor.y + next.y : next.y
        }
        current.push({ ...cursor })
      }
      continue
    }

    if (cmd === 'H' || cmd === 'h') {
      const isRelative = cmd === 'h'
      while (isNumberToken(tokens[i])) {
        const x = parseFloat(tokens[i++])
        cursor = { x: isRelative ? cursor.x + x : x, y: cursor.y }
        current.push({ ...cursor })
      }
      continue
    }

    if (cmd === 'V' || cmd === 'v') {
      const isRelative = cmd === 'v'
      while (isNumberToken(tokens[i])) {
        const y = parseFloat(tokens[i++])
        cursor = { x: cursor.x, y: isRelative ? cursor.y + y : y }
        current.push({ ...cursor })
      }
      continue
    }

    if (cmd === 'Z' || cmd === 'z') {
      if (start && current.length > 0) {
        current.push({ ...start })
      }
      if (current.length >= 3) {
        subpaths.push(trimClosedDuplicate(current))
      }
      current = []
      start = null
      continue
    }

    return []
  }

  if (current.length >= 3) {
    subpaths.push(trimClosedDuplicate(current))
  }

  return subpaths.filter(points => points.length >= 3)
}

/**
 * Tokenize path data into command and number tokens.
 *
 * @param {string} d - Path data.
 * @returns {string[]} Token array.
 */
function tokenizePathData (d) {
  const tokens = []
  const regex = /([MLHVZmlhvz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g
  let match
  while ((match = regex.exec(String(d))) !== null) {
    tokens.push(match[1] || match[2])
  }
  return tokens
}

/**
 * Parse SVG transform list into transform function descriptors.
 * Supports translate and scale.
 *
 * @param {string} transform - Transform string.
 * @returns {Array<{name:string,args:number[]}>} Parsed transform functions.
 */
function parseTransformFunctions (transform) {
  const result = []
  const regex = /(translate|scale)\(([^)]*)\)/g
  let match
  while ((match = regex.exec(String(transform))) !== null) {
    const args = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
      .filter(n => Number.isFinite(n))
    result.push({ name: match[1], args })
  }
  return result
}

/**
 * Apply transform functions to a point.
 * SVG applies listed transforms right-to-left.
 *
 * @param {{x:number,y:number}} point - Point.
 * @param {Array<{name:string,args:number[]}>} transforms - Transform list.
 * @returns {{x:number,y:number}} Transformed point.
 */
function applyTransformFunctions (point, transforms) {
  let p = { ...point }
  const ordered = transforms.slice().reverse()

  ordered.forEach(transform => {
    if (transform.name === 'translate') {
      const tx = transform.args[0] || 0
      const ty = transform.args.length > 1 ? transform.args[1] : 0
      p = { x: p.x + tx, y: p.y + ty }
      return
    }

    if (transform.name === 'scale') {
      const sx = transform.args.length > 0 ? transform.args[0] : 1
      const sy = transform.args.length > 1 ? transform.args[1] : sx
      p = { x: p.x * sx, y: p.y * sy }
    }
  })

  return p
}

/**
 * Determine whether token is an SVG path command.
 *
 * @param {string} token - Token.
 * @returns {boolean} True for command tokens.
 */
function isCommandToken (token) {
  return /^[MLHVZmlhvz]$/.test(String(token || ''))
}

/**
 * Determine whether token is numeric.
 *
 * @param {string} token - Token.
 * @returns {boolean} True for number tokens.
 */
function isNumberToken (token) {
  return typeof token === 'string' && /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)
}

/**
 * Read numeric x/y pair at index.
 *
 * @param {string[]} tokens - Tokens.
 * @param {number} index - Start index.
 * @returns {{x:number,y:number}|null} Pair or null.
 */
function readPair (tokens, index) {
  if (!isNumberToken(tokens[index]) || !isNumberToken(tokens[index + 1])) return null
  return { x: parseFloat(tokens[index]), y: parseFloat(tokens[index + 1]) }
}

/**
 * Trim duplicate closing point when equal to first point.
 *
 * @param {{x:number,y:number}[]} points - Polygon points.
 * @returns {{x:number,y:number}[]} Trimmed points.
 */
function trimClosedDuplicate (points) {
  if (points.length < 2) return points

  const first = points[0]
  const out = points.slice()

  // Some glyph paths explicitly return to start before `z`, then `z` closes again.
  // Remove all trailing duplicates of the first point so polygon vertex counts stay
  // stable and SVG can interpolate `points` across phases.
  while (out.length > 2) {
    const last = out[out.length - 1]
    if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
      out.pop()
      continue
    }
    break
  }

  return out
}

/**
 * Parse an SVG polygon `points` attribute string into an array of {x, y} objects.
 *
 * @param {string} points - Raw `points` attribute value.
 * @returns {{x: number, y: number}[]}
 */
function parsePolygonPoints (points) {
  const result = []
  const regex = /([-\d.]+)[,\s]+([-\d.]+)/g
  let match
  while ((match = regex.exec(String(points))) !== null) {
    result.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) })
  }
  return result
}
