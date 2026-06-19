import { readFileSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { computeApproxBBox } from '../utils/svgGeometry.js'

const XML_NS = 'http://www.w3.org/XML/1998/namespace'
const { DOMParser } = new JSDOM().window

/**
 * Normalizes id-like values used in cross-document references.
 *
 * @param {string|null} value - Potential id string.
 * @returns {string} Normalized id value.
 */
function normalizeId (value) {
  return String(value || '').trim().replace(/^#/, '')
}

/**
 * Reads xml:id from an element using multiple access paths.
 *
 * @param {Element} element - Element inspected by this function.
 * @returns {string} xml:id value when available.
 */
function getXmlId (element) {
  if (!element) return ''

  return normalizeId(
    element.getAttribute('xml:id') ||
    element.getAttributeNS(XML_NS, 'id') ||
    element.getAttribute('id')
  )
}

/**
 * Builds a lookup map for annot elements by normalized xml:id.
 *
 * @param {Document} atDom - Annotated transcript DOM.
 * @returns {Map<string, Element>} Lookup map keyed by xml:id.
 */
function buildAnnotByIdMap (atDom) {
  const byId = new Map()

  atDom.querySelectorAll('annot').forEach((annot) => {
    const id = getXmlId(annot)
    if (id && !byId.has(id)) {
      byId.set(id, annot)
    }
  })

  return byId
}

/**
 * Normalizes a file reference to its basename.
 *
 * @param {string|null} value - File reference value.
 * @returns {string} Basename-only representation.
 */
function normalizeFileBasename (value) {
  const normalized = String(value || '').trim().replace(/\\/g, '/')
  if (!normalized) return ''

  const parts = normalized.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * Parses one corresp token into optional file ref and target id.
 *
 * @param {string} token - One token from @corresp.
 * @returns {{fileRef: string, targetId: string}|null} Parsed token.
 */
function parseCorrespToken (token) {
  const normalized = String(token || '').trim()
  if (!normalized || !normalized.includes('#')) return null

  const hashIndex = normalized.indexOf('#')
  const fileRef = hashIndex > 0 ? normalized.slice(0, hashIndex).trim() : ''
  const targetId = normalizeId(normalized.slice(hashIndex + 1))
  if (!targetId) return null

  return { fileRef, targetId }
}

/**
 * Resolves DT system reference referenced by an AT sb element.
 *
 * @param {string} sbId - AT sb xml:id.
 * @param {Map<string, Element>} atSbById - AT sb lookup map.
 * @param {string} currentDtReference - Current DT path/reference.
 * @returns {{fileRef: string, targetId: string}|null} Resolved reference, null when unresolved.
 */
function resolveDtSystemRefFromSb (sbId, atSbById, currentDtReference) {
  const sb = atSbById.get(normalizeId(sbId))
  if (!sb) return null

  const corresp = String(sb.getAttribute('corresp') || '').trim()
  if (!corresp) return null

  const currentDtBasename = normalizeFileBasename(currentDtReference)
  let fallbackRef = null

  const tokens = corresp.split(/\s+/)
  for (const token of tokens) {
    const parsed = parseCorrespToken(token)
    if (!parsed) continue

    const { fileRef, targetId } = parsed
    const candidateRef = { fileRef, targetId }

    if (!fileRef) {
      return candidateRef
    }

    if (!fallbackRef) fallbackRef = candidateRef

    if (!currentDtBasename || normalizeFileBasename(fileRef) === currentDtBasename) {
      return candidateRef
    }
  }

  return fallbackRef
}

/**
 * Resolves an external DT reference to an absolute file path.
 *
 * @param {string} fileRef - Referenced DT file path from corresp.
 * @param {string} currentDtReference - Current DT file path.
 * @returns {string} Absolute DT file path, empty when unresolved.
 */
function resolveReferencedDtPath (fileRef, currentDtReference) {
  const normalizedRef = String(fileRef || '').trim()
  if (!normalizedRef) return ''

  if (path.isAbsolute(normalizedRef)) {
    return path.normalize(normalizedRef)
  }

  const normalizedCurrent = String(currentDtReference || '').trim()
  const baseDir = normalizedCurrent ? path.dirname(normalizedCurrent) : process.cwd()
  return path.resolve(baseDir, normalizedRef)
}

/**
 * Resolves the DT DOM to use for a system reference, loading external DTs on demand.
 *
 * @param {{fileRef: string, targetId: string}|null} dtSystemRef - Resolved DT reference.
 * @param {Document} currentDtDom - DT DOM passed into addSystemLabelBlocks.
 * @param {string} currentDtReference - Current DT file path/reference.
 * @param {Map<string, Document|null>} dtDomCache - Cache of loaded DT DOMs.
 * @param {Function|null} onIssue - Optional callback for non-fatal issue reporting.
 * @returns {Document|null} DT DOM containing the target system, or null.
 */
function resolveDtDomForSystemRef (dtSystemRef, currentDtDom, currentDtReference, dtDomCache, onIssue = null) {
  if (!dtSystemRef || !dtSystemRef.fileRef) {
    return currentDtDom
  }

  const currentDtBasename = normalizeFileBasename(currentDtReference)
  if (currentDtBasename && normalizeFileBasename(dtSystemRef.fileRef) === currentDtBasename) {
    return currentDtDom
  }

  const dtPath = resolveReferencedDtPath(dtSystemRef.fileRef, currentDtReference)
  if (!dtPath) return null

  if (dtDomCache.has(dtPath)) {
    return dtDomCache.get(dtPath)
  }

  try {
    const xml = readFileSync(dtPath, { encoding: 'utf8' })
    const dom = new DOMParser().parseFromString(xml, 'text/xml')
    dtDomCache.set(dtPath, dom)
    return dom
  } catch (err) {
    if (typeof onIssue === 'function') {
      onIssue({
        code: 'external-dt-load-failed',
        fileRef: dtSystemRef.fileRef,
        resolvedPath: dtPath,
        reason: err instanceof Error ? err.message : String(err)
      })
    }
    dtDomCache.set(dtPath, null)
    return null
  }
}

/**
 * Builds a lookup map for arbitrary elements keyed by normalized xml:id.
 *
 * @param {Document|Element} root - Root node to search in.
 * @param {string} selector - CSS selector for matching elements.
 * @returns {Map<string, Element>} Lookup map keyed by xml:id.
 */
function buildElementByIdMap (root, selector) {
  const byId = new Map()

  root.querySelectorAll(selector).forEach((element) => {
    const id = getXmlId(element)
    if (id && !byId.has(id)) {
      byId.set(id, element)
    }
  })

  return byId
}

/**
 * Parses numeric attributes that may contain unit suffixes.
 *
 * @param {Element|null} element - Element carrying the attribute.
 * @param {string} attrName - Attribute name to parse.
 * @returns {number|null} Parsed numeric value or null.
 */
function parseNumericAttribute (element, attrName) {
  if (!element) return null

  const raw = String(element.getAttribute(attrName) || '').trim()
  if (!raw) return null

  const parsed = parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Reports whether a foliation reference attribute points to a surface id.
 *
 * @param {string|null} value - Raw attribute value.
 * @param {string} surfaceId - Surface id to match.
 * @returns {boolean} True when reference points to surface id.
 */
function hasSurfaceRef (value, surfaceId) {
  const targetId = normalizeId(surfaceId)
  if (!targetId) return false

  return String(value || '').trim().split(/\s+/).some((token) => {
    const trimmed = String(token || '').trim()
    if (!trimmed) return false

    if (trimmed.endsWith('#' + targetId)) return true
    return normalizeId(trimmed) === targetId
  })
}

/**
 * Returns reference attribute names for one foliation element.
 *
 * @param {Element} element - Foliation element.
 * @returns {string[]} Relevant reference attributes.
 */
function getFoliationSurfaceRefAttributes (element) {
  if (!element) return []

  if (element.localName === 'bifolium') {
    return ['outer.recto', 'inner.verso', 'inner.recto', 'outer.verso']
  }

  if (element.localName === 'folium' || element.localName === 'unknownFoliation') {
    return ['recto', 'verso']
  }

  return []
}

/**
 * Resolves width/height of a surface from context foliation description.
 *
 * @param {Document} contextDom - Context MEI document.
 * @param {string} surfaceId - Surface xml:id to resolve.
 * @returns {{width: number, height: number}|null} Dimensions when available.
 */
function resolveSurfaceDimensionsFromContext (contextDom, surfaceId) {
  const targetSurfaceId = normalizeId(surfaceId)
  if (!contextDom || !targetSurfaceId) return null

  const foliaDesc = contextDom.querySelector('foliaDesc')
  if (!foliaDesc) return null

  const foliationElement = Array.from(foliaDesc.querySelectorAll('bifolium, folium, unknownFoliation'))
    .find((element) => {
      const refAttrs = getFoliationSurfaceRefAttributes(element)
      return refAttrs.some(attrName => hasSurfaceRef(element.getAttribute(attrName), targetSurfaceId))
    })

  if (!foliationElement) return null

  const width = parseNumericAttribute(foliationElement, 'width')
  const height = parseNumericAttribute(foliationElement, 'height')
  if (!Number.isFinite(width) || !Number.isFinite(height) || height === 0) return null

  return { width, height }
}

/**
 * Builds a lookup map of source rastrum ids to derived geometry metadata.
 *
 * @param {Document} sourceDom - Source document containing rastrum elements.
 * @returns {Map<string, {pos: number, left: number, top: number, width: number, systemHeight: number, rotate: number}>} Rastrum metadata keyed by xml:id.
 */
function buildSourceRastrumMetaById (sourceDom) {
  const byId = new Map()

  sourceDom.querySelectorAll('rastrum').forEach((rastrum) => {
    const rastrumId = getXmlId(rastrum)
    if (!rastrumId || !rastrum.parentElement) return

    const siblingRastra = Array.from(rastrum.parentElement.children)
      .filter(child => child.localName === 'rastrum')

    const index = siblingRastra.findIndex(child => child === rastrum)
    if (index >= 0) {
      const left = parseNumericAttribute(rastrum, 'system.leftmar')
      const top = parseNumericAttribute(rastrum, 'system.topmar')
      const width = parseNumericAttribute(rastrum, 'width')
      const systemHeight = parseNumericAttribute(rastrum, 'system.height')
      const rotate = parseNumericAttribute(rastrum, 'rotate') || 0

      byId.set(rastrumId, {
        pos: index + 1,
        left,
        top,
        width,
        systemHeight,
        rotate
      })
    }
  })

  return byId
}

/**
 * Resolves a DT system element by xml:id, preferring bw:system when available.
 *
 * @param {Document} dtDom - Diplomatic transcript DOM.
 * @param {string} systemId - Target DT system id.
 * @returns {Element|null} Matched DT system element.
 */
function resolveDtSystemById (dtDom, systemId) {
  const targetId = normalizeId(systemId)
  if (!dtDom || !targetId) return null

  const allSystems = Array.from(dtDom.getElementsByTagName('*'))
    .filter((element) => {
      const localName = element.localName || String(element.tagName || '').split(':').pop()
      return localName === 'system' && getXmlId(element) === targetId
    })

  if (allSystems.length === 0) return null

  const bwSystem = allSystems.find(element => element.prefix === 'bw' || element.tagName.toLowerCase().startsWith('bw:'))
  return bwSystem || allSystems[0]
}

/**
 * Resolves human-readable staff labels for one DT system.
 *
 * @param {string} systemId - DT system identifier from data-system-id.
 * @param {Document} dtDom - Diplomatic transcript DOM.
 * @param {Map<string, {pos: number, left: number, top: number, width: number, systemHeight: number, rotate: number}>} rastrumMetaById - Source rastrum metadata map.
 * @returns {Array<{pos: number, left: number, top: number, width: number, systemHeight: number, rotate: number}>} Ordered unique staff metadata.
 */
function resolveSystemLabelsByDtSystem (systemId, dtDom, rastrumMetaById) {
  const system = resolveDtSystemById(dtDom, systemId)
  if (!system) return []

  const staffDefs = Array.from(system.getElementsByTagName('*'))
    .filter((child) => {
      const localName = child.localName || String(child.tagName || '').split(':').pop()
      return localName === 'staffDef'
    })

  const rastra = []
  staffDefs.forEach((staffDef) => {
    const decls = String(staffDef.getAttribute('decls') || '').trim()
    if (!decls) return

    decls
      .split(/\s+/)
      .map((ref) => {
        const parsed = parseCorrespToken(ref)
        return parsed ? parsed.targetId : normalizeId(ref)
      })
      .forEach((declId) => {
        const rastrumMeta = rastrumMetaById.get(declId)
        if (rastrumMeta && Number.isFinite(rastrumMeta.pos)) {
          rastra.push(rastrumMeta)
        }
      })
  })

  const uniqueByPos = new Map()
  rastra.forEach((rastrumMeta) => {
    if (!uniqueByPos.has(rastrumMeta.pos)) {
      uniqueByPos.set(rastrumMeta.pos, rastrumMeta)
    }
  })

  return Array.from(uniqueByPos.values()).sort((a, b) => a.pos - b.pos)
}

/**
 * Computes an axis-aligned bbox for a rotated rectangle around top-left pivot.
 *
 * @param {number} left - Rectangle x position.
 * @param {number} top - Rectangle y position.
 * @param {number} width - Rectangle width.
 * @param {number} height - Rectangle height.
 * @param {number} rotate - Rotation angle in degrees.
 * @returns {{x1: number, y1: number, x2: number, y2: number}|null} Rotated bbox.
 */
function computeRotatedRectBounds (left, top, width, height, rotate = 0) {
  if (![left, top, width, height].every(Number.isFinite)) return null
  if (width <= 0 || height <= 0) return null

  const angle = rotate * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height]
  ].map(([dx, dy]) => {
    return {
      x: left + dx * cos - dy * sin,
      y: top + dx * sin + dy * cos
    }
  })

  const xs = corners.map(point => point.x)
  const ys = corners.map(point => point.y)

  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys)
  }
}

/**
 * Computes normalized system-preview bounds from rastrum metadata.
 *
 * @param {Array<{left: number, top: number, width: number, systemHeight: number, rotate: number}>} rastra - Rastrum metadata for a system.
 * @param {{width: number, height: number}|null} surfaceDimensions - Page dimensions from context.
 * @returns {{x: number, y: number, w: number, h: number}|null} Normalized preview bounds.
 */
function computeSystemPreviewBounds (rastra, surfaceDimensions) {
  if (!surfaceDimensions) return null
  if (!Number.isFinite(surfaceDimensions.width) || !Number.isFinite(surfaceDimensions.height) || surfaceDimensions.width <= 0 || surfaceDimensions.height <= 0) {
    return null
  }

  const bounds = rastra
    .map((rastrumMeta) => {
      return computeRotatedRectBounds(
        rastrumMeta.left,
        rastrumMeta.top,
        rastrumMeta.width,
        rastrumMeta.systemHeight,
        rastrumMeta.rotate
      )
    })
    .filter(Boolean)

  if (bounds.length === 0) return null

  const minX = Math.min(...bounds.map(b => b.x1))
  const minY = Math.min(...bounds.map(b => b.y1))
  const maxX = Math.max(...bounds.map(b => b.x2))
  const maxY = Math.max(...bounds.map(b => b.y2))

  const clamp01 = value => Math.max(0, Math.min(1, value))
  const x1 = clamp01(minX / surfaceDimensions.width)
  const y1 = clamp01(minY / surfaceDimensions.height)
  const x2 = clamp01(maxX / surfaceDimensions.width)
  const y2 = clamp01(maxY / surfaceDimensions.height)

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1)
  }
}

/**
 * Pushes one or more surface references from an attribute value.
 *
 * @param {string|null} value - Raw attribute value.
 * @param {string[]} refs - Collected refs in traversal order.
 * @returns {void} No return value.
 */
function pushSurfaceRefs (value, refs) {
  const normalized = String(value || '').trim()
  if (!normalized) return

  normalized
    .split(/\s+/)
    .filter(Boolean)
    .forEach(ref => refs.push(ref))
}

/**
 * Traverses foliation structures and collects surface refs in canonical order.
 *
 * @param {Element} element - Current foliation element.
 * @param {string[]} refs - Collected refs in traversal order.
 * @returns {void} No return value.
 */
function collectFoliaSurfaceRefs (element, refs) {
  if (!element) return

  if (element.localName === 'bifolium') {
    pushSurfaceRefs(element.getAttribute('outer.recto'), refs)
    pushSurfaceRefs(element.getAttribute('inner.verso'), refs)

    Array.from(element.children).forEach((child) => {
      collectFoliaSurfaceRefs(child, refs)
    })

    pushSurfaceRefs(element.getAttribute('inner.recto'), refs)
    pushSurfaceRefs(element.getAttribute('outer.verso'), refs)
    return
  }

  if (element.localName === 'folium' || element.localName === 'unknownFoliation') {
    pushSurfaceRefs(element.getAttribute('recto'), refs)
    pushSurfaceRefs(element.getAttribute('verso'), refs)
    return
  }

  Array.from(element.children).forEach((child) => {
    collectFoliaSurfaceRefs(child, refs)
  })
}

/**
 * Resolves the 1-based foliation index for a surface from context document.
 *
 * @param {Document} contextDom - Context MEI document.
 * @param {string} surfaceId - Surface xml:id to resolve.
 * @returns {string} 1-based index as string; empty string if unresolved.
 */
function resolveSurfaceLabelFromContext (contextDom, surfaceId) {
  const targetSurfaceId = normalizeId(surfaceId)
  if (!contextDom || !targetSurfaceId) return ''

  const foliaDesc = contextDom.querySelector('foliaDesc')
  if (!foliaDesc) return ''

  const refs = []
  Array.from(foliaDesc.children).forEach((child) => {
    collectFoliaSurfaceRefs(child, refs)
  })

  const expectedSuffix = '#' + targetSurfaceId
  const matchIndex = refs.findIndex(ref => String(ref).trim().endsWith(expectedSuffix))

  if (matchIndex === -1) return ''
  return String(matchIndex + 1)
}

/**
 * improves display of <sb> and <pb> indicators in the SVG rendered from Verovio
 *
 * @param {SVGElement|Document} svgDom - Source document used by this function.
 * @param {Document} atDom - Encoding of the annotated transcript.
 * @param {Document} dtDom - Diplomatic transcript document used by this function.
 * @param {Document} sourceDom - Source document used by this function.
 * @param {Document} contextDom - Context document used by this function; this might be a reconstructed document, where sourceDom is the modern document that was once part of this one.
 * @param {Object} triple - File paths and dates related to the current processing context, used for logging and data retrieval within this function.
 * @param {Object} options - Optional behavior flags and callbacks.
 * @param {Function} options.onIssue - Callback receiving non-fatal issue descriptors.
 * @returns {Object} Resulting object.
 */
export function addSystemLabelBlocks (svgDom, atDom, dtDom, sourceDom, contextDom, triple, options = {}) {
  const wzBegins = svgDom.querySelectorAll('g[data-class="annot"]:not(.bounding-box)')
  const doc = svgDom.ownerDocument || svgDom.documentElement?.ownerDocument || svgDom
  const atAnnotById = buildAnnotByIdMap(atDom)
  const atSbById = buildElementByIdMap(atDom, 'sb')
  const sourceGenDescById = buildElementByIdMap(sourceDom, 'genDesc')
  const rastrumMetaById = buildSourceRastrumMetaById(sourceDom)
  const currentDtReference = triple?.dtFullPath || triple?.dt || ''
  const dtDomCache = new Map()
  const reportIssue = (issue) => {
    if (typeof options?.onIssue === 'function') {
      options.onIssue(issue)
    }
  }

  const currentDtAbsolutePath = String(currentDtReference || '').trim() ? path.resolve(String(currentDtReference).trim()) : ''
  if (currentDtAbsolutePath) {
    dtDomCache.set(currentDtAbsolutePath, dtDom)
  }

  if (wzBegins.length === 0) {
    return svgDom
  }
  /**
   * Returns measure from the current data context.
   *
   * @param {Element} node - Element processed by this function.
   * @returns {Object} Resulting object.
   */
  const getMeasure = (node) => {
    if (!node) return null
    let sibling = node.nextSibling
    while (sibling) {
      // nodeType 1 is ELEMENT_NODE, so this skips text nodes. Not using nextElementSibling for restricted API of xmldom-qsa compared to JSDom
      if (sibling.nodeType === 1 && sibling.getAttribute('data-class') === 'measure') {
        return sibling
      }
      sibling = sibling.nextSibling
    }
    return null
  }

  const firstMeasure = getMeasure(wzBegins[0])
  if (!firstMeasure) {
    return svgDom
  }

  const staffLines = firstMeasure.querySelectorAll('g.staff > path')
  if (staffLines.length < 5) {
    return svgDom
  }

  const firstY = parseFloat(staffLines[0].getAttribute('d')?.split(' ')[1])
  const fifthY = parseFloat(staffLines[4].getAttribute('d')?.split(' ')[1])
  const staffHeight = Number.isFinite(firstY) && Number.isFinite(fifthY)
    ? Math.abs(fifthY - firstY)
    : 12

  const fontSize = staffHeight / 1.5
  wzBegins.forEach((wzb) => {
    const content = []
    const box = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
    box.setAttribute('class', 'writingZone')
    box.setAttribute('data-id', 'wz_' + wzb.getAttribute('data-id'))
    box.setAttribute('data-class', 'writingZone')

    const isElement = (node) => node && node.nodeType === 1
    const hasClass = (node, className) => isElement(node) && node.getAttribute('data-class') === className

    let next = wzb.nextSibling
    while (next) {
      if (hasClass(next, 'annot')) break
      if (isElement(next)) {
        if (hasClass(next, 'sb')) {
          const sbDataId = normalizeId(next.getAttribute('data-id'))
          const sbCorrespId = normalizeId(next.getAttribute('data-corresp'))
          const sysBox = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
          sysBox.setAttribute('class', 'systemBegin')
          sysBox.setAttribute('data-class', 'systemBegin')
          sysBox.setAttribute('data-id', sbDataId)
          sysBox.setAttribute('data-system-id', sbCorrespId || sbDataId)

          content.push(sysBox)
          const sysBoxContent = []

          let sysNext = next.nextSibling
          while (sysNext) {
            if (hasClass(sysNext, 'sb') || hasClass(sysNext, 'pb')) break

            if (isElement(sysNext)) {
              sysBoxContent.push(sysNext)
            }
            sysNext = sysNext.nextSibling
          }

          sysBoxContent.forEach((node) => {
            sysBox.appendChild(node)
          })
        }

        if (!hasClass(next, 'pb')) {
          content.push(next)
        }
      }

      next = next.nextSibling
    }
    const parent = wzb.parentNode
    box.appendChild(wzb.cloneNode(true))
    content.forEach((node) => {
      box.appendChild(node)
    })

    parent.replaceChild(box, wzb)

    const atWzBeginId = normalizeId(wzb.getAttribute('data-id'))
    const atWzBegin = atAnnotById.get(atWzBeginId) || null
    let label = 'x'
    let surfaceId = ''
    let surfaceDimensions = null

    if (atWzBegin && atWzBegin.hasAttribute('corresp')) {
      try {
        const wzId = normalizeId(atWzBegin.getAttribute('corresp').split('#')[1])

        box.setAttribute('data-wz-id', wzId)

        const sourceLabel = contextDom?.querySelector('meiHead > fileDesc > titleStmt > title[type="abbreviated"]')?.textContent || ''
        const gendescWZ = sourceGenDescById.get(wzId)
        if (!gendescWZ) {
          throw new Error('Missing genDesc for writing zone id ' + wzId)
        }

        const wzLabel = gendescWZ.getAttribute('label')

        surfaceId = normalizeId(gendescWZ.parentNode?.getAttribute('corresp'))
        const surfaceLabel = resolveSurfaceLabelFromContext(contextDom, surfaceId)
        if (!surfaceLabel) {
          throw new Error('Missing context foliation label for surface id ' + surfaceId)
        }

        surfaceDimensions = resolveSurfaceDimensionsFromContext(contextDom, surfaceId)

        const docName = triple?.dtFullPath || triple?.dt || ''
        box.setAttribute('data-dt-path', docName)

        label = sourceLabel + ' ' + surfaceLabel + ' / ' + wzLabel
      } catch (err) {
        console.warn('Unable to retrieve wz label for writingZone', atWzBegin)
      }
    }

    const bbox = computeApproxBBox(box)
    if (!bbox) {
      return
    }

    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', bbox.x + staffHeight / 8)
    rect.setAttribute('y', staffHeight * -2)
    rect.setAttribute('width', bbox.width - staffHeight / 4)
    rect.setAttribute('height', staffHeight)
    rect.setAttribute('fill', '#e5e5e5')
    rect.setAttribute('class', 'pageLabelBox')

    const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', bbox.x + staffHeight / 8 + fontSize / 3)
    text.setAttribute('y', staffHeight * -2 + fontSize * 1)
    text.setAttribute('font-size', fontSize)
    text.setAttribute('class', 'pageLabel')
    text.textContent = label

    const prependChild = (parent, node) => {
      if (parent.firstChild) {
        parent.insertBefore(node, parent.firstChild)
      } else {
        parent.appendChild(node)
      }
    }

    prependChild(box, text)
    prependChild(box, rect)

    const sysBoxes = box.querySelectorAll('g.systemBegin')

    if (!surfaceDimensions) {
      reportIssue({
        code: 'page-dimensions-unresolved',
        surfaceId,
        currentDtReference,
        reason: 'Could not resolve surface width/height from context foliation metadata.'
      })
    }

    sysBoxes.forEach((sysBox) => {
      const sysBbox = computeApproxBBox(sysBox)
      if (!sysBbox) {
        return
      }

      const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      rect.setAttribute('x', sysBbox.x + staffHeight / 8)
      rect.setAttribute('y', staffHeight * -0.8)
      rect.setAttribute('width', sysBbox.width - staffHeight / 4)
      rect.setAttribute('height', staffHeight * 0.6)
      rect.setAttribute('fill', '#e5e5e5')
      rect.setAttribute('class', 'pageLabelBox')

      const sbId = normalizeId(sysBox.getAttribute('data-id'))
      const dtSystemRef = resolveDtSystemRefFromSb(sbId, atSbById, currentDtReference)
      const mappedSystemId = dtSystemRef?.targetId || ''
      const systemId = mappedSystemId || sbId || normalizeId(sysBox.getAttribute('data-system-id'))
      const dtDomForSystem = resolveDtDomForSystemRef(dtSystemRef, dtDom, currentDtReference, dtDomCache, (issue) => {
        reportIssue({
          ...issue,
          sbId,
          systemId,
          currentDtReference
        })
      }) || dtDom
      const systemLabels = resolveSystemLabelsByDtSystem(systemId, dtDomForSystem, rastrumMetaById)

      if (systemLabels.length === 0) {
        reportIssue({
          code: 'system-label-unresolved',
          sbId,
          systemId,
          dtFileRef: dtSystemRef?.fileRef || '',
          currentDtReference,
          reason: 'No system labels could be resolved for the requested DT system.'
        })
      }

      const pageHeight = staffHeight * 0.6 * 0.8
      const pageAspectRatio = surfaceDimensions && Number.isFinite(surfaceDimensions.width) && Number.isFinite(surfaceDimensions.height) && surfaceDimensions.height > 0
        ? surfaceDimensions.width / surfaceDimensions.height
        : 1
      const pageWidth = parseFloat((pageHeight * pageAspectRatio).toFixed(2))

      const previewPageBox = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      previewPageBox.setAttribute('class', 'pageBg')
      previewPageBox.setAttribute('x', sysBbox.x + staffHeight / 8 + pageHeight * 0.1)
      previewPageBox.setAttribute('y', staffHeight * -0.8 + pageHeight * 0.1)

      previewPageBox.setAttribute('height', pageHeight)
      previewPageBox.setAttribute('width', pageWidth)
      previewPageBox.setAttribute('fill', '#f5f5f5')

      const previewBounds = computeSystemPreviewBounds(systemLabels, surfaceDimensions)
      const x1 = previewBounds ? previewBounds.x : 0
      const y1 = previewBounds ? previewBounds.y : 0
      const previewWidthRatio = previewBounds ? previewBounds.w : 1
      const previewHeightRatio = previewBounds ? previewBounds.h : 1

      const previewSystemBox = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      previewSystemBox.setAttribute('class', 'sysPreview')
      previewSystemBox.setAttribute('x', sysBbox.x + staffHeight / 8 + pageHeight * 0.1 + pageWidth * x1)
      previewSystemBox.setAttribute('y', staffHeight * -0.8 + pageHeight * 0.1 + pageHeight * y1)

      previewSystemBox.setAttribute('height', pageHeight * previewHeightRatio)
      previewSystemBox.setAttribute('width', pageWidth * previewWidthRatio)
      previewSystemBox.setAttribute('fill', '#ff3333')

      const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', sysBbox.x + staffHeight / 8 + parseFloat(pageHeight * 0.5) + parseFloat(pageWidth))
      text.setAttribute('y', staffHeight * -0.8 + fontSize * 0.65)
      text.setAttribute('font-size', fontSize * 0.75)
      text.setAttribute('class', 'sysLabel')

      let systemLabel

      if (systemLabels.length > 1) {
        systemLabel = 'Staves ' + systemLabels.map(label => label.pos).join(', ')
      } else if (systemLabels.length === 1) {
        systemLabel = 'Staff ' + systemLabels[0].pos
      } else {
        systemLabel = 'data unavailable'
      }
      text.textContent = systemLabel // 'Systems'

      prependChild(sysBox, text)
      prependChild(sysBox, previewSystemBox)
      prependChild(sysBox, previewPageBox)
      prependChild(sysBox, rect)
    })
  })

  return svgDom
}

/**
 * Normalizes AT indicators needed before rendering.
 *
 * @param {Document} atDom - Source document used by this function.
 * @returns {Object} Resulting object.
 */
export function addSbIndicators (atDom) {
  atDom.querySelectorAll('annot[class="#bw_writingZoneBegin"]').forEach((annot) => {
    annot.setAttribute('type', '#bw_writingZoneBegin')
  })

  return atDom
}

/**
 * This function prepares an AT for rendering by Verovio
 *
 * @returns
 * @param {Document} atDom - Source document used by this function.
 * @returns {void} No return value.
 */
export function prepareAtForVerovio (atDom) {
  // add dot-corresp attribute to elements that have dot children, and count dots in dots attribute, then remove dot children, as Verovio does not support them and this way we can still use the information in the AT to display dots in the right place in the SVG output
  const map = new Map()
  const dots = atDom.querySelectorAll('dot')
  dots.forEach((dot) => {
    const parent = dot.parentElement
    const parentId = parent.getAttribute('xml:id')
    if (!map.has(parentId)) {
      map.set(parentId, parent)
    }
  })
  map.forEach((parent) => {
    const dots = parent.querySelectorAll('dot')
    const count = dots.length

    const dotAttCount = parent.hasAttribute('dots') ? parseInt(parent.getAttribute('dots')) : 0
    if (dotAttCount > 0) {
      console.warn(parent.localName + ' ' + parent.getAttribute('xml:id') + ' has dots attribute and also dots children.')
    }
    parent.setAttribute('dots', dotAttCount + count)
    dots.forEach(dot => dot.remove())
    const refs = [...dots].map(dot => dot.getAttribute('corresp')).filter(corresp => corresp !== null).join(' ')
    if (parent.hasAttribute('dot-corresp')) {
      console.warn(parent.localName + ' ' + parent.getAttribute('xml:id') + ' already has dot-corresp attribute.')
      parent.setAttribute('dot-corresp', parent.getAttribute('dot-corresp') + ' ' + refs)
    } else {
      parent.setAttribute('dot-corresp', refs)
    }
  })

  // remove supplied elements in scoreDef, as Verovio does not support them
  const suppliedsInScoreDef = atDom.querySelectorAll('scoreDef supplied > *')
  suppliedsInScoreDef.forEach((elem) => {
    const supplied = elem.parentElement
    const parent = supplied.parentElement
    if (supplied && supplied.localName === 'supplied') {
      elem.setAttribute('type', 'supplied')
      parent.appendChild(elem.cloneNode(true))
      supplied.remove()
    }
  })
}

/**
 * This function fixes some artifacts of an AT as rendered by Verovio
 *
 * @param {SVGElement|Document} svgDom - Source document used by this function.
 * @param {Document} atDom - Source document used by this function.
 * @param {Document} dtDom - DOM document used by this function.
 * @returns {void} No return value.
 */
export function improveAtSvg (svgDom, atDom, dtDom) {
  /* const dotBearers = svgDom.querySelectorAll('*[data-dot-corresp]')
  dotBearers.forEach((dotBearer) => {
    const corresp = dotBearer.getAttribute('data-dot-corresp')
    const dotRefs = corresp.split(' ')
    const dots = dotBearer.querySelectorAll('g.dots:not(.bounding-box) ellipse')
    dots.forEach((dot, i) => {
      if (dotRefs[i]) {
        dot.setAttribute('data-corresp', dotRefs[i])
      }
    })
  }) */

  fixScoreDefChildIds(svgDom, atDom)

  return svgDom
}

/**
 * Processes score def child ids for this operation.
 *
 * @param {SVGElement|Document} svgDom - Source document used by this function.
 * @param {string} meiDom - String input used by this function.
 * @returns {void} No return value.
 */
export const fixScoreDefChildIds = (svgDom, meiDom) => {
  const firstScoreDef = meiDom.querySelector('scoreDef')

  const firstMeasureStavesSvg = svgDom.querySelector('g.measure:not(.bounding-box)').querySelectorAll('g.staff:not(.bounding-box)')

  firstMeasureStavesSvg.forEach((staffSvg, index) => {
    const n = index + 1
    const staffDef = firstScoreDef.querySelector('staffDef[n="' + n + '"]')
    const meterSigSvg = staffSvg.querySelector('g.meterSig:not(.bounding-box)')
    const meterSigMei = staffDef.querySelector('meterSig')

    if (meterSigSvg && meterSigMei) {
      meterSigSvg.setAttribute('data-id', meterSigMei.getAttribute('xml:id'))
      if (meterSigMei.hasAttribute('corresp')) {
        meterSigSvg.setAttribute('data-corresp', meterSigMei.getAttribute('corresp'))
      } else {
        meterSigSvg.removeAttribute('data-corresp')
      }
    }

    const clefSvg = staffSvg.querySelector('g.clef:not(.bounding-box)')
    const clefMei = staffDef.querySelector('clef')
    if (clefSvg && clefMei) {
      clefSvg.setAttribute('data-id', clefMei.getAttribute('xml:id'))
      if (clefMei.hasAttribute('corresp')) {
        clefSvg.setAttribute('data-corresp', clefMei.getAttribute('corresp'))
      } else {
        clefSvg.removeAttribute('data-corresp')
      }
    }

    const keySigSvg = staffSvg.querySelector('g.keySig:not(.bounding-box)')
    const keySigMei = staffDef.querySelector('keySig')
    if (keySigSvg && keySigMei) {
      keySigSvg.setAttribute('data-id', keySigMei.getAttribute('xml:id'))
      if (keySigMei.hasAttribute('corresp')) {
        keySigSvg.setAttribute('data-corresp', keySigMei.getAttribute('corresp'))
      } else {
        keySigSvg.removeAttribute('data-corresp')
      }

      const keyAccidsSvg = keySigSvg.querySelectorAll('g.keyAccid:not(.bounding-box)')
      const keyAccidsMei = keySigMei.querySelectorAll('keyAccid')
      keyAccidsSvg.forEach((keyAccidSvg, ki) => {
        const keyAccidMei = keyAccidsMei[ki]
        if (keyAccidMei) {
          keyAccidSvg.setAttribute('data-id', keyAccidMei.getAttribute('xml:id'))
          if (keyAccidMei.hasAttribute('corresp')) {
            keyAccidSvg.setAttribute('data-corresp', keyAccidMei.getAttribute('corresp'))
          } else {
            keyAccidSvg.removeAttribute('data-corresp')
          }
        }
      })
    }
  })
}
