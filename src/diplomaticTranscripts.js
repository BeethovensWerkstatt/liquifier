import { JSDOM } from 'jsdom'
import { appendNewElement } from './utils.js'
import { verovioPixelDensity } from './config.mjs'
const { DOMParser, XMLSerializer } = new JSDOM().window
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)

export const prepareDtForRendering = ({ dtDom, atDom, sourceDom }, pageDimensions) => {
    // wzDetails
    // dtDoc
    // emptyPage
    // osdRects
    // currentPageInfo

    // TODO: verify the inputs are proper XML documents
    const outDom = new DOMParser().parseFromString('<music xmlns="http://www.music-encoding.org/ns/mei"><facsimile type="transcription"><surface/></facsimile><body><mdiv><score><scoreDef><staffGrp/></scoreDef><section></section></score></mdiv></body></music>', 'text/xml')
        
    try {
        /* const requiredStaves = []
        dtDom.querySelectorAll('staffDef').forEach(staffDef => {
          requiredStaves.push(staffDef.getAttribute('label'))
        }) */
    
        const writingZoneGenDescId = dtDom.querySelector('source').getAttribute('target').split('#')[1]
        const writingZoneGenDesc = sourceDom.querySelector('genDesc[xml\\:id="' + writingZoneGenDescId + '"]')
        const surface = sourceDom.querySelector('surface[xml\\:id="' + writingZoneGenDesc.closest('genDesc[class="#geneticOrder_pageLevel"]').getAttribute('corresp').substring(1) + '"]')
        // const writingZoneZone = surface.querySelectorAll('zone').values().find(z => writingZoneGenDesc.getAttribute('xml:id') === z.getAttribute('data').substring(1))

        const layout = sourceDom.querySelector('layout[xml\\:id="' + surface.getAttribute('decls').substring(1) + '"]')
        const foliumLike = sourceDom.querySelectorAll('foliaDesc > *').values().find(f => {
            const ref = '#' + surface.getAttribute('xml:id')
            return f.getAttribute('recto') === ref || f.getAttribute('verso') === ref || f.getAttribute('outer.recto') === ref || f.getAttribute('inner.verso') === ref || f.getAttribute('inner.recto') === ref || f.getAttribute('outer.verso') === ref
        })
        
        /* const iiifUri = surface.querySelector('graphic[type="facsimile"]').getAttribute('target')
        const mediaFragRaw = iiifUri.split('#xywh=')[1].split('&rotate=')[0]
        const pageRotateDeg = iiifUri.indexOf('&rotate=') !== -1 ? parseFloat(iiifUri.split('&rotate=')[1].split(',')[0]) : 0
        
        const mediaFragPix = {
            x: parseFloat(mediaFragRaw.split(',')[0]),
            y: parseFloat(mediaFragRaw.split(',')[1]),
            w: parseFloat(mediaFragRaw.split(',')[2]),
            h: parseFloat(mediaFragRaw.split(',')[3]),
            rotate: pageRotateDeg
        }
        */
        const pageMM = {
            x: 0,
            y: 0,
            w: parseFloat(foliumLike.getAttribute('width')),
            h: parseFloat(foliumLike.getAttribute('height'))
        }
        
        // Verovio uses a default of 9px per vu. This is used as factor for Verovio coordinate space
        const factor = verovioPixelDensity // 9
        
        const outSurface = outDom.querySelector('surface')
        outSurface.setAttribute('lrx', pageMM.w * factor)
        outSurface.setAttribute('lry', pageMM.h * factor)

        const outStaffGrp = outDom.querySelector('staffGrp')
        const outSection = outDom.querySelector('section')

        const defaultRastrumHeight = factor * 8 // 8vu = 72px

        dtDom.querySelectorAll('scoreDef staffDef').forEach(dtStaffDef => {
            const staffDef = outStaffGrp.appendChild(dtStaffDef.cloneNode(true))

            const rastrumIDs = staffDef.getAttribute('decls').split(' ').map(ref => ref.split('#')[1])
            const rastrums = [...layout.querySelectorAll('rastrum')].filter(r => { 
                return rastrumIDs.indexOf(r.getAttribute('xml:id')) !== -1
            })
            const scale = (100 / defaultRastrumHeight * parseFloat(rastrums[0].getAttribute('system.height')) * factor).toFixed(1) + '%'
            // console.log('\n------setting scale to ' + scale)
            staffDef.setAttribute('scale', scale)
        })

        dtDom.querySelectorAll('section > *').forEach(dtNode => {
            const node = outSection.appendChild(dtNode.cloneNode(true))
            const name = node.localName
            
            if (name === 'pb') {
                const pageZone = appendNewElement(outSurface, 'zone')
                pageZone.setAttribute('type', 'pb')
                pageZone.setAttribute('lrx', (pageMM.w * factor).toFixed(1))
                pageZone.setAttribute('lry', (pageMM.h * factor).toFixed(1))
                pageZone.setAttribute('ulx', 0)
                pageZone.setAttribute('uly', 0)
                node.setAttribute('facs', '#' + pageZone.getAttribute('xml:id'))           
            } else if (name === 'sb') {
                const systemZone = appendNewElement(outSurface, 'zone')
                const rastrumIDs = node.getAttribute('corresp').split(' ').map(ref => ref.split('#')[1])
                const rastrums = [...layout.querySelectorAll('rastrum')].filter(r => { 
                    return rastrumIDs.indexOf(r.getAttribute('xml:id')) !== -1
                })
                let x = pageMM.w
                let y = pageMM.h
                let x2 = 0
                const rotates = []
                rastrums.forEach(rastrum => {
                    const rx = parseFloat(rastrum.getAttribute('system.leftmar'))
                    const ry = parseFloat(rastrum.getAttribute('system.topmar'))
                    const rw = parseFloat(rastrum.getAttribute('width')) + rx
                    x = Math.min(rx, x)
                    y = Math.min(ry, y)
                    x2 = Math.max(rw, x2)
                    rotates.push(rastrum.getAttribute('rotate'))
                })

                systemZone.setAttribute('type', 'sb')
                systemZone.setAttribute('ulx', (x * factor).toFixed(1))
                // systemZone.setAttribute('lrx', (x2 * factor).toFixed(1))
                systemZone.setAttribute('bw.rastrumIDs', rastrumIDs.join(' '))
                systemZone.setAttribute('uly', (y * factor).toFixed(1)) // todo: how to determine sb/@uly properly? This is not the same as staff/@uly!!!!
                node.setAttribute('facs', '#' + systemZone.getAttribute('xml:id'))
                node.setAttribute('rotate', rotates.join(' '))
                // console.log('sb: ', new XMLSerializer().serializeToString(node))
            } else if (name === 'measure') {
                const measureZone = appendNewElement(outSurface, 'zone')
                measureZone.setAttribute('type', 'measure')

                let measureX = pageMM.w * factor
                let measureX2 = 0
                const content = node.querySelectorAll('*').forEach(child => {
                    if (child.hasAttribute('x')) {
                        const x = parseFloat(child.getAttribute('x')) * factor
                        measureX = Math.min(measureX, x)
                        measureX2 = Math.max(measureX2, x)
                    }
                    if (child.hasAttribute('x2')) {
                        const x = parseFloat(child.getAttribute('x2')) * factor
                        measureX2 = Math.max(measureX2, x)
                    }
                    
                    const childName = child.localName
                    const supportedElements = ['note', 'staff', 'accid', 'chord', 'rest', 'barLine']
                    const ignoreElements = ['layer']
                   
                    if (supportedElements.indexOf(childName) !== -1) {
                        const childZone = appendNewElement(outSurface, 'zone')
                        childZone.setAttribute('type', childName)
                        
                        if (childName === 'note' || childName === 'accid' || childName === 'barLine') {
                            const ownX = child.hasAttribute('x') ? parseFloat(child.getAttribute('x')) * factor : parseFloat(child.parentNode.getAttribute('x')) * factor
                            // const fixOwnX = childName === 'barLine' ? ownX * 2 : ownX
                            const sbZone = getSbZone(childZone)
                            const systemX = parseFloat(sbZone.getAttribute('ulx'))
                            childZone.setAttribute('ulx', (ownX + systemX).toFixed(1))

                            // this is necessary to distinguish these barlines from ones auto-generated by Verovio
                            if (childName === 'barLine') {
                                child.setAttribute('type', 'data')
                            }
                            // childZone.setAttribute('ulx', (parseFloat(child.getAttribute('x')) * factor).toFixed(1))
                        } else if (childName === 'staff') {
                            const staffN = parseInt(child.getAttribute('n'))
                            const getSbZone = (node) => {
                                let sibling = node
                                while (sibling) {
                                    if (sibling.hasAttribute('type') && sibling.getAttribute('type') === 'sb') { //sibling.matches('[type="sb"]')) {
                                        return sibling // Found the matching sibling
                                    }
                                    sibling = sibling.previousElementSibling // Move to the next preceding sibling
                                }
                                return null
                            }
                            
                            const sbZone = getSbZone(childZone)
                            const rastrumID = sbZone.getAttribute('bw.rastrumIDs').split(' ')[staffN - 1]
                            const rastrum = layout.querySelector('rastrum[xml\\:id="' + rastrumID + '"]')
                            const staffY = parseFloat(rastrum.getAttribute('system.topmar')) * factor
                            childZone.setAttribute('uly', staffY.toFixed(1))
                        }

                        child.setAttribute('facs', '#' + childZone.getAttribute('xml:id'))
                    } else if (ignoreElements.indexOf(childName) === -1) {
                        console.warn('Unsupported element in diplomatic transcription: ' + childName)
                        // todo: autogenerate an issue for unsupported elements?! If so, leave a stack trace of the file in which they occur?
                    }
                })

                let x = pageMM.w * factor
                layout.querySelectorAll('rastrum').forEach(rastrum => {
                    const rx = parseFloat(rastrum.getAttribute('system.leftmar')) * factor
                    x = Math.min(rx, x)
                })

                // set margin of 1 staff height
                measureX = Math.max(measureX - verovioPixelDensity * 8 + x, 0)
                measureX2 = Math.min(measureX2 + verovioPixelDensity * 8 + x, pageMM.w * factor)

                measureZone.setAttribute('ulx', measureX.toFixed(1))
                measureZone.setAttribute('lrx', measureX2.toFixed(1))

                /* TODO: make this work again
                const sbZone = measureZone.previousElementSibling
                const sbX = parseFloat(sbZone.getAttribute('ulx'))
                const sbX2 = parseFloat(sbZone.getAttribute('bw.lrx'))
                
                measureX = Math.max(measureX - 10 * factor, sbX) // give 1cm margin, if possible
                measureX2 = Math.min(measureX2 + 10 * factor, sbX2) // give 1cm margin, if possible
                
                measureZone.setAttribute('ulx', measureX.toFixed(1))
                measureZone.setAttribute('lrx', measureX2.toFixed(1))
                */
                node.setAttribute('facs', '#' + measureZone.getAttribute('xml:id'))
            }
            // outDom.querySelector('section').appendChild(node) 
        })
    } catch (err) {
        console.error('Error in prepareDtForRendering: ' + err, err)
    }
    // console.log('outDom: ', new XMLSerializer().serializeToString(outDom))
    return outDom
}

export const finalizeDiploTrans = (svgString) => {
    const dtSvgDom = new DOMParser().parseFromString(svgString, 'image/svg+xml')
    
    dtSvgDom.querySelectorAll('.staff:not(.bounding-box)').forEach((staff, n) => {
        const measure = staff.parentElement
        let sb = measure.previousElementSibling
        while (sb && !sb.matches('.sb')) {
            sb = sb.previousElementSibling
        }
        // TODO: this doesn't resolve all cases, when there are multiple systems with just one staff vs. multiple staves in one system
        const rotate = sb.getAttribute('data-rotate').split(' ')[n]
        // const rotate = staff.getAttribute('data-rotate')
        
        // const height = staff.getAttribute('data-height')
        // const topLineCoordinates = staff.querySelector('path').getAttribute('d').split(' ')
        // const x = topLineCoordinates[0].substring(1)
        // const y = topLineCoordinates[1]
        staff.style.transform = 'rotate(' + rotate + 'deg)' // scaleY(' + height + ')'
        // staff.style.transformOrigin = x + 'px ' + y + 'px'
    })

    // TODO: check this for correctness
    dtSvgDom.querySelectorAll('.chord:not(.bounding-box)').forEach(chord => {
        const stem = chord.querySelector('.stem > path')

        if (stem) {
          const stemDir = chord.getAttribute('data-stem.dir')
          const x = stemDir === 'up'
            ? parseFloat(parseFloat(chord.querySelector('.note.bounding-box > rect').getAttribute('x')) + parseFloat(chord.querySelector('.note.bounding-box > rect').getAttribute('width')))
            : chord.querySelector('.note.bounding-box > rect').getAttribute('x')
          const arr = stem.getAttribute('d').split(' ')
          stem.setAttribute('d', 'M' + x + ' ' + arr[1] + ' L' + x + ' ' + arr[3])
          chord.querySelector('.stem.bounding-box rect').setAttribute('x', x)
        }
    })

    dtSvgDom.querySelectorAll('.layer > .barLine:not(.data), .measure > .barLine:not(.data)').forEach(barLine => {
        barLine.remove()
    })

    return dtSvgDom
}

const getSbZone = (node) => {
    let sibling = node
    while (sibling) {
      if (sibling.hasAttribute('type') && sibling.getAttribute('type') === 'sb') {
        return sibling // Found the matching sibling
      }
      sibling = sibling.previousElementSibling // Move to the next preceding sibling
    }
    return null
}