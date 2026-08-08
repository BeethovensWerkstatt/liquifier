import { queryDirectChildren, removeElement } from '../utils/dom.js'

/**
 * Builds an AT measure-to-reading-order-block map.
 *
 * @param {Document} atMeiDom - Annotated transcript MEI DOM.
 * @returns {Map<string, number>} Mapping from AT measure IDs to block indices.
 */
function buildAtMeasureBlockMap (atMeiDom) {
  const map = new Map()
  if (!atMeiDom) return map

  let blockIndex = 0
  let sawMeasure = false
  let startNewBlock = false

  atMeiDom.querySelectorAll('section').forEach(section => {
    Array.from(section.querySelectorAll('sb, measure')).forEach(node => {
      if (node.localName === 'sb') {
        startNewBlock = sawMeasure
        return
      }

      if (node.localName !== 'measure') return

      if (startNewBlock) {
        blockIndex += 1
        startNewBlock = false
      }

      const measureId = node.getAttribute('xml:id')
      if (measureId) map.set(measureId, blockIndex)
      sawMeasure = true
    })
  })

  return map
}

/**
 * Builds an AT block-to-system-beginning map.
 *
 * @param {Document} atMeiDom - Annotated transcript MEI DOM.
 * @returns {Map<number, string>} Mapping from block indices to AT sb IDs.
 */
function buildAtBlockSbMap (atMeiDom) {
  const blockMap = buildAtMeasureBlockMap(atMeiDom)
  const sbByBlock = new Map()
  if (!atMeiDom || blockMap.size === 0) return sbByBlock

  atMeiDom.querySelectorAll('section').forEach(section => {
    let currentSbId = null

    Array.from(section.querySelectorAll('sb, measure')).forEach(node => {
      if (node.localName === 'sb') {
        currentSbId = node.getAttribute('xml:id') || null
        return
      }

      const blockIndex = blockMap.get(node.getAttribute('xml:id'))
      if (currentSbId && Number.isFinite(blockIndex) && !sbByBlock.has(blockIndex)) {
        sbByBlock.set(blockIndex, currentSbId)
      }
    })
  })

  return sbByBlock
}

/**
 * Replaces measure-owned staff lines with generated rastrums per reading-order block.
 *
 * @param {SVGElement} svg - Annotated transcript SVG.
 * @param {Document} atMeiDom - Annotated transcript MEI DOM.
 * @param {Map<string, number>} [measureBlockMap] - Precomputed AT measure-to-block map.
 * @returns {void} No return value.
 */
export function adjustAtStaffLines (svg, atMeiDom, measureBlockMap = buildAtMeasureBlockMap(atMeiDom)) {
  const blockToAtSbId = buildAtBlockSbMap(atMeiDom)

  svg.querySelectorAll('g.system:not(.bounding-box)').forEach(system => {
    const measures = Array.from(system.querySelectorAll('g.measure:not(.bounding-box)'))
    if (measures.length === 0) return

    const blockToMeasures = new Map()
    measures.forEach((measure, index) => {
      const measureId = measure.getAttribute('data-id')
      const blockIndex = measureBlockMap.has(measureId) ? measureBlockMap.get(measureId) : index
      if (!blockToMeasures.has(blockIndex)) blockToMeasures.set(blockIndex, [])
      blockToMeasures.get(blockIndex).push(measure)
    })

    queryDirectChildren(system, 'g.bw-system-rastrum').forEach(removeElement)

    const document = system.ownerDocument || system
    const insertionAnchor = system.firstChild
    Array.from(blockToMeasures.entries()).sort((first, second) => first[0] - second[0]).forEach(([blockIndex, blockMeasures]) => {
      let left = Infinity
      let right = -Infinity

      blockMeasures.forEach(measure => {
        measure.querySelectorAll('g.staff:not(.bounding-box) > path').forEach(path => {
          const match = path.getAttribute('d').match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
          if (!match) return
          left = Math.min(left, Number.parseFloat(match[1]))
          right = Math.max(right, Number.parseFloat(match[3]))
        })
      })

      if (!Number.isFinite(left) || !Number.isFinite(right)) return

      const templateLines = Array.from(blockMeasures[0].querySelectorAll('g.staff:not(.bounding-box) > path'))
      const systemRastrum = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      systemRastrum.setAttribute('class', 'bw-system-rastrum')
      systemRastrum.setAttribute('data-bw-block', String(blockIndex))
      const atSbId = blockToAtSbId.get(blockIndex)
      if (atSbId) systemRastrum.setAttribute('data-system-id', atSbId)

      templateLines.forEach((template, lineIndex) => {
        const match = template.getAttribute('d').match(/M\s*([\d.-]+)\s+([\d.-]+)\s+L\s*([\d.-]+)\s+([\d.-]+)/)
        if (!match) return

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        const strokeWidth = template.getAttribute('stroke-width')
        const stroke = template.getAttribute('stroke')
        line.setAttribute('d', `M${left} ${match[2]} L${right} ${match[2]}`)
        if (strokeWidth) line.setAttribute('stroke-width', strokeWidth)
        if (stroke) line.setAttribute('stroke', stroke)
        line.setAttribute('class', 'rastrum')
        line.setAttribute('data-bw-block', String(blockIndex))
        line.setAttribute('data-bw-line-index', String(lineIndex))
        systemRastrum.appendChild(line)
      })

      if (insertionAnchor) system.insertBefore(systemRastrum, insertionAnchor)
      else system.appendChild(systemRastrum)
    })

    measures.forEach(measure => {
      measure.querySelectorAll('g.staff:not(.bounding-box) > path').forEach(removeElement)
    })
  })
}

/**
 * Resolve AT blocks that belong to the currently rendered DT page context,
 * including strict block-to-DT-system references from AT sb@corresp.
 *
 * @param {Document} atDom - Annotated transcript MEI DOM.
 * @param {Document} dtDom - Diplomatic transcript MEI DOM.
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} logger - Logger instance.
 * @returns {{matchedStaffLineBlocks: Set<number>|null, blockToDtSystemId: Map<number, string>|null, errorMessage: string|null}} Resolution context.
 */
export function resolveMatchedStaffLineContextForCurrentDt (atDom, dtDom, logger) {
  const dtPageReferenceSet = collectDtPageReferenceSet(dtDom)
  if (dtPageReferenceSet.size === 0) {
    const errorMessage = '[renderFluidTranscriptsSvg] No pb@target or pb@corresp in DT; cannot resolve strict staff-line block mapping.'
    logger.warn(errorMessage)
    return { matchedStaffLineBlocks: null, blockToDtSystemId: null, errorMessage }
  }

  const pageByBlock = buildAtBlockPageReferenceMap(atDom)
  if (pageByBlock.size === 0) {
    const errorMessage = '[renderFluidTranscriptsSvg] No AT block page mapping from pb attributes; cannot resolve strict staff-line block mapping.'
    logger.warn(errorMessage)
    return { matchedStaffLineBlocks: null, blockToDtSystemId: null, errorMessage }
  }

  const matchedStaffLineBlocks = new Set()
  pageByBlock.forEach((pageReference, blockIndex) => {
    if (dtPageReferenceSet.has(pageReference)) matchedStaffLineBlocks.add(blockIndex)
  })

  if (matchedStaffLineBlocks.size === 0) {
    const errorMessage = '[renderFluidTranscriptsSvg] AT block mapping produced no DT page matches; cannot resolve strict staff-line block mapping.'
    logger.warn(errorMessage)
    return { matchedStaffLineBlocks: null, blockToDtSystemId: null, errorMessage }
  }

  const systemByBlock = buildAtBlockDtSystemMap(atDom)
  const blockToDtSystemId = new Map()
  const missingSystemBlocks = []

  Array.from(matchedStaffLineBlocks).sort((firstBlock, secondBlock) => firstBlock - secondBlock).forEach(blockIndex => {
    const systemId = systemByBlock.get(blockIndex)
    if (!systemId) {
      missingSystemBlocks.push(blockIndex)
      return
    }
    blockToDtSystemId.set(blockIndex, systemId)
  })

  if (missingSystemBlocks.length > 0) {
    const errorMessage = `[renderFluidTranscriptsSvg] Missing AT sb@corresp DT system mapping for matched blocks: ${missingSystemBlocks.join(', ')}.`
    logger.warn(errorMessage)
    return { matchedStaffLineBlocks: null, blockToDtSystemId: null, errorMessage }
  }

  return { matchedStaffLineBlocks, blockToDtSystemId, errorMessage: null }
}

/**
 * Builds an AT block-to-DT-system map from sb corresp/target attributes.
 *
 * @param {Document} atDom - Annotated transcript MEI DOM.
 * @returns {Map<number, string>} Mapping from AT block indices to DT system IDs.
 */
function buildAtBlockDtSystemMap (atDom) {
  const blockMap = buildAtMeasureBlockMap(atDom)
  const systemByBlock = new Map()
  if (!atDom || blockMap.size === 0) return systemByBlock

  atDom.querySelectorAll('section').forEach(section => {
    let currentSystemId = null

    Array.from(section.querySelectorAll('sb, measure')).forEach(node => {
      if (node.localName === 'sb') {
        currentSystemId = getFirstDiplomaticCorrespId(node.getAttribute('corresp')) || getFirstDiplomaticCorrespId(node.getAttribute('target'))
        return
      }

      if (node.localName !== 'measure') return

      const blockIndex = blockMap.get(node.getAttribute('xml:id'))
      if (currentSystemId && Number.isFinite(blockIndex) && !systemByBlock.has(blockIndex)) {
        systemByBlock.set(blockIndex, currentSystemId)
      }
    })
  })

  return systemByBlock
}

/**
 * Builds an AT block-to-page-reference map using section traversal order.
 *
 * @param {Document} atDom - Annotated transcript MEI DOM.
 * @returns {Map<number, string>} Mapping from AT block indices to normalized page references.
 */
function buildAtBlockPageReferenceMap (atDom) {
  const blockMap = buildAtMeasureBlockMap(atDom)
  const pageByBlock = new Map()
  if (!atDom || blockMap.size === 0) return pageByBlock

  atDom.querySelectorAll('section').forEach(section => {
    let currentPageReference = null

    Array.from(section.querySelectorAll('pb, measure')).forEach(node => {
      if (node.localName === 'pb') {
        currentPageReference = normalizePbReference(node.getAttribute('corresp')) || normalizePbReference(node.getAttribute('target'))
        return
      }

      if (node.localName !== 'measure' || !currentPageReference) return

      const blockIndex = blockMap.get(node.getAttribute('xml:id'))
      if (Number.isFinite(blockIndex)) pageByBlock.set(blockIndex, currentPageReference)
    })
  })

  return pageByBlock
}

/**
 * Collects normalized DT page references from pb attributes.
 *
 * @param {Document} dom - MEI DOM to inspect.
 * @returns {Set<string>} Normalized DT page references.
 */
function collectDtPageReferenceSet (dom) {
  const values = new Set()
  if (!dom) return values

  dom.querySelectorAll('pb[target], pb[corresp]').forEach(pb => {
    const pageReference = normalizePbReference(pb.getAttribute('target')) || normalizePbReference(pb.getAttribute('corresp'))
    if (pageReference) values.add(pageReference)
  })

  return values
}

/**
 * Normalizes a page reference value from pb attributes.
 *
 * @param {string} [value=''] - Raw pb attribute value.
 * @returns {string|null} Normalized page reference, or null when empty.
 */
function normalizePbReference (value = '') {
  const token = String(value).trim().split(/\s+/)[0]
  if (!token) return null

  const hashIndex = token.indexOf('#')
  if (hashIndex >= 0 && hashIndex < token.length - 1) return token.slice(hashIndex + 1).trim()
  return token
}

/**
 * Returns the first diplomatic correspondence ID from an attribute value.
 *
 * @param {string} [value=''] - Raw corresp or target attribute value.
 * @returns {string|null} First diplomatic ID or null.
 */
function getFirstDiplomaticCorrespId (value = '') {
  return String(value)
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
    .filter(token => token.includes('#'))
    .filter(token => {
      const fileReference = token.split('#')[0]
      return fileReference === '' || fileReference.includes('/diplomaticTranscripts/') || fileReference.endsWith('_dt.xml')
    })
    .map(token => token.slice(token.indexOf('#') + 1).trim())
    .find(Boolean) || null
}
