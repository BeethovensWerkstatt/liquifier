import { appendNewElement } from '../../utils/dom.js'

const regulationSelectors = [
  'g.rest:not(.bounding-box)',
  'g.mRest:not(.bounding-box)',
  'g.accid:not(.bounding-box)',
  'g.keyAccid:not(.bounding-box)',
  'g.dots:not(.bounding-box)',
  'g.dot:not(.bounding-box)',
  'g.artic:not(.bounding-box)',
  'g.clef:not(.bounding-box)',
  'g.keySig:not(.bounding-box)',
  'g.meterSig:not(.bounding-box)',
  'g.barLine:not(.bounding-box)',
  'g.tupletNum:not(.bounding-box)',
  'g.bTrem:not(.bounding-box)',
  'g.fTrem:not(.bounding-box)',
  'g.slur:not(.bounding-box)',
  'g.tie:not(.bounding-box)',
  'g.curve:not(.bounding-box)',
  'g.hairpin:not(.bounding-box)',
  'g.dir:not(.bounding-box)',
  'g.dynam:not(.bounding-box)',
  'g.tempo:not(.bounding-box)',
  'g.pedal:not(.bounding-box)',
  'g.fing:not(.bounding-box)',
  'g.syl:not(.bounding-box)',
  'g.fermata:not(.bounding-box)',
  'g.trill:not(.bounding-box)',
  'g.octave:not(.bounding-box)',
  'g.repeat:not(.bounding-box)',
  'g.mRpt:not(.bounding-box)',
  'g.halfmRpt:not(.bounding-box)',
  'g.beatRpt:not(.bounding-box)',
  'g.gliss:not(.bounding-box)'
]

/**
 * Shift independent notation from its orig-rendered position to its separately
 * rendered reg position in the interventions phase.
 *
 * A nested wrapper keeps this layout animation separate from the element's
 * existing DT-to-AT animation, which may already animate the outer element.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {SVGElement} dtSvg - Diplomatic transcription SVG (unused; retained for the liquify API).
 * @param {Document} atMeiDom - Annotated MEI DOM (unused; retained for the liquify API).
 * @param {Object} tools - Animation helper bundle.
 * @param {Document} tools.atRegSvgDom - AT SVG rendered with choices resolved to reg.
 * @param {Function} tools.setAnimation - Writes phase-aware animation descriptors.
 * @returns {void}
 */
export function liquifyRegulationLayout (ftSvg, dtSvg, atMeiDom, tools) {
  const { atRegSvgDom, setAnimation } = tools
  if (!atRegSvgDom) return

  ftSvg.querySelectorAll(regulationSelectors.join(', ')).forEach(element => {
    if (element.getAttribute('data-bw-regulation-layout') === 'true') return

    const id = element.getAttribute('data-id')
    if (!id) return

    const regElement = findMatchingRegElement(atRegSvgDom, element, id)
    const origPosition = getElementPosition(element)
    const regPosition = getElementPosition(regElement)
    if (!origPosition || !regPosition) return

    const dx = regPosition.x - origPosition.x
    const dy = regPosition.y - origPosition.y
    if (dx === 0 && dy === 0) return

    const wrapper = wrapContents(element)
    wrapper.setAttribute('data-bw-regulation-layout', 'true')
    element.setAttribute('data-bw-regulation-layout', 'true')

    setAnimation({
      element: wrapper,
      states: {
        finding: { type: 'translate', val: '0 0' },
        normalization: { type: 'translate', val: '0 0' },
        readingOrder: { type: 'translate', val: '0 0' },
        regulation: { type: 'translate', val: '0 0' },
        supplements: { type: 'translate', val: '0 0' },
        interventions: { type: 'translate', val: `${dx} ${dy}` }
      }
    })
  })
}

function findMatchingRegElement (atRegSvgDom, element, id) {
  const classNames = new Set((element.getAttribute('class') || '').split(/\s+/).filter(Boolean))
  return Array.from(atRegSvgDom.querySelectorAll('g'))
    .filter(candidate => candidate.getAttribute('data-id') === id)
    .find(candidate => {
      const candidateClasses = (candidate.getAttribute('class') || '').split(/\s+/)
      return candidateClasses.some(className => classNames.has(className))
    }) || null
}

function getElementPosition (element) {
  if (!element) return null

  const anchor = element.querySelector('use, text, path, polygon, polyline')
  if (!anchor) return null

  const translate = (anchor.getAttribute('transform') || '').match(/translate\(\s*([\d.-]+)[,\s]+([\d.-]+)\s*\)/)
  if (translate) return { x: parseFloat(translate[1]), y: parseFloat(translate[2]) }

  const x = parseFloat(anchor.getAttribute('x') || anchor.getAttribute('cx'))
  const y = parseFloat(anchor.getAttribute('y') || anchor.getAttribute('cy'))
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }

  const pathStart = (anchor.getAttribute('d') || '').match(/M\s*([\d.-]+)[,\s]+([\d.-]+)/)
  if (pathStart) return { x: parseFloat(pathStart[1]), y: parseFloat(pathStart[2]) }

  const polygonStart = (anchor.getAttribute('points') || '').match(/^\s*([\d.-]+),([\d.-]+)/)
  if (polygonStart) return { x: parseFloat(polygonStart[1]), y: parseFloat(polygonStart[2]) }

  return null
}

function wrapContents (element) {
  const wrapper = appendNewElement(element, 'g', 'http://www.w3.org/2000/svg')
  const children = Array.from(element.childNodes || [])
  children.forEach(child => {
    if (child !== wrapper && !(child.nodeType === 1 && (child.localName === 'animate' || child.localName === 'animateTransform'))) {
      wrapper.appendChild(child)
    }
  })
  return wrapper
}
