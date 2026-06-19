import { parseTranslatePoint } from './svgShared.js'

/**
 * Extracts choice vertical offsets from rendered reg/orig AT SVGs.
 *
 * @param {SVGElement|Document} regAtSvg - SVG with reg-only choice rendering.
 * @param {SVGElement|Document} origAtSvg - SVG with orig-only choice rendering.
 * @param {Document} editedAtDom - Edited AT DOM used to map reg ids to orig ids.
 * @returns {Map<string, number>} Vertical offsets keyed by reg element id.
 */
export function extractChoiceVerticalOffsets (regAtSvg, origAtSvg, editedAtDom) {
  const regSvgElement = regAtSvg?.documentElement || regAtSvg
  const origSvgElement = origAtSvg?.documentElement || origAtSvg
  if (!regSvgElement || !origSvgElement) return new Map()

  const regPositions = collectChoicePositionMap(regSvgElement)
  const origPositions = collectChoicePositionMap(origSvgElement)
  const regToOrig = buildChoiceRegToOrigIdMap(editedAtDom)

  const offsets = new Map()
  regPositions.forEach((regPos, id) => {
    const mappedOrigId = regToOrig.get(id) || id
    const origPos = origPositions.get(mappedOrigId)
    if (!origPos) return

    const diffY = Math.round((origPos.y - regPos.y) * 1000) / 1000
    if (Math.abs(diffY) < 0.001) return
    offsets.set(id, diffY)
  })

  return offsets
}

/**
 * Collects positioning anchors for choice-relevant glyphs.
 *
 * @param {SVGElement|Document} svgElement - Root SVG element.
 * @returns {Map<string, {x: number, y: number}>} Position map by data-id.
 */
function collectChoicePositionMap (svgElement) {
  const positions = new Map()
  if (!svgElement) return positions

  const addPositions = (selector, pointSelector) => {
    svgElement.querySelectorAll(selector).forEach(element => {
      const id = element.getAttribute('data-id')
      if (!id || positions.has(id)) return

      const pointElement = element.querySelector(pointSelector)
      const point = parseTranslatePoint(pointElement?.getAttribute('transform'))
      if (!point) return

      positions.set(id, point)
    })
  }

  addPositions('g.note:not(.bounding-box)[data-id]', '.notehead > use')
  addPositions('g.accid:not(.bounding-box)[data-id], g.keyAccid:not(.bounding-box)[data-id]', 'use')
  addPositions('g.artic:not(.bounding-box)[data-id]', 'use')

  return positions
}

/**
 * Builds a reg -> orig element id map for choice structures.
 *
 * @param {Document} editedAtDom - Edited AT DOM with choice/orig/reg structure.
 * @returns {Map<string, string>} Mapping from reg ids to orig ids.
 */
function buildChoiceRegToOrigIdMap (editedAtDom) {
  const regToOrig = new Map()
  if (!editedAtDom) return regToOrig

  const pairByLocalNameAndCorresp = (origNodes, regNodes) => {
    const usedOrigIds = new Set()

    regNodes.forEach(regNode => {
      const regId = regNode.getAttribute('xml:id')
      if (!regId || regToOrig.has(regId)) return

      const regLocalName = regNode.localName
      const regCorresp = regNode.getAttribute('corresp') || ''

      const candidate = origNodes.find(origNode => {
        const origId = origNode.getAttribute('xml:id')
        if (!origId || usedOrigIds.has(origId)) return false
        if (origNode.localName !== regLocalName) return false
        const origCorresp = origNode.getAttribute('corresp') || ''
        return regCorresp.length > 0 && origCorresp === regCorresp
      })

      if (candidate) {
        const origId = candidate.getAttribute('xml:id')
        regToOrig.set(regId, origId)
        usedOrigIds.add(origId)
      }
    })

    regNodes.forEach(regNode => {
      const regId = regNode.getAttribute('xml:id')
      if (!regId || regToOrig.has(regId)) return

      const regLocalName = regNode.localName
      const candidate = origNodes.find(origNode => {
        const origId = origNode.getAttribute('xml:id')
        if (!origId || usedOrigIds.has(origId)) return false
        return origNode.localName === regLocalName
      })

      if (!candidate) return
      const origId = candidate.getAttribute('xml:id')
      regToOrig.set(regId, origId)
      usedOrigIds.add(origId)
    })
  }

  const findDirectChild = (parent, localName) => {
    const children = Array.from(parent.childNodes || [])
    return children.find(node => node.nodeType === 1 && node.localName === localName) || null
  }

  editedAtDom.querySelectorAll('choice').forEach(choiceNode => {
    const origNode = findDirectChild(choiceNode, 'orig')
    const regNode = findDirectChild(choiceNode, 'reg')
    if (!origNode || !regNode) return

    const origElements = Array.from(origNode.querySelectorAll('[xml\\:id]'))
    const regElements = Array.from(regNode.querySelectorAll('[xml\\:id]'))
    if (origElements.length === 0 || regElements.length === 0) return

    pairByLocalNameAndCorresp(origElements, regElements)
  })

  return regToOrig
}
