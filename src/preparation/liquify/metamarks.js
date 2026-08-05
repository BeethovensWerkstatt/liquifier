import { uuid } from '../../utils/uuid.js'

/**
 * Adds DT-only metaMarks to the AT layer and removes them at regulation.
 * The containing systemBegin and its staff lines share the reading-order transform.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG layer.
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG layer.
 * @param {Document} atMeiDom - Annotated transcript MEI DOM.
 * @param {Object} tools - Animation helper bundle.
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer.
 * @param {Document} tools.sourceDtMeiDom - Source DT MEI DOM with metaMark facsimile references.
 * @param {string[]} [tools.activeSvgLayers] - Writing-layer SVG IDs active in a preceding genetic state.
 * @returns {void} No return value.
 */
export const liquifyMetamarks = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { setAnimation, activeSvgLayers } = tools

  dtSvg.querySelectorAll('g.clarification, g.metaMark').forEach(metaMark => {
    if (Array.isArray(activeSvgLayers) && !isInActiveWritingLayer(metaMark, ftSvg.ownerDocument, tools.sourceDtMeiDom, activeSvgLayers)) return

    const dtSystem = getOwningDtSystem(metaMark)
    const atSb = atMeiDom.querySelector(`sb[corresp$="#${dtSystem?.getAttribute('data-id')}"]`)
    const atSbId = atSb?.getAttribute('xml:id')
    const systemBegin = atSbId ? ftSvg.querySelector(`g.systemBegin[data-system-id="${atSbId}"]`) : null

    const posElem = metaMark.querySelector('*[x][y]')
    const pos = { x: parseFloat(posElem.getAttribute('x') || '0'), y: parseFloat(posElem.getAttribute('y') || '0') }
    const newPos = tools.getNewPos({ x: 0, y: 0 }, pos)

    const clonedMetaMark = metaMark.cloneNode(true)
    const target = clonedMetaMark.querySelector('*[x][y]')
    target.setAttribute('x', newPos.x)
    target.setAttribute('y', newPos.y)

    // We need to fix an incorrect animateTransform on the system level that incorrectly translates this metaMark.
    const systemAnimateTransform = systemBegin.lastChild
    if (systemAnimateTransform && systemAnimateTransform.localName === 'animateTransform') {
      const values = systemAnimateTransform.getAttribute('values').split(';')
      // 0 0;0 0;0 0;0 0;36594 -1495;0 0;0 0;0 0

      const newVal = '0 0;0 0;0 0;0 0;0 0;' + values[4] + ';0 0;0 0'

      const newAnimateTransform = systemAnimateTransform.cloneNode(true)
      newAnimateTransform.setAttribute('id', 'a' + uuid())
      newAnimateTransform.setAttribute('values', newVal)
      clonedMetaMark.appendChild(newAnimateTransform)
    }

    const wrapper = ftSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
    wrapper.setAttribute('class', 'bw-metamark')
    systemBegin?.appendChild(wrapper)
    wrapper.appendChild(clonedMetaMark)

    setAnimation({
      element: wrapper,
      states: {
        digitalFacsimile: { type: 'opacity', val: '1' },
        writingZone: { type: 'opacity', val: '1' },
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

const isInActiveWritingLayer = (metaMark, ftSvgDom, dtMeiDom, activeSvgLayers) => {
  const metaMarkId = metaMark.getAttribute('data-id')
  const sourceMetaMark = Array.from(dtMeiDom?.querySelectorAll('metaMark[xml\\:id], annot[xml\\:id]') || [])
    .find(element => element.getAttribute('xml:id') === metaMarkId)
  const shapeIds = getFragmentIds(sourceMetaMark?.getAttribute('facs'))

  return shapeIds.some(shapeId => {
    const shape = ftSvgDom.querySelector(`.shapes [id="${shapeId}"]`)
    const writingLayer = getOwningWritingLayer(shape)
    return activeSvgLayers.includes(writingLayer?.getAttribute('id'))
  })
}

const getFragmentIds = (references = '') => String(references)
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map(reference => reference.split('#').pop())
  .filter(Boolean)

const getOwningWritingLayer = (element) => {
  let current = element

  while (current?.nodeType === 1) {
    const classes = String(current.getAttribute('class') || '').split(/\s+/)
    if (current.localName === 'g' && classes.includes('writingLayer')) return current
    current = current.parentNode
  }

  return null
}

/**
 * Finds the ancestor DT system group for a given SVG element.
 * @param {SVGElement} element - SVG element to find the owning DT system for.
 * @returns {SVGElement|null} Owning DT system group element or null if not found.
 */
const getOwningDtSystem = (element) => {
  let current = element

  while (current?.nodeType === 1) {
    const classes = String(current.getAttribute('class') || '').split(/\s+/)
    if (current.localName === 'g' && classes.includes('system') && current.hasAttribute('data-id')) return current
    current = current.parentNode
  }

  return null
}
