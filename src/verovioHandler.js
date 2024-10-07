import { XMLSerializer } from 'xmldom-qsa'

const verovioOptions = {
    scale: 40,
    openControlEvents: true,
    svgBoundingBoxes: true,
    svgRemoveXlink: true,
    svgHtml5: true,
    header: 'none',
    footer: 'none',
    pageMarginTop: 0,
    pageMarginRight: 0,
    pageMarginBottom: 0,
    pageMarginLeft: 0,
    breaks: 'encoded',
    svgAdditionalAttribute: ['staff@rotate', 'staff@height', 'score@viewBox']
  }

export const renderData = (dom, verovio) => {
    const domString = new XMLSerializer().serializeToString(dom)

    verovioOptions.pageHeight = 2320
    verovioOptions.pageWidth = 3050
    verovio.setOptions(verovioOptions)

    const svgString = verovio.renderData(domString, {})
    return svgString
}