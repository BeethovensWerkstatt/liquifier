import { XMLSerializer } from 'xmldom-qsa'
import { verovioPixelDensity } from '../config.mjs'

const verovioOptions = {
  scale: 30,
  openControlEvents: true,
  svgBoundingBoxes: true,
  svgRemoveXlink: true,
  svgHtml5: true,
  header: 'none',
  footer: 'none',
  breaks: 'encoded',
  svgAdditionalAttribute: ['staff@rotate', 'staff@height', 'score@viewBox', 'sb@rotate', 'chord@stem.dir']
}

export const renderContinuousAt = (dom, verovio, target, pageDimensions) => {
  const domString = new XMLSerializer().serializeToString(dom)

  verovioOptions.pageHeight = pageDimensions.height * verovioPixelDensity
  verovioOptions.pageWidth = pageDimensions.width * verovioPixelDensity

  if (target === 'annotated') {
    verovioOptions.breaks = 'none'
    verovioOptions.pageMarginTop = 300
    verovioOptions.pageMarginRight = 500
    verovioOptions.pageMarginBottom = 300
    verovioOptions.pageMarginLeft = 100
  }

  verovio.setOptions(verovioOptions)

  const svgString = verovio.renderData(domString, {})
  return svgString
}

export const renderSystemBasedAt = (dom, verovio, pageDimensions) => {
  // Clone the DOM to avoid modifying the original
  const modifiedDom = dom.cloneNode(true)

  // Extract system breaks with corresp attributes before modification
  const systemBreaks = Array.from(modifiedDom.querySelectorAll('sb[corresp]'))
  const systemIds = systemBreaks.map(sb => {
    const corresp = sb.getAttribute('corresp')
    // Extract just the system ID after the # (corresp format: ../path/file.xml#systemId)
    if (corresp && corresp.includes('#')) {
      return corresp.split('#')[1]
    }
    return null
  }).filter(id => id)

  // Remove all existing <pb> elements
  const pageBreaks = modifiedDom.querySelectorAll('pb')
  pageBreaks.forEach(pb => pb.parentNode.removeChild(pb))

  // Rename all <sb> elements to <pb> (preserving attributes including @corresp)
  const allSystemBreaks = modifiedDom.querySelectorAll('sb')
  allSystemBreaks.forEach(sb => {
    const pb = modifiedDom.createElement('pb')
    // Copy all attributes
    Array.from(sb.attributes).forEach(attr => {
      pb.setAttribute(attr.name, attr.value)
    })
    sb.parentNode.replaceChild(pb, sb)
  })

  // Serialize modified DOM
  const domString = new XMLSerializer().serializeToString(modifiedDom)

  // Set up Verovio options for system-based rendering
  const systemOptions = {
    ...verovioOptions,
    breaks: 'encoded',
    pageHeight: pageDimensions.height * verovioPixelDensity,
    pageWidth: pageDimensions.width * verovioPixelDensity,
    pageMarginTop: 300,
    pageMarginRight: 500,
    pageMarginBottom: 300,
    pageMarginLeft: 100
  }

  verovio.setOptions(systemOptions)
  verovio.loadData(domString)

  // Get the number of pages (= systems)
  const pageCount = verovio.getPageCount()

  // Render each page and pair with system ID
  const systemSvgs = []
  for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
    const svgString = verovio.renderToSVG(pageNo)
    const systemId = systemIds[pageNo - 1] // pageNo is 1-indexed

    systemSvgs.push({
      systemId,
      svg: svgString
    })
  }

  return systemSvgs
}

export const renderMidi = (dom, verovio) => {
  const domString = new XMLSerializer().serializeToString(dom)
  verovio.loadData(domString)
  const midi64 = verovio.renderToMIDI()
  return Buffer.from(midi64, 'base64')
}
