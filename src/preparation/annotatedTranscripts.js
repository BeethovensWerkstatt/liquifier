import { computeApproxBBox } from '../utils/svgGeometry.js'

const XML_NS = 'http://www.w3.org/XML/1998/namespace'

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
 * improves display of <sb> and <pb> indicators in the SVG rendered from Verovio
 *
 * @param {SVGElement|Document} svgDom - Source document used by this function.
 * @param {Document} atDom - Encoding of the annotated transcript.
 * @param {Document} sourceDom - Source document used by this function.
 * @param {Document} contextDom - Context document used by this function; this might be a reconstructed document, where sourceDom is the modern document that was once part of this one.
 * @param {Object} triple - File paths and dates related to the current processing context, used for logging and data retrieval within this function.
 * @returns {Object} Resulting object.
 */
export function addSystemLabelBlocks (svgDom, atDom, sourceDom, contextDom, triple) {
  const wzBegins = svgDom.querySelectorAll('g[data-class="annot"]:not(.bounding-box)')
  const doc = svgDom.ownerDocument || svgDom.documentElement?.ownerDocument || svgDom
  const atAnnotById = buildAnnotByIdMap(atDom)
  const sourceGenDescById = buildElementByIdMap(sourceDom, 'genDesc')
  const sourceSurfaceById = buildElementByIdMap(sourceDom, 'surface')

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

    let sibling = node.nextElementSibling
    while (sibling) {
      if (sibling.getAttribute('data-class') === 'measure') {
        return sibling
      }
      sibling = sibling.nextElementSibling
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

    let next = wzb.nextElementSibling
    while (next && !next.classList.contains('annot')) {
      if (next.classList.contains('sb')) {
        // console.log(912, 'found sb', next)

        const sysBox = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
        sysBox.setAttribute('class', 'systemBegin')
        sysBox.setAttribute('data-class', 'systemBegin')
        sysBox.setAttribute('data-id', next.getAttribute('data-id'))
        sysBox.setAttribute('data-system-id', next.hasAttribute('data-corresp') ? next.getAttribute('data-corresp').split('#')[1] : '')

        content.push(sysBox)
        const sysBoxContent = []

        let sysNext = next.nextElementSibling
        while (sysNext && !sysNext.classList.contains('sb') && !sysNext.classList.contains('pb')) {
          sysBoxContent.push(sysNext)
          sysNext = sysNext.nextElementSibling
        }
        sysBoxContent.forEach((node) => {
          sysBox.append(node)
        })
      }

      if (!next.classList.contains('pb')) {
        content.push(next)
      }
      next = next.nextElementSibling
    }
    const parent = wzb.parentElement
    box.append(wzb.cloneNode(true))
    content.forEach((node) => {
      box.append(node)
    })

    parent.replaceChild(box, wzb)

    const atWzBeginId = normalizeId(wzb.getAttribute('data-id'))
    const atWzBegin = atAnnotById.get(atWzBeginId) || null
    let label = 'x'

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

        const surfaceId = normalizeId(gendescWZ.parentElement?.getAttribute('corresp'))
        const surface = sourceSurfaceById.get(surfaceId)
        if (!surface) {
          throw new Error('Missing surface for writing zone id ' + wzId)
        }

        const surfaceLabel = surface.getAttribute('label')

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
    rect.classList.add('pageLabelBox')

    const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.setAttribute('x', bbox.x + staffHeight / 8 + fontSize / 3)
    text.setAttribute('y', staffHeight * -2 + fontSize * 1)
    text.setAttribute('font-size', fontSize)
    text.classList.add('pageLabel')
    text.textContent = label
    box.prepend(text)
    box.prepend(rect)

    const sysBoxes = box.querySelectorAll('g.systemBegin')

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
      rect.classList.add('pageLabelBox')

      const systemLabels = []

      const pageHeight = staffHeight * 0.6 * 0.8
      const pageWidth = systemLabels.length > 0 ? parseFloat((pageHeight * systemLabels[0].ratio).toFixed(2)) : 1

      const previewPageBox = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      previewPageBox.classList.add('pageBg')
      previewPageBox.setAttribute('x', sysBbox.x + staffHeight / 8 + pageHeight * 0.1)
      previewPageBox.setAttribute('y', staffHeight * -0.8 + pageHeight * 0.1)

      previewPageBox.setAttribute('height', pageHeight)
      previewPageBox.setAttribute('width', pageWidth)

      let x1 = 0
      let y1 = 0
      let x2 = 1
      let y2 = 1
      if (systemLabels.length > 0) {
        x1 = 1
        y1 = 1
        x2 = 0
        y2 = 0
        systemLabels.forEach((systemLabel) => {
          x1 = Math.min(x1, systemLabel.x)
          y1 = Math.min(y1, systemLabel.y)
          x2 = Math.max(x2, systemLabel.x + systemLabel.w)
          y2 = Math.max(y2, systemLabel.y + systemLabel.h)
        })
      }

      const previewSystemBox = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      previewSystemBox.classList.add('sysPreview')
      previewSystemBox.setAttribute('x', sysBbox.x + staffHeight / 8 + pageHeight * 0.1 + pageWidth * x1)
      previewSystemBox.setAttribute('y', staffHeight * -0.8 + pageHeight * 0.1 + pageHeight * y1)

      previewSystemBox.setAttribute('height', pageHeight * (y2 - y1))
      previewSystemBox.setAttribute('width', pageWidth * (x2 - x1))

      const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', sysBbox.x + staffHeight / 8 + parseFloat(pageHeight * 0.5) + parseFloat(pageWidth))
      text.setAttribute('y', staffHeight * -0.8 + fontSize * 0.65)
      text.setAttribute('font-size', fontSize * 0.75)
      text.classList.add('sysLabel')

      let systemLabel

      if (systemLabels.length > 1) {
        systemLabel = 'Staves ' + systemLabels.map(label => label.pos).join(', ')
      } else if (systemLabels.length === 1) {
        systemLabel = 'Staff ' + systemLabels[0].pos
      } else {
        systemLabel = 'data unavailable'
      }
      text.textContent = systemLabel // 'Systems'

      sysBox.prepend(text)
      sysBox.prepend(previewSystemBox)
      sysBox.prepend(previewPageBox)
      sysBox.prepend(rect)
    })
  })

  return svgDom
}

/**
 * fixes corresp attributes for dots in the SVG output, as ATs use attributes, but DTs use elements
 *
 * @param {SVGElement|Document} svgDom - Source document used by this function.
 * @param {Document} atDom - Source document used by this function.
 * @returns {Object} Resulting object.
 */
export function addSbIndicators (svgDom, atDom) {
  const doc = atDom.ownerDocument || atDom

  atDom.querySelectorAll('annot[class="#bw_writingZoneBegin"]').forEach((annot) => {
    annot.setAttribute('type', '#bw_writingZoneBegin')
  })

  const sbs = atDom.querySelectorAll('sb')

  /**
   * Returns measure from the current data context.
   *
   * @param {Element} node - Element processed by this function.
   * @returns {Object} Resulting object.
   */
  const getMeasure = (node) => {
    let sibling = node.nextElementSibling
    while (sibling) {
      if (sibling.localName === 'measure') {
        return sibling
      }
      sibling = sibling.nextElementSibling
    }
    return null
  }

  sbs.forEach((sb, i) => {
    if (i > 0) {
      const measure = getMeasure(sb)
      if (measure) {
        const dir = doc.createElementNS('http://www.music-encoding.org/ns/mei', 'dir')
        const pb = sb.previousElementSibling.localName === 'pb'
        dir.innerHTML = pb ? '⫪' : '⊤'
        dir.setAttribute('staff', 1)
        dir.setAttribute('tstamp', 0)
        dir.setAttribute('place', 'above')
        const classes = pb ? 'pb sb unselectable' : 'sb unselectable'
        dir.setAttribute('type', classes)
        dir.setAttribute('xml:id', 'dir_' + sb.getAttribute('xml:id'))
        measure.append(dir)
      }
    }
  })

  return atDom
}

/**
 * This function prepares an AT for rendering by Verovio
 *
 * @returns
 * @param {Document} atDom - Source document used by this function.
 * @param {Document} dtDom - DOM document used by this function.
 * @param {{width?: number, height?: number}} pageDimensions - Rendering page dimensions.
 * @returns {void} No return value.
 */
export function prepareAtDomForRendering (atDom, dtDom, pageDimensions) {
  const clone = atDom.cloneNode(true)
  const map = new Map()
  const dots = clone.querySelectorAll('dot')
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
    // console.log(611, 'parent resolved', parent)
  })
  const staffCorresp = clone.querySelectorAll('staff[corresp]')
  staffCorresp.forEach((staff) => {
    const corresps = staff.getAttribute('corresp').split(' ')
    console.log(279, 'prepareAtDomForRendering', staff.getAttribute('xml:id'), 'corresp', corresps)
  })
  return clone
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
