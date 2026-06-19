/**
 * Resolve AT blocks that belong to the currently rendered DT page context,
 * including strict block -> DT system id references from AT sb@corresp.
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

  const matchedBlocks = new Set()
  pageByBlock.forEach((pageReference, blockIndex) => {
    if (dtPageReferenceSet.has(pageReference)) {
      matchedBlocks.add(blockIndex)
    }
  })

  if (matchedBlocks.size === 0) {
    const errorMessage = '[renderFluidTranscriptsSvg] AT block mapping produced no DT page matches; cannot resolve strict staff-line block mapping.'
    logger.warn(errorMessage)
    return { matchedStaffLineBlocks: null, blockToDtSystemId: null, errorMessage }
  }

  const systemByBlock = buildAtBlockDtSystemMap(atDom)
  const blockToDtSystemId = new Map()
  const missingSystemBlocks = []

  Array.from(matchedBlocks).sort((a, b) => a - b).forEach(blockIndex => {
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

  return { matchedStaffLineBlocks: matchedBlocks, blockToDtSystemId, errorMessage: null }
}

/**
 * Build AT block -> DT system id mapping from sb corresp/target attributes.
 *
 * @param {Document} atDom - Annotated transcript MEI DOM.
 * @returns {Map<number, string>} Mapping from AT block index to DT system id.
 */
function buildAtBlockDtSystemMap (atDom) {
  const blockMap = buildReadingOrderBlockMap(atDom)
  const systemByBlock = new Map()
  if (!atDom || blockMap.size === 0) return systemByBlock

  const sections = atDom.querySelectorAll('section')
  sections.forEach(section => {
    let currentSystemId = null

    Array.from(section.querySelectorAll('sb, measure')).forEach(node => {
      if (node.localName === 'sb') {
        const systemId = getFirstDiplomaticCorrespId(node.getAttribute('corresp')) || getFirstDiplomaticCorrespId(node.getAttribute('target'))
        currentSystemId = systemId || null
        return
      }

      if (node.localName !== 'measure') return

      const measureId = node.getAttribute('xml:id')
      const blockIndex = blockMap.get(measureId)
      if (!Number.isFinite(blockIndex)) return

      if (currentSystemId && !systemByBlock.has(blockIndex)) {
        systemByBlock.set(blockIndex, currentSystemId)
      }
    })
  })

  return systemByBlock
}

/**
 * Build AT block -> page reference mapping using section traversal order.
 *
 * @param {Document} atDom - Annotated transcript MEI DOM.
 * @returns {Map<number, string>} Mapping from AT block index to normalized page reference.
 */
function buildAtBlockPageReferenceMap (atDom) {
  const blockMap = buildReadingOrderBlockMap(atDom)
  const pageByBlock = new Map()
  if (!atDom || blockMap.size === 0) return pageByBlock

  const sections = atDom.querySelectorAll('section')
  sections.forEach(section => {
    let currentPageReference = null

    Array.from(section.querySelectorAll('pb, measure')).forEach(node => {
      if (node.localName === 'pb') {
        const pageRef = normalizePbReference(node.getAttribute('corresp')) || normalizePbReference(node.getAttribute('target'))
        currentPageReference = pageRef || null
        return
      }

      if (node.localName !== 'measure') return
      if (!currentPageReference) return

      const measureId = node.getAttribute('xml:id')
      const blockIndex = blockMap.get(measureId)
      if (!Number.isFinite(blockIndex)) return

      pageByBlock.set(blockIndex, currentPageReference)
    })
  })

  return pageByBlock
}

/**
 * Collect DT page references from pb attributes.
 *
 * @param {Document} dom - MEI DOM to inspect.
 * @returns {Set<string>} Normalized DT page references.
 */
function collectDtPageReferenceSet (dom) {
  const values = new Set()
  if (!dom) return values

  dom.querySelectorAll('pb[target], pb[corresp]').forEach(pb => {
    const targetRef = normalizePbReference(pb.getAttribute('target'))
    const correspRef = normalizePbReference(pb.getAttribute('corresp'))
    const pageRef = targetRef || correspRef
    if (!pageRef) return
    values.add(pageRef)
  })

  return values
}

/**
 * Builds reading order block map.
 *
 * @param {Document} atDom - Annotated transcript DOM.
 * @returns {Map<string, number>} Measure id -> block index map.
 */
function buildReadingOrderBlockMap (atDom) {
  const measureBlockMap = new Map()
  if (!atDom) return measureBlockMap

  let blockIndex = 0
  let sawMeasure = false
  let startNewBlock = false

  const sections = atDom.querySelectorAll('section')
  sections.forEach(section => {
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
      if (measureId) {
        measureBlockMap.set(measureId, blockIndex)
      }
      sawMeasure = true
    })
  })

  return measureBlockMap
}

/**
 * Normalize a page reference value from pb attributes.
 *
 * @param {string} value - Raw pb attribute value.
 * @returns {string|null} Normalized page reference, or null when empty.
 */
function normalizePbReference (value = '') {
  const token = String(value).trim().split(/\s+/)[0]
  if (!token) return null

  const hashIndex = token.indexOf('#')
  if (hashIndex >= 0 && hashIndex < token.length - 1) {
    return token.slice(hashIndex + 1).trim()
  }

  return token
}

/**
 * Returns first diplomatic corresp id from the current data context.
 *
 * @param {string} value - String input used by this function.
 * @returns {string|null} First diplomatic id or null.
 */
function getFirstDiplomaticCorrespId (value = '') {
  const diplomaticIds = getDiplomaticCorrespIds(value)
  return diplomaticIds[0] || null
}

/**
 * Maps annotated diplomatic corresp ids data to diplomatic transcription output.
 *
 * @param {string} value - Raw corresp/target attribute value.
 * @returns {string[]} Diplomatic ids.
 */
function getDiplomaticCorrespIds (value = '') {
  if (!value) return []

  const ids = []
  const tokens = value.trim().split(/\s+/)
  tokens.forEach(token => {
    if (!token.includes('#')) return
    const [filePart, id] = token.split('#')
    if (!id) return
    const isDiplomaticRef = filePart.includes('/diplomaticTranscripts/') || filePart.endsWith('_dt.xml') || filePart === ''
    if (!isDiplomaticRef) return
    ids.push(id)
  })

  return ids
}
