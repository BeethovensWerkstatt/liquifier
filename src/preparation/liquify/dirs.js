import { computeTextDiff } from '../../utils/textDiff.js'
import { addClass } from '../../utils/dom.js'

/**
 * Prepares animations for <dir> elements (musical directions like "pizz.", "8tel auch 6te", etc.)
 * between DT (diplomatic transcript) and AT (annotated transcript).
 * DIR ELEMENT COMPLEXITY:
 * - Multi-line support via <lb/> (line break) elements in MEI
 * - Multiple DT correspondence: one AT dir can map to multiple DT dirs (space-separated corresp attribute)
 * - Text variations: DT "8tel" → AT "16tel", DT "Stim." → AT "Stimme"
 * THREE ANIMATION STRATEGIES:
 * 1. LINE-BY-LINE (same line count):
 * - Each line gets independent text diff (common/delete/insert segments)
 * - Entire group translates to first line's DT position
 * - Example: DT "andere tiefe Stim.\ndasselbe" → AT "andere tiefe Stimme\ndasselbe"
 * 2. MULTI-CORRESPONDENCE (multiple DT dirs → single AT line):
 * - Split AT text into segments matching DT text boundaries
 * - Each segment wrapped in <g> with independent translate animation
 * - Sequential positioning in AT using estimated character width (~162 units @ 405px font)
 * - Example: DT "8tel" + "auch" + "6te" → AT "8tel auch 6te" (animated as 3 independent words)
 * 3. FULL TEXT DIFF (mismatched line counts):
 * - Concatenate all lines with spaces, compute single text diff
 * - Group translates to first line's DT position
 * - Fallback for complex structural mismatches
 * KEY TECHNICAL DETAILS:
 * - Transform animations only work on <g> elements, not <tspan> in SVG
 * - Multi-correspondence requires wrapping each word in its own <g>
 * - Character width estimation uses proportional font with 12% extra spacing
 * - Text diff shows insertions (class="supplied") and deletions (opacity fade)
 * - getNewPos(atPos, dtPos): Calculate transformed position between systems
 * - correspMappings: Map of AT element IDs to DT element IDs
 * - setAnimation(options): Apply animation states to SVG elements
 * - logger: Debug logging utility
 *
 * @param {SVGSVGElement} ftSvg - The fluid transcript SVG (output, will be modified)
 * @param {SVGSVGElement} dtSvg - The diplomatic transcript SVG (reference, read-only)
 * @param {Document} atMeiDom - The annotated transcript MEI DOM (source of dir elements)
 * @param {Object} tools - Object containing:
 * @returns {void} No return value.
 */
export function liquifyDirs (ftSvg, dtSvg, atMeiDom, tools) {
  const { getNewPos, correspMappings, applyUnmatchedClass, setAnimation, logger } = tools

  // Find all AT <dir> elements
  const atDirs = atMeiDom.querySelectorAll('dir')
  logger.debug('[liquifyDirs] Found ' + atDirs.length + ' <dir> elements in AT')

  atDirs.forEach((atDir) => {
    const atId = atDir.getAttribute('xml:id')
    if (!atId) {
      logger.warn('[liquifyDirs] AT dir without xml:id, skipping')
      return
    }

    logger.debug(`[liquifyDirs] Processing AT dir ${atId}`)

    // Get corresponding DT dir IDs (may be multiple, order matters)
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      logger.debug(`[liquifyDirs] AT dir ${atId} has no DT correspondence (editorial), fade in from supplements`)

      // Handle editorial dirs: fade in from supplements (hidden in finding/normalization)
      const atDirGroup = ftSvg.querySelector(`g[data-id="${atId}"][data-class="dir"]`)
      if (!atDirGroup) {
        logger.warn(`[liquifyDirs] Could not find editorial AT dir group x${atId} in FT SVG`)
        return
      }

      applyUnmatchedClass(atDirGroup)

      // Find the text element and all its tspans to apply fade-in animation
      const textElement = atDirGroup.querySelector('text')
      if (!textElement) {
        logger.warn(`[liquifyDirs] Could not find text element in editorial AT dir x${atId}`)
        return
      }

      // Apply fade-in animation to all tspans with data-class="text"
      const textTspans = textElement.querySelectorAll('tspan[data-class="text"]')

      textTspans.forEach((tspan, index) => {
        applyUnmatchedClass(tspan)

        // Apply opacity animation (fade in from supplements)
        setAnimation({
          element: tspan,
          states: {
            finding: { type: 'opacity', val: '0' },
            normalization: { type: 'opacity', val: '0' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'opacity', val: '1' },
            supplements: { type: 'opacity', val: '1' },
            interventions: { type: 'opacity', val: '1' }
          }
        })

        // Apply display animation (hidden until supplements)
        setAnimation({
          element: tspan,
          states: {
            finding: { type: 'display', val: 'none' },
            normalization: { type: 'display', val: 'none' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'display', val: 'inline' },
            supplements: { type: 'display', val: 'inline' },
            interventions: { type: 'display', val: 'inline' }
          }
        })
      })

      logger.debug(`[liquifyDirs] Applied fade-in animation to editorial dir ${atId}`)
      return
    }

    // Find AT dir group in ftSvg
    const atDirGroup = ftSvg.querySelector(`g[data-id="${atId}"][data-class="dir"]`)
    if (!atDirGroup) {
      logger.warn(`[liquifyDirs] Could not find AT dir group x${atId} in FT SVG`)
      return
    }

    // Find AT text element
    const atTextElement = atDirGroup.querySelector('text')
    if (!atTextElement) {
      logger.warn(`[liquifyDirs] Could not find text element in AT dir x${atId}`)
      return
    }

    // Extract AT text lines
    const atLines = extractAtTextLines(atTextElement)
    logger.debug(`[liquifyDirs] AT dir ${atId} has ${atLines.length} line(s)`)

    // Find all DT dir groups and extract text lines
    const dtDirData = []
    for (const dtId of dtIds) {
      const dtDirGroup = dtSvg.querySelector(`g[data-id="${dtId}"][data-class="dir"]`)
      if (!dtDirGroup) {
        logger.warn(`[liquifyDirs] Could not find DT dir ${dtId} in DT SVG`)
        continue
      }

      const dtTextElement = dtDirGroup.querySelector('text')
      if (!dtTextElement) {
        logger.warn(`[liquifyDirs] Could not find text element in DT dir ${dtId}`)
        continue
      }

      const dtLines = extractDtTextLines(dtTextElement)
      dtDirData.push({
        id: dtId,
        group: dtDirGroup,
        textElement: dtTextElement,
        lines: dtLines
      })
    }

    if (dtDirData.length === 0) {
      logger.warn(`[liquifyDirs] No valid DT dirs found for AT dir ${atId}`)
      return
    }

    logger.debug(`[liquifyDirs] Found ${dtDirData.length} DT dir(s) for AT dir ${atId}`)

    // Flatten all DT lines into a single array
    const allDtLines = []
    dtDirData.forEach(dtData => {
      dtData.lines.forEach(line => {
        allDtLines.push({
          text: line.text,
          x: line.x,
          y: line.y,
          dtId: dtData.id
        })
      })
    })

    logger.debug(`[liquifyDirs] AT dir ${atId}: ${allDtLines.length} DT line(s), ${atLines.length} AT line(s)`)
    logger.debug('[liquifyDirs]   AT lines: ' + atLines.map(l => `"${l.text}" at (${l.x},${l.y})`).join(', '))
    logger.debug('[liquifyDirs]   DT lines: ' + allDtLines.map(l => `"${l.text}" at (${l.x},${l.y})`).join(', '))

    // STRATEGY SELECTION: Choose animation approach based on line structure
    //
    // We have three different strategies for animating dir elements:
    // 1. Line-by-line: Same line count → animate each line independently with text diff
    // 2. Multi-correspondence: Multiple DT dirs → single AT line → independent word animations
    // 3. Full text diff: Mismatched structures → concatenate all text and do single diff

    if (allDtLines.length === 0 || atLines.length === 0) {
      logger.warn(`[liquifyDirs] AT dir ${atId} has empty lines, skipping`)
      return
    }

    // CASE 1: SAME NUMBER OF LINES - Line-by-line text diff
    // Example: DT has 2 lines "andere tiefe Stim." + "dasselbe"
    //          AT has 2 lines "andere tiefe Stimme" + "dasselbe"
    // Approach: Animate each line independently, group translates to first line's DT position
    if (allDtLines.length === atLines.length) {
      logger.debug(`[liquifyDirs] AT dir ${atId}: Line-by-line text diff (${atLines.length} lines)`)
      animateLineByLine(atDirGroup, allDtLines, atLines, getNewPos, setAnimation, logger, atId)
    } else if (dtDirData.length > 1 && atLines.length === 1) {
      // CASE 2: MULTI-CORRESPONDENCE - Multiple DT dirs → single AT line
      // Example: DT has 3 separate dirs "8tel" + "auch" + "6te"
      //          AT has 1 line "8tel auch 6te"
      // Approach: Split AT text by DT boundaries, each word animates to its DT position independently
      // This is the most complex case requiring separate <g> wrappers for each word segment
      logger.debug(`[liquifyDirs] AT dir ${atId}: Multi-correspondence (${dtDirData.length} DT dirs → 1 AT line)`)
      animateMultiCorrespondence(atDirGroup, dtDirData, atLines[0], getNewPos, setAnimation, logger, atId)
    } else {
      // CASE 3: MISMATCHED LINE COUNTS - Full text diff fallback
      // Example: DT has 3 lines, AT has 2 lines (or any other mismatch)
      // Approach: Concatenate all text with spaces, do single text diff, group translates to first line
      logger.debug(`[liquifyDirs] AT dir ${atId}: Full text diff (DT: ${allDtLines.length} lines, AT: ${atLines.length} lines)`)
      const dtFullText = allDtLines.map(l => l.text).join(' ')
      const atFullText = atLines.map(l => l.text).join(' ')

      // Use first line position for DT, first line position for AT
      const dtPos = { x: allDtLines[0].x, y: allDtLines[0].y }
      const atPos = { x: atLines[0].x, y: atLines[0].y }

      animateFullText(atDirGroup, dtFullText, atFullText, dtPos, atPos, getNewPos, setAnimation, logger, atId)
    }
  })
}

/**
 * Animate dir with line-by-line text diff (when DT and AT have same line count)
 *
 * @param {string} atDirGroup - String input used by this function.
 * @param {Array<*>} dtLines - Collection of values used by this function.
 * @param {Array<*>} atLines - Collection of values used by this function.
 * @param {Function} getNewPos - Callback function invoked by this operation.
 * @param {Function} setAnimation - Animation descriptor writer for phase transitions.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance used for diagnostic output.
 * @param {string} atId - Identifier for the target element.
 * @returns {void} No return value.
 */
function animateLineByLine (atDirGroup, dtLines, atLines, getNewPos, setAnimation, logger, atId) {
  const atTextElement = atDirGroup.querySelector('text')
  if (!atTextElement) return

  // Clear existing AT text content
  atTextElement.innerHTML = ''
  atTextElement.setAttribute('font-size', '0px')

  // Calculate position difference for animation using first line
  // (all lines will move together as part of the group)
  const firstDtLine = dtLines[0]
  const firstAtLine = atLines[0]
  const newPos = getNewPos({ x: firstAtLine.x, y: firstAtLine.y }, { x: firstDtLine.x, y: firstDtLine.y })
  const translateX = (newPos?.x || 0) - firstAtLine.x
  const translateY = (newPos?.y || 0) - firstAtLine.y

  logger.debug(`[liquifyDirs] Group position: DT (${firstDtLine.x},${firstDtLine.y}) -> AT (${firstAtLine.x},${firstAtLine.y}), translate (${translateX},${translateY})`)

  // Process each line pair
  for (let i = 0; i < atLines.length; i++) {
    const dtLine = dtLines[i]
    const atLine = atLines[i]

    logger.debug(`[liquifyDirs] Line ${i + 1}: "${dtLine.text}" -> "${atLine.text}"`)

    // Compute text diff for this line
    const diffSegments = computeTextDiff(dtLine.text, atLine.text)
    logger.debug(`[liquifyDirs] Line ${i + 1} diff: ${diffSegments.length} segments`)

    // Create a wrapper tspan for this line (positioned at AT location)
    const lineTspan = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
    lineTspan.setAttribute('x', atLine.x)
    lineTspan.setAttribute('y', atLine.y)

    // Add data attributes to match AT structure
    lineTspan.setAttribute('data-class', 'text')
    addClass(lineTspan, 'text')

    // Create segments with animations
    diffSegments.forEach((segment, index) => {
      const segmentTspan = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      segmentTspan.textContent = segment.text
      segmentTspan.setAttribute('font-size', '405px')

      if (segment.type === 'common') {
        // Common text: visible throughout, opacity 1
        setAnimation({
          element: segmentTspan,
          states: {
            finding: { type: 'opacity', val: '1' },
            normalization: { type: 'opacity', val: '1' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'opacity', val: '1' },
            supplements: { type: 'opacity', val: '1' },
            interventions: { type: 'opacity', val: '1' }
          }
        })
      } else if (segment.type === 'delete') {
        // Deleted text: visible in finding/normalization, fade out, then hide
        setAnimation({
          element: segmentTspan,
          states: {
            finding: { type: 'opacity', val: '1' },
            normalization: { type: 'opacity', val: '1' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'opacity', val: '0' },
            supplements: { type: 'opacity', val: '0' },
            interventions: { type: 'opacity', val: '0' }
          }
        })
        setAnimation({
          element: segmentTspan,
          states: {
            finding: { type: 'display', val: 'inline' },
            normalization: { type: 'display', val: 'inline' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'display', val: 'none' },
            supplements: { type: 'display', val: 'none' },
            interventions: { type: 'display', val: 'none' }
          }
        })
      } else if (segment.type === 'insert') {
        // Inserted text: hidden in finding/normalization, fade in at supplements
        addClass(segmentTspan, 'supplied')
        setAnimation({
          element: segmentTspan,
          states: {
            finding: { type: 'opacity', val: '0' },
            normalization: { type: 'opacity', val: '0' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'opacity', val: '1' },
            supplements: { type: 'opacity', val: '1' },
            interventions: { type: 'opacity', val: '1' }
          }
        })
        setAnimation({
          element: segmentTspan,
          states: {
            finding: { type: 'display', val: 'none' },
            normalization: { type: 'display', val: 'none' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'display', val: 'inline' },
            supplements: { type: 'display', val: 'inline' },
            interventions: { type: 'display', val: 'inline' }
          }
        })
      }

      lineTspan.appendChild(segmentTspan)
    })

    atTextElement.appendChild(lineTspan)

    // Add line break marker if not the last line
    if (i < atLines.length - 1) {
      const lbTspan = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      lbTspan.setAttribute('data-class', 'lb')
      addClass(lbTspan, 'lb')
      atTextElement.appendChild(lbTspan)
    }
  }

  // Animate the position of the entire dir group
  if (translateX !== 0 || translateY !== 0) {
    setAnimation({
      element: atDirGroup,
      states: {
        finding: { type: 'translate', val: `${translateX} ${translateY}` },
        normalization: { type: 'translate', val: `${translateX} ${translateY}` },
        // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
        regulation: { type: 'translate', val: '0 0' },
        supplements: { type: 'translate', val: '0 0' },
        interventions: { type: 'translate', val: '0 0' }
      }
    })
  }
}

/**
 * Animate a multi-correspondence dir element where multiple DT dirs map to a single AT dir.
 * Each word segment animates independently to its corresponding DT position.
 * EXAMPLE: AT has "8tel auch 6te" (single dir), DT has three separate dirs: "8tel", "auch", "6te"
 * APPROACH:
 * 1. Split the AT text into segments matching each DT text boundary
 * 2. Compute text diff for each segment individually (allows for variations like "8tel" vs "16tel")
 * 3. Wrap each segment (and spaces between them) in its own <g> element
 * 4. Apply independent translate animations to each <g> based on corresponding DT position
 * 5. Calculate sequential x-offsets for proper AT positioning (since font is proportional)
 * POSITIONING CHALLENGE:
 * - In finding/normalization states: Each segment translates to its DT position independently
 * - In regulation/supplements/interventions: Segments converge to AT, forming continuous text
 * - Problem: Font is proportional (not monospaced), so character widths vary significantly
 * - Solution: Use average character width (~162 units for 405px font) with extra spacing (~12%)
 * This creates slightly uneven gaps but ensures readability without complex width calculations
 * - Character width formula: fontSize * 0.40 ≈ 162 units/char
 * (Based on measured bounding box: 2020 width / 14 chars ≈ 144 units, plus 12% padding)
 * SVG STRUCTURE:
 * Original AT: <text x="14691" y="279"><tspan>8tel auch 6te</tspan></text>
 * After transformation:
 * <g data-class="dir-segment"><text x="14691" y="279"><tspan>8tel</tspan></text><animateTransform translate="4251 72;...;0 0"/></g>
 * <g data-class="dir-segment"><text x="15339" y="279"><tspan> </tspan></text></g>
 * <g data-class="dir-segment"><text x="15501" y="279"><tspan>auch</tspan></text><animateTransform translate="6023 -704;...;0 0"/></g>
 * <g data-class="dir-segment"><text x="16149" y="279"><tspan> </tspan></text></g>
 * <g data-class="dir-segment"><text x="16311" y="279"><tspan>6te</tspan></text><animateTransform translate="9457 -1147;...;0 0"/></g>
 * Each x-position is calculated cumulatively: previous x + (segment length × charWidth)
 * IMPORTANT: Transform animations only work on <g> elements, not <tspan> elements in SVG.
 * This is why we wrap each segment in a group and apply the animateTransform to the group.
 *
 * @param {Element} atDirGroup - The AT dir group element containing the text to animate
 * @param {Array} dtDirData - Array of DT dir data objects, each with {lines: [{text, x, y}]}
 * @param {Object} atLine - The AT line object with {text, x, y}
 * @param {Function} getNewPos - Function to calculate transformed position: getNewPos(atPos, dtPos)
 * @param {Function} setAnimation - Function to set animation state on elements
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger object for debugging
 * @param {string} atId - The AT dir element ID (used for animation IDs)
 * @returns {void} No return value.
 */
function animateMultiCorrespondence (atDirGroup, dtDirData, atLine, getNewPos, setAnimation, logger, atId) {
  const atTextElement = atDirGroup.querySelector('text')
  if (!atTextElement) return

  // Clear existing AT text content - we'll rebuild it with separate groups
  atTextElement.innerHTML = ''
  atTextElement.setAttribute('font-size', '0px')
  atTextElement.setAttribute('x', atLine.x)
  atTextElement.setAttribute('y', atLine.y)

  // STRATEGY: Split the AT text into segments based on DT text boundaries
  // Each segment will get its own <g> wrapper with independent position animation
  const atText = atLine.text
  let atOffset = 0
  const segments = []

  dtDirData.forEach((dtData, dtIndex) => {
    const dtText = dtData.lines[0].text
    const dtPos = { x: dtData.lines[0].x, y: dtData.lines[0].y }

    logger.debug(`[liquifyMultiCorr] DT ${dtIndex}: "${dtText}" at (${dtPos.x}, ${dtPos.y})`)

    // Try to find this DT text in the remaining AT text
    const remainingAt = atText.substring(atOffset)

    // Compute diff between DT text and corresponding portion of AT text
    // For simplicity, assume the AT text contains the DT texts in order
    let atSegmentText = ''

    if (remainingAt.startsWith(dtText)) {
      // Exact match
      atSegmentText = dtText
    } else {
      // Try to find closest match - for now, take as many characters as DT text
      // This is a simplification; ideally we'd do fuzzy matching
      atSegmentText = remainingAt.substring(0, Math.min(dtText.length, remainingAt.length))
    }

    const diffSegments = computeTextDiff(dtText, atSegmentText)
    logger.debug(`[liquifyMultiCorr]   Diff: "${dtText}" -> "${atSegmentText}" (${diffSegments.length} segments)`)

    segments.push({
      diffSegments,
      dtPos,
      dtIndex,
      atSegmentText
    })

    atOffset += atSegmentText.length

    // Skip spaces between words
    while (atOffset < atText.length && atText[atOffset] === ' ') {
      segments.push({
        diffSegments: [{ text: ' ', type: 'common' }],
        dtPos: null, // Space doesn't move
        dtIndex: -1,
        atSegmentText: ' '
      })
      atOffset++
    }
  })

  // Handle any remaining AT text (insertions)
  if (atOffset < atText.length) {
    const remainingText = atText.substring(atOffset)
    segments.push({
      diffSegments: [{ text: remainingText, type: 'insert' }],
      dtPos: null,
      dtIndex: -1,
      atSegmentText: remainingText
    })
  }

  // RENDERING MULTI-CORRESPONDENCE SEGMENTS AS ANIMATED GROUPS
  //
  // We need to wrap each word in a <g> element because SVG doesn't support
  // transform animations on <tspan> elements (only on containers like <g>).
  //
  // Each segment gets its own <g> with:
  // 1. A <text> element positioned at the correct x-offset for sequential rendering in AT
  // 2. An <animateTransform> that moves the entire group to its DT position in finding/normalization

  // Remove the original text element and replace with groups for each segment
  atDirGroup.removeChild(atTextElement)

  // CHARACTER WIDTH CALCULATION FOR SEQUENTIAL POSITIONING
  //
  // Challenge: We need to position segments sequentially in the AT state to form continuous text,
  // but we can't easily calculate the actual rendered width of each character.
  //
  // Approach: Use average character width with extra spacing
  // - Measured from Verovio: font-size 405px renders "8tel auch 6te" (14 chars) with width 2020
  // - Average: 2020 / 14 = 144.3 units per character
  // - We use 162 units (405 * 0.40) to add ~12% extra spacing
  //
  // Why extra spacing?
  // - Font is proportional (not monospaced): 'w' is wider than 'i', 't' wider than 'l', etc.
  // - Using average width creates uneven gaps (some too narrow, some too wide)
  // - Extra spacing ensures readability even when character widths vary
  // - Trade-off: Some gaps will be slightly larger than ideal
  //
  // Future optimization: Could calculate actual rendered widths using browser/DOM APIs
  // or extract from Verovio's bounding box data per segment if available.
  const fontSize = 405
  const charWidth = fontSize * 0.40 // ~162 units per character (144.3 base + 12% padding)

  // CREATE ANIMATED GROUPS FOR EACH SEGMENT
  //
  // Each segment (word or space) gets wrapped in a <g> element with:
  // - Sequential x-position in AT (cumulativeXOffset tracks this)
  // - Text content with opacity/display animations for text diff
  // - Transform animation to move to DT position (if segment has DT correspondence)
  let cumulativeXOffset = 0 // Cumulative x-offset for sequential rendering in AT state

  segments.forEach((seg, segIndex) => {
    const { diffSegments, dtPos, dtIndex } = seg

    // Calculate position animation for this segment
    let translateX = 0
    let translateY = 0
    if (dtPos) {
      const newPos = getNewPos({ x: atLine.x, y: atLine.y }, dtPos)
      translateX = (newPos?.x || 0) - atLine.x
      translateY = (newPos?.y || 0) - atLine.y
      logger.debug(`[liquifyMultiCorr] Segment group ${segIndex} (DT ${dtIndex}): translate (${translateX}, ${translateY}), xOffset=${cumulativeXOffset}`)
    }

    // Create a group for this segment
    const segmentGroup = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
    segmentGroup.setAttribute('data-class', 'dir-segment')
    addClass(segmentGroup, 'dir-segment')

    // Create text element for this segment, offset by cumulative width
    const segText = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text')
    segText.setAttribute('x', atLine.x + cumulativeXOffset)
    segText.setAttribute('y', atLine.y)
    segText.setAttribute('font-size', '0px')

    const segTspan = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
    segTspan.setAttribute('data-class', 'text')
    addClass(segTspan, 'text')

    // For each diff segment within this DT segment
    diffSegments.forEach((diffSeg, diffIndex) => {
      const textTspan = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      textTspan.textContent = diffSeg.text
      textTspan.setAttribute('font-size', '405px')

      if (diffSeg.type === 'common') {
        // Common text: visible throughout
        setAnimation({
          element: textTspan,
          states: {
            finding: { type: 'opacity', val: '1' },
            normalization: { type: 'opacity', val: '1' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'opacity', val: '1' },
            supplements: { type: 'opacity', val: '1' },
            interventions: { type: 'opacity', val: '1' }
          }
        })
      } else if (diffSeg.type === 'delete') {
        // Deleted text: visible in finding/normalization, then fade out
        setAnimation({
          element: textTspan,
          states: {
            finding: { type: 'opacity', val: '1' },
            normalization: { type: 'opacity', val: '1' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'opacity', val: '0' },
            supplements: { type: 'opacity', val: '0' },
            interventions: { type: 'opacity', val: '0' }
          }
        })
        setAnimation({
          element: textTspan,
          states: {
            finding: { type: 'display', val: 'inline' },
            normalization: { type: 'display', val: 'inline' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'display', val: 'none' },
            supplements: { type: 'display', val: 'none' },
            interventions: { type: 'display', val: 'none' }
          }
        })
      } else if (diffSeg.type === 'insert') {
        // Inserted text: hidden in finding/normalization, fade in at supplements
        addClass(textTspan, 'supplied')
        setAnimation({
          element: textTspan,
          states: {
            finding: { type: 'opacity', val: '0' },
            normalization: { type: 'opacity', val: '0' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'opacity', val: '1' },
            supplements: { type: 'opacity', val: '1' },
            interventions: { type: 'opacity', val: '1' }
          }
        })
        setAnimation({
          element: textTspan,
          states: {
            finding: { type: 'display', val: 'none' },
            normalization: { type: 'display', val: 'none' },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'display', val: 'inline' },
            supplements: { type: 'display', val: 'inline' },
            interventions: { type: 'display', val: 'inline' }
          }
        })
      }

      segTspan.appendChild(textTspan)
    })

    segText.appendChild(segTspan)
    segmentGroup.appendChild(segText)

    // Animate the group position (this works on <g> elements)
    if (dtPos && (translateX !== 0 || translateY !== 0)) {
      setAnimation({
        element: segmentGroup,
        states: {
          finding: { type: 'translate', val: `${translateX} ${translateY}` },
          normalization: { type: 'translate', val: `${translateX} ${translateY}` },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'translate', val: '0 0' },
          supplements: { type: 'translate', val: '0 0' },
          interventions: { type: 'translate', val: '0 0' }
        }
      })
    }

    atDirGroup.appendChild(segmentGroup)

    // UPDATE CUMULATIVE OFFSET FOR NEXT SEGMENT
    //
    // Calculate the width of this segment based on its text content length
    // and add it to the cumulative offset so the next segment is positioned correctly.
    //
    // Example: "8tel" (4 chars) = 4 × 162 = 648 units
    // Next segment starts at: previousX + 648
    //
    // Note: This uses average character width, so actual rendered widths may vary
    // due to proportional font. The extra spacing (12%) helps compensate.
    const segmentText = diffSegments.map(ds => ds.text).join('')
    const segmentWidth = segmentText.length * charWidth
    cumulativeXOffset += segmentWidth
  })
}

/**
 * Animate dir with full text diff (when DT and AT have different line counts)
 *
 * @param {string} atDirGroup - String input used by this function.
 * @param {string} dtText - String input used by this function.
 * @param {string} atText - String input used by this function.
 * @param {{x: number, y: number}} dtPos - Input object used by this function.
 * @param {{x: number, y: number}} atPos - Input object used by this function.
 * @param {Function} getNewPos - Callback function invoked by this operation.
 * @param {Function} setAnimation - Animation descriptor writer for phase transitions.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance used for diagnostic output.
 * @param {string} atId - Identifier for the target element.
 * @returns {void} No return value.
 */
function animateFullText (atDirGroup, dtText, atText, dtPos, atPos, getNewPos, setAnimation, logger, atId) {
  const atTextElement = atDirGroup.querySelector('text')
  if (!atTextElement) return

  logger.debug(`[liquifyDirs] Full text: "${dtText}" -> "${atText}"`)

  // Compute text diff
  const diffSegments = computeTextDiff(dtText, atText)
  logger.debug(`[liquifyDirs] Full diff: ${diffSegments.length} segments`)

  // Clear existing AT text content
  atTextElement.innerHTML = ''
  atTextElement.setAttribute('font-size', '0px')
  atTextElement.setAttribute('x', atPos.x)
  atTextElement.setAttribute('y', atPos.y)

  // Create wrapper tspan
  const wrapperTspan = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
  wrapperTspan.setAttribute('data-class', 'text')
  addClass(wrapperTspan, 'text')

  // Create segments with animations
  diffSegments.forEach((segment, index) => {
    const segmentTspan = atTextElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
    segmentTspan.textContent = segment.text
    segmentTspan.setAttribute('font-size', '405px')

    if (segment.type === 'common') {
      setAnimation({
        element: segmentTspan,
        states: {
          finding: { type: 'opacity', val: '1' },
          normalization: { type: 'opacity', val: '1' },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'opacity', val: '1' },
          supplements: { type: 'opacity', val: '1' },
          interventions: { type: 'opacity', val: '1' }
        }
      })
    } else if (segment.type === 'delete') {
      setAnimation({
        element: segmentTspan,
        states: {
          finding: { type: 'opacity', val: '1' },
          normalization: { type: 'opacity', val: '1' },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'opacity', val: '0' },
          supplements: { type: 'opacity', val: '0' },
          interventions: { type: 'opacity', val: '0' }
        }
      })
      setAnimation({
        element: segmentTspan,
        states: {
          finding: { type: 'display', val: 'inline' },
          normalization: { type: 'display', val: 'inline' },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'display', val: 'none' },
          supplements: { type: 'display', val: 'none' },
          interventions: { type: 'display', val: 'none' }
        }
      })
    } else if (segment.type === 'insert') {
      addClass(segmentTspan, 'supplied')
      setAnimation({
        element: segmentTspan,
        states: {
          finding: { type: 'opacity', val: '0' },
          normalization: { type: 'opacity', val: '0' },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'opacity', val: '1' },
          supplements: { type: 'opacity', val: '1' },
          interventions: { type: 'opacity', val: '1' }
        }
      })
      setAnimation({
        element: segmentTspan,
        states: {
          finding: { type: 'display', val: 'none' },
          normalization: { type: 'display', val: 'none' },
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'display', val: 'inline' },
          supplements: { type: 'display', val: 'inline' },
          interventions: { type: 'display', val: 'inline' }
        }
      })
    }

    wrapperTspan.appendChild(segmentTspan)
  })

  atTextElement.appendChild(wrapperTspan)

  // Animate position of entire text element
  const newPos = getNewPos({ x: atPos.x, y: atPos.y }, { x: dtPos.x, y: dtPos.y })
  const diffX = (newPos?.x || 0) - atPos.x
  const diffY = (newPos?.y || 0) - atPos.y

  logger.debug(`[liquifyDirs] Position: DT (${dtPos.x},${dtPos.y}) -> AT (${atPos.x},${atPos.y}), diff (${diffX},${diffY})`)

  if (diffX !== 0 || diffY !== 0) {
    setAnimation({
      element: atDirGroup,
      states: {
        finding: { type: 'translate', val: `${diffX} ${diffY}` },
        normalization: { type: 'translate', val: `${diffX} ${diffY}` },
        // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
        regulation: { type: 'translate', val: '0 0' },
        supplements: { type: 'translate', val: '0 0' },
        interventions: { type: 'translate', val: '0 0' }
      }
    })
  }
}

/**
 * Extract text lines from AT text element.
 * AT structure: <text><tspan data-class="text">...</tspan><tspan data-class="lb"/><tspan data-class="text">...</tspan></text>
 *
 * @param {SVGTextElement} textElement - The AT text element
 * @returns {Array<{text: string, x: number, y: number} >} Array of line objects
 */
function extractAtTextLines (textElement) {
  const lines = []
  const tspans = textElement.querySelectorAll('tspan[data-class="text"]')

  tspans.forEach(tspan => {
    // Get the nested tspan with actual text
    const textTspan = tspan.querySelector('tspan')
    const text = textTspan ? textTspan.textContent.trim() : tspan.textContent.trim()

    // Get position from this tspan or parent text element
    const x = parseFloat(tspan.getAttribute('x') || textElement.getAttribute('x') || '0')
    const y = parseFloat(tspan.getAttribute('y') || textElement.getAttribute('y') || '0')

    lines.push({ text, x, y })
  })

  return lines
}

/**
 * Extract text lines from DT text element.
 * DT structure: <text><tspan>...</tspan><tspan x="..." dy="...">...</tspan></text>
 *
 * @param {SVGTextElement} textElement - The DT text element
 * @returns {Array<{text: string, x: number, y: number} >} Array of line objects
 */
function extractDtTextLines (textElement) {
  const lines = []
  const tspans = Array.from(textElement.querySelectorAll('tspan'))

  let currentY = parseFloat(textElement.getAttribute('y') || '0')
  const baseX = parseFloat(textElement.getAttribute('x') || '0')

  tspans.forEach(tspan => {
    const text = tspan.textContent.trim()
    const x = parseFloat(tspan.getAttribute('x') || baseX)
    const dy = parseFloat(tspan.getAttribute('dy') || '0')

    currentY += dy
    lines.push({ text, x, y: currentY })
  })

  return lines
}
