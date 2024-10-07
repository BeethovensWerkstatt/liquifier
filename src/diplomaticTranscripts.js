import { JSDOM } from 'jsdom'
import { appendNewElement } from './utils.js'
const { DOMParser } = new JSDOM().window
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)

export const prepareDtForRendering = ({ dtDom, atDom, sourceDom }) => {
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
        const factor = 9
        
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
            staffDef.setAttribute('scale', (100 / defaultRastrumHeight * parseFloat(rastrums[0].getAttribute('system.height')) * factor).toFixed(1) + '%')
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
                rastrums.forEach(rastrum => {
                    const rx = parseFloat(rastrum.getAttribute('system.leftmar'))
                    const ry = parseFloat(rastrum.getAttribute('system.topmar'))
                    const rw = parseFloat(rastrum.getAttribute('width')) + rx
                    x = Math.min(rx, x)
                    y = Math.min(ry, y)
                    x2 = Math.max(rw, x2)
                })

                systemZone.setAttribute('type', 'sb')
                systemZone.setAttribute('ulx', (x * factor).toFixed(1))
                systemZone.setAttribute('bw.lrx', (x2 * factor).toFixed(1))
                systemZone.setAttribute('bw.rastrumIDs', rastrumIDs.join(' '))
                systemZone.setAttribute('uly', (y * factor).toFixed(1)) // todo: how to determine sb/@uly properly? This is not the same as staff/@uly!!!!
                node.setAttribute('facs', '#' + systemZone.getAttribute('xml:id')) 
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
                    const supportedElements = ['note', 'staff', 'accid']
                    const ignoreElements = ['layer']
                   
                    if (supportedElements.indexOf(childName) !== -1) {
                        const childZone = appendNewElement(outSurface, 'zone')
                        childZone.setAttribute('type', childName)
                        
                        if (childName === 'note' || childName === 'accid') {
                            childZone.setAttribute('ulx', (parseFloat(child.getAttribute('x')) * factor).toFixed(1))
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
                            /* const getSbZone = (node) => {
                                console.log('examining sibling: ', node)
                                // Base case: if the node is null, return null
                                if (!node) {
                                    console.warn('no more preceding siblings')
                                    return null
                                }
                                const serializer = new dom.window.XMLSerializer()
                                const serializedString = serializer.serializeToString(node)
                                console.log(serializedString.substring(0, 130))
                                // Check if the current node matches the condition
                                try {
                                    if (node.hasAttribute('type') && node.getAttribute('type') === 'sb') {
                                        console.warn('found sb')
                                        return node // Found the matching sibling
                                    } else {
                                        console.warn('no sb')
                                    }
                                } catch(err) {
                                    console.trace('error in getSbZone: ', err)
                                    return false
                                }
                                
                                // Recursive step: move to the previous sibling
                                return getSbZone(node.previousElementSibling)
                            } */ 
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
    return outDom
  }