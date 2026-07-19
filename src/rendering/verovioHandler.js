import { DOMParser, XMLSerializer } from 'xmldom-qsa'
import { constants } from '../config.mjs'
import { fixScoreDefChildIds } from '../preparation/annotatedTranscripts.js'

const verovioOptions = {
  scale: 30,
  openControlEvents: true,
  svgBoundingBoxes: true,
  svgRemoveXlink: true,
  svgHtml5: true,
  header: 'none',
  footer: 'none',
  breaks: 'encoded',
  svgAdditionalAttribute: ['staff@rotate', 'staff@height', 'score@viewBox', 'sb@rotate', 'chord@stem.dir', 'pb@corresp']
}

/**
 * Renders continuous at.
 *
 * @param {Document} dom - Source document used by this function.
 * @param {Object} verovio - Verovio toolkit instance.
 * @param {Object} target - Input object used by this function.
 * @param {{width?: number, height?: number}} pageDimensions - Rendering page dimensions.
 * @param {Object} extraOptions - Input object used by this function.
 * @returns {void} No return value.
 */
export const renderContinuousAt = (dom, verovio, target, pageDimensions, extraOptions = {}) => {
  const domString = new XMLSerializer().serializeToString(dom)

  const options = {
    ...verovioOptions,
    pageHeight: pageDimensions.height * constants.verovioGeneralScaling,
    pageWidth: pageDimensions.width * constants.verovioGeneralScaling
  }

  if (target === 'annotated') {
    options.breaks = 'none'
    options.pageMarginTop = 300
    options.pageMarginRight = 500
    options.pageMarginBottom = 300
    options.pageMarginLeft = 100
  }

  verovio.setOptions({ ...options, ...extraOptions })

  const svgString = verovio.renderData(domString, {})

  const svgDom = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  fixScoreDefChildIds(svgDom, dom)
  const fixedSvgString = new XMLSerializer().serializeToString(svgDom)

  return fixedSvgString
}

/**
 * Renders midi.
 *
 * @param {Document} dom - Source document used by this function.
 * @param {Object} verovio - Verovio toolkit instance.
 * @param {Object} extraOptions - Additional Verovio options to apply before rendering (e.g. choiceXPathQuery).
 * @returns {string} Resulting string.
 */
export const renderMidi = (dom, verovio, extraOptions = {}) => {
  // this is necessary to reset Verovio's choiceXPathQuery – it will just add the new otherwise
  verovio.resetOptions()
  if (Object.keys(extraOptions).length > 0) {
    verovio.setOptions(extraOptions)
  }

  const domString = new XMLSerializer().serializeToString(dom)
  verovio.loadData(domString)
  const midi64 = verovio.renderToMIDI()
  return Buffer.from(midi64, 'base64')
}
