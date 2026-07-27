import { prepareEditedAtDom } from './editedAnnotatedTranscripts.js'
import { prepareAtForVerovio, addSystemLabelBlocks } from './annotatedTranscripts.js'
import { adjustAtStaffLines } from './fluidTranscripts.js'
import { renderContinuousAt } from '../rendering/verovioHandler.js'
import { DOMParser } from 'xmldom-qsa'

/**
 * Prepares an annotated transcript for fluid-transcript animation.
 *
 * @param {Object} params - Preparation parameters.
 * @param {Document} params.atDom - Annotated transcript to prepare.
 * @param {Document} params.dtDom - Diplomatic transcript for normalization context.
 * @param {Document} params.sourceDom - Source MEI document.
 * @param {Document|null} params.reconstructionDom - Optional reconstruction context.
 * @param {Object} params.verovio - Verovio toolkit instance.
 * @param {Object} params.pageDimensions - Page dimensions for rendering.
 * @param {Object} params.layoutInfo - Fluid layout information.
 * @param {Object} params.triple - File-path metadata.
 * @returns {{atSvgDom: Document, atRegSvgDom: Document, editedAtDom: Document}} Prepared AT forms.
 */
export const prepareAtForFluidTranscript = ({ atDom, dtDom, sourceDom, reconstructionDom, verovio, pageDimensions, layoutInfo, triple }) => {
  const editedAtDom = prepareEditedAtDom(atDom, dtDom)
  editedAtDom.querySelectorAll('annot[class="#bw_writingZoneBegin"]').forEach(annot => {
    annot.setAttribute('type', 'writingZoneBegin')
  })
  prepareAtForVerovio(editedAtDom)

  const renderAt = (choiceXPath) => {
    const vrvOptions = {
      breaks: 'none',
      mmOutput: true,
      unit: layoutInfo.pages.find(page => page.current).vrvMeiUnit,
      scale: 100,
      svgBoundingBoxes: false,
      choiceXPathQuery: choiceXPath
    }
    verovio.resetOptions()
    const atSvgString = renderContinuousAt(editedAtDom, verovio, 'fluid', pageDimensions, vrvOptions)
    return new DOMParser().parseFromString(atSvgString, 'image/svg+xml')
  }

  const atSvgDom = addSystemLabelBlocks(renderAt('./orig'), editedAtDom, dtDom, sourceDom, reconstructionDom, triple)
  const atRegSvgDom = addSystemLabelBlocks(renderAt('./reg'), editedAtDom, dtDom, sourceDom, reconstructionDom, triple)
  adjustAtStaffLines(atSvgDom, editedAtDom)
  adjustAtStaffLines(atRegSvgDom, editedAtDom)

  return { atSvgDom, atRegSvgDom, editedAtDom }
}
