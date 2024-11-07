import { XMLSerializer } from 'xmldom-qsa'
import { verovioPixelDensity } from './config.mjs'

const verovioOptions = {
    scale: 40,
    openControlEvents: true,
    svgBoundingBoxes: true,
    svgRemoveXlink: true,
    svgHtml5: true,
    header: 'none',
    footer: 'none',
    breaks: 'encoded',
    svgAdditionalAttribute: ['staff@rotate', 'staff@height', 'score@viewBox']
  }



export const renderData = (dom, verovio, target, pageDimensions) => {
    const domString = new XMLSerializer().serializeToString(dom)

    verovioOptions.pageHeight = pageDimensions.height * verovioPixelDensity
    verovioOptions.pageWidth = pageDimensions.width * verovioPixelDensity

    if (target === 'diplomatic') {
      verovioOptions.breaks = 'encoded'
      verovioOptions.pageMarginTop = 0
      verovioOptions.pageMarginRight = 0
      verovioOptions.pageMarginBottom = 0
      verovioOptions.pageMarginLeft = 0

      // console.log('\n\n\nfacsimile:', new XMLSerializer().serializeToString(dom.querySelector('surface')))

    } else if (target === 'annotated') {
      verovioOptions.breaks = 'none'
      verovioOptions.pageMarginTop = 300
      verovioOptions.pageMarginRight = 300
      verovioOptions.pageMarginBottom = 300
      verovioOptions.pageMarginLeft = 300
    }

    verovio.setOptions(verovioOptions)

    const svgString = verovio.renderData(domString, {})
    return svgString
}