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

const isInActiveWritingLayer = (deletion, ftSvgDom, dtMeiDom, activeSvgLayers) => {
  const deletionId = deletion.getAttribute('data-id')
  const sourceDeletion = Array.from(dtMeiDom?.querySelectorAll('del[xml\\:id]') || [])
    .find(element => element.getAttribute('xml:id') === deletionId)
  const shapeIds = getFragmentIds(sourceDeletion?.getAttribute('facs'))

  return shapeIds.some(shapeId => {
    const shape = ftSvgDom.querySelector(`.shapes [id="${shapeId}"]`)
    const writingLayer = getOwningWritingLayer(shape)
    return activeSvgLayers.includes(writingLayer?.getAttribute('id'))
  })
}

const mapPathCoordinates = (path, getNewPos) => String(path || '').replace(/([\d.-]+)[,\s]+([\d.-]+)/g, (match, x, y) => {
  const point = getNewPos({ x: 0, y: 0 }, { x: parseFloat(x), y: parseFloat(y) })
  return `${point.x} ${point.y}`
})

/**
 * Adds DT-only deletions to the fluid transcript for finding and normalization.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG layer.
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG layer.
 * @param {Document} atMeiDom - Annotated transcript MEI DOM.
 * @param {Object} tools - Animation helper bundle.
 * @param {Function} tools.getNewPos - Converts DT coordinates into FT coordinate space.
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer.
 * @param {Document} tools.sourceDtMeiDom - Source DT MEI DOM with deletion facsimile references.
 * @param {string[]} [tools.activeSvgLayers] - Writing-layer SVG IDs active in a preceding genetic state.
 * @returns {void} No return value.
 */
export const liquifyDeletions = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { activeSvgLayers, getNewPos, setAnimation, sourceDtMeiDom } = tools
  const targetLayer = ftSvg.querySelector('.page-margin') || ftSvg

  dtSvg.querySelectorAll('g.del[data-id]').forEach(deletion => {
    if (Array.isArray(activeSvgLayers) && !isInActiveWritingLayer(deletion, ftSvg.ownerDocument, sourceDtMeiDom, activeSvgLayers)) return

    const wrapper = ftSvg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
    wrapper.setAttribute('class', 'bw-deletion')
    const clonedDeletion = deletion.cloneNode(true)
    clonedDeletion.querySelectorAll('path[d]').forEach(path => {
      path.setAttribute('d', mapPathCoordinates(path.getAttribute('d'), getNewPos))
    })
    wrapper.appendChild(clonedDeletion)
    targetLayer.appendChild(wrapper)

    setAnimation({
      element: wrapper,
      referenceId: deletion.getAttribute('data-id'),
      states: {
        digitalFacsimile: { type: 'opacity', val: '0' },
        writingZone: { type: 'opacity', val: '0' },
        finding: { type: 'opacity', val: '1' },
        normalization: { type: 'opacity', val: '1' },
        readingOrder: { type: 'opacity', val: '0' },
        regulation: { type: 'opacity', val: '0' },
        supplements: { type: 'opacity', val: '0' },
        interventions: { type: 'opacity', val: '0' }
      }
    })
  })
}
