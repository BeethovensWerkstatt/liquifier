import { JSDOM } from 'jsdom'
const { XMLSerializer } = new JSDOM().window
const { document } = (new JSDOM(`<!DOCTYPE html><html><body></body></html>`)).window

export const appendNewElement = (parent, name, ns = 'http://www.music-encoding.org/ns/mei') => {
    const elem = parent.appendChild(document.createElementNS(ns, name))
    if (ns === 'http://www.w3.org/2000/svg') {
        elem.setAttribute('id', 's' + uuid())
    } else {
        elem.setAttribute('xml:id', 'x' + uuid())
    }
    return elem
}

/**
 * determines the center of a rendered system
 * @param {} system 
 */
export const getSystemCenter = (measures) => {
    const firstMeasure = measures[0]
    const lastMeasure = measures[measures.length - 1]

    const firstStaffLine = firstMeasure.querySelector('.staff:not(.bounding-box) > path')
    const lastStaffLine = lastMeasure.querySelectorAll('.staff:not(.bounding-box) > path')[4]

    const parseDAttribute = (d) => {
        const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g)
        return commands.map(command => {
            const type = command[0]
            const coords = command.slice(1).trim().split(/[\s,]+/).map(Number)
            return { type, coords }
        })
    }
    const firstPathData = parseDAttribute(firstStaffLine.getAttribute('d'))
    const lastPathData = parseDAttribute(lastStaffLine.getAttribute('d'))
    
    const firstStart = firstPathData[0].coords
    const firstEnd = firstPathData[firstPathData.length - 1].coords
    const lastStart = lastPathData[0].coords
    const lastEnd = lastPathData[lastPathData.length - 1].coords
    
    const allX = [firstStart[0], firstEnd[0], lastStart[0], lastEnd[0]]
    const allY = [firstStart[1], firstEnd[1], lastStart[1], lastEnd[1]]
    
    const topLeftX = Math.min(...allX)
    const topLeftY = Math.min(...allY)
    const bottomRightX = Math.max(...allX)
    const bottomRightY = Math.max(...allY)

    const centerX = (topLeftX + bottomRightX) / 2
    const centerY = (topLeftY + bottomRightY) / 2

    return { x: centerX, y: centerY, left: topLeftX, right: bottomRightX, top: topLeftY, bottom: bottomRightY }
}

const uuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}

export const getPageDimensions = (sourceMEI, transcriptionMEI) => {
    const source = transcriptionMEI.querySelector('source')
    const wzId = source.getAttribute('target').split('#')[1]
    const wzGenDesc = sourceMEI.querySelector('*[xml\\:id="' + wzId + '"]')
    const pageGenDesc = wzGenDesc.parentElement
    const surfaceRef = pageGenDesc.getAttribute('corresp')
    const foliumLike = sourceMEI.querySelector('foliaDesc *[recto="' + surfaceRef + '"], foliaDesc *[verso="' + surfaceRef + '"], foliaDesc *[outer\\.recto="' + surfaceRef + '"], foliaDesc *[inner\\.verso="' + surfaceRef + '"], foliaDesc *[inner\\.recto="' + surfaceRef + '"], foliaDesc *[outer\\.verso="' + surfaceRef + '"]')
    const foliumWidth = parseFloat(foliumLike.getAttribute('width'))
    const foliumHeight = parseFloat(foliumLike.getAttribute('height'))
  
    return { width: foliumWidth, height: foliumHeight }
}

export const getAtSystemCenters = (atSvgDom) => {
    const arr = []

}