export const getTextWidth = (textElement) => {
  const textLength = parseFloat(textElement.getAttribute('textLength'))
  if (Number.isFinite(textLength)) return textLength

  const boundingBox = textElement.querySelector('.bounding-box rect')
  const boundingBoxWidth = parseFloat(boundingBox?.getAttribute('width'))
  return Number.isFinite(boundingBoxWidth) ? boundingBoxWidth : null
}

export const getTextLengthStates = ({ atTextElement, dtTextElement, atPosition, dtPosition, getNewPos }) => {
  const atTextWidth = getTextWidth(atTextElement)
  const dtTextWidth = getTextWidth(dtTextElement)
  if (atTextWidth === null || dtTextWidth === null) return null

  const mappedDtStart = getNewPos(atPosition, dtPosition)
  const mappedDtEnd = getNewPos(atPosition, { x: dtPosition.x + dtTextWidth, y: dtPosition.y })
  const mappedDtWidth = Math.abs(mappedDtEnd.x - mappedDtStart.x)

  return {
    finding: { type: 'textLength', val: `${mappedDtWidth}px` },
    normalization: { type: 'textLength', val: `${mappedDtWidth}px` },
    regulation: { type: 'textLength', val: `${mappedDtWidth}px` },
    supplements: { type: 'textLength', val: `${atTextWidth}px` },
    interventions: { type: 'textLength', val: `${atTextWidth}px` }
  }
}

export const getStaticTextLengthStates = (value) => ({
  finding: { type: 'textLength', val: value },
  normalization: { type: 'textLength', val: value },
  regulation: { type: 'textLength', val: value },
  supplements: { type: 'textLength', val: value },
  interventions: { type: 'textLength', val: value }
})

export const applyTextLengthAnimation = (element, states, setAnimation) => {
  if (!states) return

  element.setAttribute('textLength', states.finding.val)
  setAnimation({ element, states })
}
