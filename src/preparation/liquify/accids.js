import { hasClass, queryDirectChild } from '../../utils/dom.js'

/**
 * Animate accidentals between AT and DT transcriptions
 * For each accidental in the AT (fluid transcription):
 * - Animates the accidental position based on corresponding DT accidental position
 * - Handles accidentals without DT correspondence by fading them out
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Animation helper bundle
 * @param {Function} tools.getNewPos - Converts DT coordinates into FT coordinate space
 * @param {Map<string, string[]>} tools.correspMappings - AT element id to DT ids mapping
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer
 * @param {Object} tools.logger - Logger instance
 * @returns {string} Resulting string.
 */
export const liquifyAccids = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { getNewPos, correspMappings, setAnimation, logger } = tools

  // TODO: Implement keyAccids!

  const accidentals = ftSvg.querySelectorAll('.accid:not(.bounding-box), .keyAccid:not(.bounding-box)')
  accidentals.forEach(accid => {
    const atId = accid.getAttribute('data-id')
    const dtIds = correspMappings.get(atId)

    if (!dtIds || dtIds.length === 0) {
      setAnimation({
        element: accid,
        states: {
          finding: null,
          normalization: null,
          // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
          regulation: { type: 'translate', val: '0 0' },
          supplements: { type: 'translate', val: '0 0' },
          interventions: { type: 'translate', val: '0 0' }
        }
      })
      return
    }

    // Find the parent note's or chord's animation values (if accid is inside a note/chord)
    // We need to account for the note/chord's movement when calculating accid animation
    // Key signature accidentals don't have parent notes, so skip for them
    const isKeyAccid = hasClass(accid, 'keyAccid')
    let noteAnimationDiff = { x: 0, y: 0 }
    let parentNote = null
    let parentChord = null

    if (!isKeyAccid) {
      let currentAncestor = accid.parentNode
      while (currentAncestor?.nodeType === 1) {
        if (!parentNote && currentAncestor.localName === 'g' && hasClass(currentAncestor, 'note') && !hasClass(currentAncestor, 'bounding-box')) {
          parentNote = currentAncestor
        }

        if (!parentChord && currentAncestor.localName === 'g' && hasClass(currentAncestor, 'chord') && !hasClass(currentAncestor, 'bounding-box')) {
          parentChord = currentAncestor
        }

        if (parentNote && parentChord) break
        currentAncestor = currentAncestor.parentNode
      }

      const parentNoteId = parentNote?.getAttribute('data-id')
      const parentNoteDtIds = parentNoteId ? correspMappings.get(parentNoteId) : null
      const parentDtId = parentNoteDtIds?.[0]
      const parentDtNote = parentDtId ? dtSvg.querySelector(`g.note[data-id="${parentDtId}"]`) : null
      const parentAtHeadUse = parentNote?.querySelector('.notehead > use')
      const parentDtHeadUse = parentDtNote?.querySelector('.notehead > use')

      if (parentAtHeadUse && parentDtHeadUse) {
        const parentAtTransform = parentAtHeadUse.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
        const parentAtX = parentAtTransform ? parseFloat(parentAtTransform[1]) : parseFloat(parentAtHeadUse.getAttribute('x'))
        const parentAtY = parentAtTransform ? parseFloat(parentAtTransform[2]) : parseFloat(parentAtHeadUse.getAttribute('y'))
        const parentDtX = parseFloat(parentDtHeadUse.getAttribute('x'))
        const parentDtY = parseFloat(parentDtHeadUse.getAttribute('y'))

        if (Number.isFinite(parentAtX) && Number.isFinite(parentAtY) && Number.isFinite(parentDtX) && Number.isFinite(parentDtY)) {
          const parentNewPos = getNewPos({ x: parentAtX, y: parentAtY }, { x: parentDtX, y: parentDtY })
          noteAnimationDiff = {
            x: parentNewPos.x - parentAtX,
            y: parentNewPos.y - parentAtY
          }
          logger.debug(`[Accid] Parent note diff from geometry: (${noteAnimationDiff.x}, ${noteAnimationDiff.y})`)
        }
      }

      if (noteAnimationDiff.x === 0 && noteAnimationDiff.y === 0) {
        const parentAnimation =
          queryDirectChild(parentNote, 'animateTransform[type="translate"]') ||
          queryDirectChild(queryDirectChild(parentNote, 'g.notehead'), 'animateTransform[type="translate"]') ||
          queryDirectChild(parentChord, 'animateTransform[type="translate"]')

        if (parentAnimation) {
          const parentValues = parentAnimation.getAttribute('values')
          const parentMatch = parentValues?.match(/^\s*([-\d.]+)\s+([-\d.]+)/)
          if (parentMatch) {
            noteAnimationDiff = { x: parseFloat(parentMatch[1]), y: parseFloat(parentMatch[2]) }
            logger.debug(`[Accid] Parent animation diff: (${noteAnimationDiff.x}, ${noteAnimationDiff.y})`)
          }
        }
      }
    }

    // Create array to hold the original and cloned accidentals
    const accidElements = [accid]

    // If multiple dtIds, create clones for each additional one
    if (dtIds.length > 1) {
      const parent = accid.parentNode
      for (let i = 1; i < dtIds.length; i++) {
        const clone = accid.cloneNode(true)
        // Insert clone after the previous element
        parent.insertBefore(clone, accidElements[i - 1].nextSibling)
        accidElements.push(clone)
      }
    }

    // Now iterate dtIds with corresponding accid elements
    dtIds.forEach((dtId, index) => {
      const currentAccid = accidElements[index]
      const dtAccid = dtSvg.querySelector(`.accid[data-id="${dtId}"]`)
      if (!dtAccid) {
        setAnimation({
          element: currentAccid,
          states: {
            finding: null,
            normalization: null,
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'translate', val: '0 0' },
            supplements: { type: 'translate', val: '0 0' },
            interventions: { type: 'translate', val: '0 0' }
          }
        })
        return
      }

      const atUse = currentAccid.querySelector('use')
      const dtUse = dtAccid.querySelector('use')
      if (atUse && dtUse) {
        const atTransform = atUse.getAttribute('transform')?.match(/translate\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/)
        const atX = atTransform ? parseFloat(atTransform[1]) : parseFloat(atUse.getAttribute('x'))
        const atY = atTransform ? parseFloat(atTransform[2]) : parseFloat(atUse.getAttribute('y'))
        if (!Number.isFinite(atX) || !Number.isFinite(atY)) return

        // DT accidentals use x and y attributes on the use element
        const dtX = parseFloat(dtUse.getAttribute('x') || 0)
        const dtY = parseFloat(dtUse.getAttribute('y') || 0)

        // Transform DT position to AT coordinate system
        const newPos = getNewPos({ x: atX, y: atY }, { x: dtX, y: dtY })

        // Calculate the accidental's absolute movement
        const absDiffX = newPos.x - atX
        const absDiffY = newPos.y - atY

        // Subtract the parent note's movement to get relative accid movement
        const diffX = absDiffX - noteAnimationDiff.x
        const diffY = absDiffY - noteAnimationDiff.y

        logger.debug(`[Accid Animation ${index}] ${atId} -> ${dtId}`)
        logger.debug(`  AT pos: (${atX}, ${atY})`)
        logger.debug(`  DT pos: (${dtX}, ${dtY})`)
        logger.debug(`  newPos: (${newPos.x}, ${newPos.y})`)
        logger.debug(`  abs diff:  (${absDiffX}, ${absDiffY})`)
        logger.debug(`  note diff: (${noteAnimationDiff.x}, ${noteAnimationDiff.y})`)
        logger.debug(`  rel diff:  (${diffX}, ${diffY})`)

        // Apply relative animation to the parent accid group
        const atVal = '0 0'
        const dtVal = `${diffX} ${diffY}`
        setAnimation({
          element: currentAccid,
          states: {
            finding: { type: 'translate', val: dtVal },
            normalization: { type: 'translate', val: dtVal },
            // readingOrder: automatically derived from normalization in fluidTranscripts.js; omitted here intentionally
            regulation: { type: 'translate', val: atVal },
            supplements: { type: 'translate', val: atVal },
            interventions: { type: 'translate', val: atVal }
          }
        })
      }
    })
  })
}
