import { getTextWidth } from './textAnimation.js'
import { queryDirectChildren } from '../../utils/dom.js'

const createTextRun = (textElement, content, role) => {
  const run = textElement.cloneNode(false)
  run.removeAttribute('textLength')
  run.setAttribute('data-text-role', role)
  const tspan = textElement.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan')
  const fontSize = textElement.querySelector('tspan[font-size]')?.getAttribute('font-size') || '405px'
  tspan.setAttribute('font-size', fontSize)
  tspan.textContent = content
  run.appendChild(tspan)
  return run
}

const getMappedWidth = (dtPosition, dtTextElement, getNewPos) => {
  const dtWidth = getTextWidth(dtTextElement)
  if (dtWidth === null) return null

  const start = getNewPos({ x: 0, y: 0 }, dtPosition)
  const end = getNewPos({ x: 0, y: 0 }, { x: dtPosition.x + dtWidth, y: dtPosition.y })
  return `${Math.abs(end.x - start.x)}px`
}

const getTranslateAtPhase = (element, phaseIndex) => {
  const animation = Array.from(element.childNodes || []).find(child => {
    return child?.nodeType === 1 && child.localName === 'animateTransform' && child.getAttribute('type') === 'translate'
  })
  const value = animation?.getAttribute('values')?.split(';')[phaseIndex]
  const match = String(value || '').trim().match(/^([\d.-]+)\s+([\d.-]+)$/)
  return match ? { x: parseFloat(match[1]), y: parseFloat(match[2]) } : { x: 0, y: 0 }
}

const getInheritedTranslateAtPhase = (element, phaseIndex) => {
  let x = 0
  let y = 0
  let current = element.parentNode

  while (current?.nodeType === 1) {
    const translation = getTranslateAtPhase(current, phaseIndex)
    x += translation.x
    y += translation.y
    current = current.parentNode
  }

  return { x, y }
}

/**
 * Animates AT syllables to their corresponding DT words.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG layer.
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG layer.
 * @param {Document} atMeiDom - Annotated transcript MEI DOM.
 * @param {Object} tools - Animation helper bundle.
 * @param {Function} tools.getNewPos - Converts DT coordinates into FT coordinate space.
 * @param {Map<string, string[]>} tools.correspMappings - AT element id to DT ids mapping.
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer.
 * @returns {void} No return value.
 */
export const liquifyWords = (ftSvg, dtSvg, atMeiDom, { getNewPos, correspMappings, setAnimation }) => {
  ftSvg.querySelectorAll('g.syl:not(.bounding-box)').forEach(syllable => {
    const atId = syllable.getAttribute('data-id')
    const dtId = correspMappings.get(atId)?.[0]
    const atTextElement = syllable.querySelector('text')
    const dtWord = dtId ? dtSvg.querySelector(`g.word[data-id="${dtId}"]`) : null
    const dtTextElement = dtWord?.querySelector('text')

    if (!atTextElement || !dtTextElement) return

    const atPosition = {
      x: parseFloat(atTextElement.getAttribute('x')),
      y: parseFloat(atTextElement.getAttribute('y'))
    }
    const dtPosition = {
      x: parseFloat(dtTextElement.getAttribute('x')),
      y: parseFloat(dtTextElement.getAttribute('y'))
    }
    if (!Number.isFinite(atPosition.x) || !Number.isFinite(atPosition.y) || !Number.isFinite(dtPosition.x) || !Number.isFinite(dtPosition.y)) return

    const mappedPosition = getNewPos({ x: 0, y: 0 }, dtPosition)
    const dtRun = createTextRun(atTextElement, dtTextElement.textContent.trim(), 'diplomatic')
    const atRun = createTextRun(atTextElement, atTextElement.textContent.trim(), 'annotated')
    const mappedWidth = getMappedWidth(dtPosition, dtTextElement, getNewPos)
    if (mappedWidth) dtRun.setAttribute('textLength', mappedWidth)

    syllable.replaceChild(atRun, atTextElement)
    syllable.insertBefore(dtRun, atRun)

    const inheritedTranslation = getInheritedTranslateAtPhase(syllable, 2)
    const dtOffset = `${mappedPosition.x - atPosition.x - inheritedTranslation.x} ${mappedPosition.y - atPosition.y - inheritedTranslation.y}`
    setAnimation({
      element: syllable,
      states: {
        finding: { type: 'translate', val: dtOffset },
        normalization: { type: 'translate', val: dtOffset },
        regulation: { type: 'translate', val: '0 0' },
        supplements: { type: 'translate', val: '0 0' },
        interventions: { type: 'translate', val: '0 0' }
      }
    })
    setAnimation({
      element: dtRun,
      states: {
        finding: { type: 'opacity', val: '1' },
        normalization: { type: 'opacity', val: '1' },
        regulation: { type: 'opacity', val: '0' },
        supplements: { type: 'opacity', val: '0' },
        interventions: { type: 'opacity', val: '0' }
      }
    })
    setAnimation({
      element: atRun,
      states: {
        finding: { type: 'opacity', val: '0' },
        normalization: { type: 'opacity', val: '0' },
        regulation: { type: 'opacity', val: '1' },
        supplements: { type: 'opacity', val: '1' },
        interventions: { type: 'opacity', val: '1' }
      }
    })

    // hyphen connectors (rendered by Verovio as a bare <rect> for con="d" syllables) have no
    // DT equivalent - in the DT they would just be a dash within the word's text - so they
    // must follow the AT text run's visibility instead of staying statically visible
    queryDirectChildren(syllable, 'rect').forEach(hyphen => {
      setAnimation({
        element: hyphen,
        states: {
          finding: { type: 'opacity', val: '0' },
          normalization: { type: 'opacity', val: '0' },
          regulation: { type: 'opacity', val: '1' },
          supplements: { type: 'opacity', val: '1' },
          interventions: { type: 'opacity', val: '1' }
        }
      })
    })
  })
}
