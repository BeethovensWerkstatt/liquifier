import { appendNewElement, closestElement } from '../dom.js'
import { constants } from '../../config.mjs'

const addTransformTranslate = (node, values = []) => {
  if (values.length === 0) return

  const hasOnlyZeroTranslateValues = values.every(value => {
    const match = String(value || '').trim().match(/^([\d.-]+)[,\s]+([\d.-]+)$/)
    if (!match) return false

    const x = parseFloat(match[1])
    const y = parseFloat(match[2])
    return Number.isFinite(x) && Number.isFinite(y) && x === 0 && y === 0
  })

  if (hasOnlyZeroTranslateValues) return

  const anim = appendNewElement(node, 'animateTransform', 'http://www.w3.org/2000/svg')
  anim.setAttribute('attributeName', 'transform')
  anim.setAttribute('attributeType', 'XML')
  anim.setAttribute('type', 'translate')

  const reverse = constants.ftRendererReverseAnimations ? values.slice(0, -1).reverse() : []
  anim.setAttribute('values', values.concat(reverse).join(';'))
  anim.setAttribute('repeatCount', constants.ftRendererAnimationRepeatCount)
  anim.setAttribute('dur', constants.ftRendererAnimationDuration)
}

export const addTransform = (node, attribute, values = []) => {
  const anim = appendNewElement(node, 'animate', 'http://www.w3.org/2000/svg')
  anim.setAttribute('attributeName', attribute)

  const reverse = constants.ftRendererReverseAnimations ? values.slice(0, -1).reverse() : []
  anim.setAttribute('values', values.concat(reverse).join(';'))
  anim.setAttribute('repeatCount', constants.ftRendererAnimationRepeatCount)
  anim.setAttribute('dur', constants.ftRendererAnimationDuration)
}

function resolveAtIdForClassification (element) {
  if (!element) return null

  const ownId = element.getAttribute?.('data-id')
  if (ownId) return ownId

  const ancestorId = closestElement(element, '[data-id]')?.getAttribute?.('data-id')
  if (ancestorId) return ancestorId

  return null
}

function applyClassificationClass (element, className) {
  if (!element || !className) return

  const classes = (element.getAttribute('class') || '')
    .split(/\s+/)
    .filter(Boolean)
    .filter(classToken => classToken !== 'supplied' && classToken !== 'otherWz')

  classes.push(className)
  element.setAttribute('class', classes.join(' '))
}

function resolveUnmatchedClassForElement (element, unmatchedClassByAtId) {
  const atId = resolveAtIdForClassification(element)
  if (!atId) return 'supplied'
  return unmatchedClassByAtId.get(atId) || 'supplied'
}

function normalizeFileBasename (value = '') {
  const normalized = String(value).trim().replace(/\\/g, '/')
  if (!normalized) return ''
  const parts = normalized.split('/')
  return parts[parts.length - 1] || ''
}

function parseCorrespToken (token = '') {
  const normalized = String(token).trim()
  if (!normalized || !normalized.includes('#')) return null

  const hashIndex = normalized.indexOf('#')
  const fileRef = hashIndex > 0 ? normalized.slice(0, hashIndex).trim() : ''
  const targetId = normalized.slice(hashIndex + 1).trim()
  if (!targetId) return null

  return { fileRef, targetId }
}

function isDiplomaticCorrespReference (fileRef = '') {
  if (fileRef === '') return true
  return fileRef.includes('/diplomaticTranscripts/') || fileRef.endsWith('_dt.xml')
}

function isCurrentDtReference (fileRef = '', currentDtBasename = '') {
  if (fileRef === '') return true
  if (!currentDtBasename) return true
  return normalizeFileBasename(fileRef) === currentDtBasename
}

function extractCorrespContext (atMeiDom, { currentDtReference = '' } = {}) {
  const correspMappings = new Map()
  const unmatchedClassByAtId = new Map()
  const currentDtBasename = normalizeFileBasename(currentDtReference)

  atMeiDom.querySelectorAll('[corresp]').forEach(element => {
    const atId = element.getAttribute('xml:id')
    const corresp = element.getAttribute('corresp')
    if (!atId || !corresp) return

    const currentDtIds = []
    let hasForeignDtReference = false

    corresp
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .forEach(token => {
        const parsed = parseCorrespToken(token)
        if (!parsed) return

        const { fileRef, targetId } = parsed
        if (!isDiplomaticCorrespReference(fileRef)) return

        if (isCurrentDtReference(fileRef, currentDtBasename)) {
          currentDtIds.push(targetId)
        } else {
          hasForeignDtReference = true
        }
      })

    const uniqueCurrentDtIds = Array.from(new Set(currentDtIds))
    if (uniqueCurrentDtIds.length > 0) {
      correspMappings.set(atId, uniqueCurrentDtIds)
      return
    }

    if (hasForeignDtReference) {
      unmatchedClassByAtId.set(atId, 'otherWz')
    }
  })

  return { correspMappings, unmatchedClassByAtId }
}

function setAnimationForFtWithAssets (descriptor, unmatchedClassByAtId = new Map()) {
  const { element, states } = descriptor

  const digitalFacsimile = states.digitalFacsimile || states.finding || null
  const writingZone = states.writingZone || digitalFacsimile || states.finding || null
  const finding = states.finding || null
  const normalization = states.normalization || finding
  const readingOrder = states.readingOrder || normalization
  const regulation = states.regulation || states.supplements || states.interventions || normalization
  const supplements = states.supplements || regulation
  const interventions = states.interventions || supplements

  const allStates = [digitalFacsimile, writingZone, finding, normalization, readingOrder, regulation, supplements, interventions]
  const hasNullStates = allStates.some(state => state === null)
  const validStates = allStates.filter(state => state !== null)

  if (validStates.length === 0) return

  const animationType = validStates[0].type

  if (hasNullStates && animationType !== 'opacity') {
    const introVisibilityStates = [null, null, finding, normalization, readingOrder, regulation, supplements, interventions]
    const opacityValues = introVisibilityStates.map(state => (state === null ? '0' : '1'))
    element.setAttribute('opacity', opacityValues[0])

    if (finding === null || normalization === null) {
      const unmatchedClass = resolveUnmatchedClassForElement(element, unmatchedClassByAtId)
      applyClassificationClass(element, unmatchedClass)
      if (unmatchedClass === 'supplied') {
        opacityValues[5] = '0'
        element.setAttribute('fill', '#999999')
        element.setAttribute('stroke', '#999999')
      } else if (unmatchedClass === 'otherWz') {
        element.setAttribute('fill', '#555555')
        element.setAttribute('stroke', '#555555')
      }
    }

    addTransform(element, 'opacity', opacityValues)
  }

  const values = allStates.map(state => {
    if (state === null) {
      if (animationType === 'translate') return '0 0'
      if (animationType === 'opacity') return '0'
      return ''
    }
    return state.val
  })

  if (animationType === 'translate') {
    addTransformTranslate(element, values)
  } else {
    addTransform(element, animationType, values)
  }
}

export const prepareAssets = ({
  ftSvgDom,
  atLayer,
  dtLayer,
  atMeiDom,
  atRegSvgDom,
  currentDtReference,
  atScaling,
  atHorizontalPosition,
  atVerticalShift,
  logger
}) => {
  const { correspMappings, unmatchedClassByAtId } = extractCorrespContext(atMeiDom, {
    currentDtReference
  })

  const getAtContentOffset = () => {
    const pageMargin = atLayer.querySelector('.page-margin')
    const transform = pageMargin?.getAttribute('transform') || ''
    const match = transform.match(/translate\(\s*([\d.-]+)(?:\s*,\s*|\s+)([\d.-]+)\s*\)/)

    if (!match) {
      return { x: 0, y: 0 }
    }

    return {
      x: parseFloat(match[1]) || 0,
      y: parseFloat(match[2]) || 0
    }
  }

  const atContentOffset = getAtContentOffset()

  const setLayerOpacity = (element, values) => {
    if (!element) return
    element.setAttribute('opacity', values[0])
    addTransform(element, 'opacity', values)
  }

  setLayerOpacity(ftSvgDom.querySelector('.facsimileBg'), constants.ftAssetPhaseOpacityValues.facsimileBg)
  setLayerOpacity(ftSvgDom.querySelector('.shapes'), constants.ftAssetPhaseOpacityValues.shapes)
  setLayerOpacity(dtLayer, constants.ftAssetPhaseOpacityValues.diplomatic)
  setLayerOpacity(atLayer, constants.ftAssetPhaseOpacityValues.transcription)

  const getNewPos = (at = { x: 0, y: 0 }, dt = { x: 0, y: 0 }) => {
    const newPos = {
      x: Math.round(((dt.x - atHorizontalPosition) / atScaling) - atContentOffset.x),
      y: Math.round(((dt.y - atVerticalShift) / atScaling) - atContentOffset.y)
    }

    logger.debug(`[Position Diff] AT: (${at.x}, ${at.y}), DT: (${dt.x}, ${dt.y}) => newPos: (${newPos.x}, ${newPos.y})`)
    return newPos
  }

  const convertD = (atD, dtD) => {
    const atCoords = []
    const dtCoords = []
    const coordRegex = /([-\d.]+)[,\s]+([-\d.]+)/g

    let match
    while ((match = coordRegex.exec(atD)) !== null) {
      atCoords.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) })
    }

    coordRegex.lastIndex = 0
    while ((match = coordRegex.exec(dtD)) !== null) {
      dtCoords.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) })
    }

    const newCoords = atCoords.map((atPos, index) => {
      const dtPos = dtCoords[index] || atPos
      return getNewPos(atPos, dtPos)
    })

    let coordIndex = 0
    return atD.replace(coordRegex, () => {
      const coord = newCoords[coordIndex++]
      return `${coord.x} ${coord.y}`
    })
  }

  const applyUnmatchedClass = (element) => {
    const atId = resolveAtIdForClassification(element)
    const className = atId ? (unmatchedClassByAtId.get(atId) || 'supplied') : 'supplied'
    applyClassificationClass(element, className)
    return className
  }

  return {
    getNewPos,
    convertD,
    scaleFactor: atScaling !== 0 ? (1 / atScaling) : 1,
    correspMappings,
    stateModel: 'fluidTranscripts',
    atMeiDom,
    atRegSvgDom,
    applyUnmatchedClass,
    setAnimation: descriptor => setAnimationForFtWithAssets(descriptor, unmatchedClassByAtId),
    logger
  }
}
