import { appendNewElement, getSystemCenter, getAtSystemCenters } from "./utils.js"
import { JSDOM } from 'jsdom'
const { DOMParser, XMLSerializer } = new JSDOM().window
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)

const duration = '10s'
const repeatCount = 'indefinite'
const reverseAnimations = false

/*
ANIMATION PHASES:
0: start with diplomatic positions
1: animated to normalized positions within measures
2: showing supplied objects
3: animated to continuous system
*/

export const generateFluidTranscription = ({ atSvgDom, dtSvgDom, atOutDom, dtOutDom, sourceDom }) => {
    const supportedElements = ['note', 'accid', 'clef', 'keySig', 'meterSig', 'chord', 'barLine', 'beam', 'beamSpan']

    const ftSvgDom = atSvgDom.cloneNode(true)

    const dtSystemCenters = []
    dtSvgDom.querySelectorAll('.system:not(.bounding-box)').forEach(system => {
        const measures = system.querySelectorAll('.measure:not(.bounding-box)')
        dtSystemCenters.push(getSystemCenter(measures))
    })

    const dtBBox = { x: 10000000, y: 10000000, width: 0, height: 0 }
    dtSystemCenters.forEach(center => {
        if (center.left < dtBBox.x) dtBBox.x = center.left
        if (center.right > dtBBox.width) dtBBox.width = center.right
        if (center.top < dtBBox.y) dtBBox.y = center.top
        if (center.bottom > dtBBox.height) dtBBox.height = center.bottom
    })
    // console.log('\ndtBBox (' + dtSystemCenters.length + '): ', dtBBox)
    // console.log('dtSvgDom w:' + dtSvgDom.querySelector('svg').getAttribute('width') + ' h:' + dtSvgDom.querySelector('svg').getAttribute('height'))
    // console.log('dtSvgDom viewBox: ' + dtSvgDom.querySelector('svg svg').getAttribute('viewBox') + '\n\n')

    const atSystemCenters = []
    atSvgDom.querySelectorAll('.system:not(.bounding-box) > .sb').forEach((elem, i) => {
        const measures = []
        const ids = []
        let sibling = elem.nextElementSibling
        while (sibling && sibling.getAttribute('class') === 'measure') {
            measures.push(sibling)
            ids.push(sibling.getAttribute('data-id'))
            sibling = sibling.nextElementSibling
        }
        const atCenter = getSystemCenter(measures)
        atSystemCenters.push({ atCenter, dtCenter: dtSystemCenters[i], measures: ids })
    })
    const atBBox = { x: 10000000, y: 10000000, width: 0, height: 0 }
    atSystemCenters.forEach(center => {
        if (center.atCenter.left < atBBox.x) atBBox.x = center.atCenter.left
        if (center.atCenter.right > atBBox.width) atBBox.width = center.atCenter.right
        if (center.atCenter.top < atBBox.y) atBBox.y = center.atCenter.top
        if (center.atCenter.bottom > atBBox.height) atBBox.height = center.atCenter.bottom
    })
    // console.log('\natBBox (' + atSystemCenters.length + '): ', atBBox)
    // console.log('atSvgDom w:' + atSvgDom.querySelector('svg').getAttribute('width') + ' h:' + atSvgDom.querySelector('svg').getAttribute('height'))
    // console.log('atSvgDom viewBox: ' + atSvgDom.querySelector('svg svg').getAttribute('viewBox') + '\n\n')
    
    ftSvgDom.querySelector('svg').setAttribute('width', dtSvgDom.querySelector('svg').getAttribute('width'))
    const dtViewBox = dtSvgDom.querySelector('svg svg').getAttribute('viewBox').split(' ')
    const atViewBox = atSvgDom.querySelector('svg svg').getAttribute('viewBox').split(' ')
    ftSvgDom.querySelector('svg svg').setAttribute('viewBox', atViewBox[0] + ' ' + atViewBox[1] + ' ' + dtViewBox[2] + ' ' + atViewBox[3])

    const dtVerticalCenter = atSystemCenters.reduce((sum, system) => sum + system.dtCenter.y, 0) / atSystemCenters.length
    atSystemCenters.forEach(system => {
        system.offset = { x: system.dtCenter.x - system.atCenter.x, y: dtVerticalCenter - system.dtCenter.y }
    })

    // console.log('atSystemCenters: ', atSystemCenters)

    atSystemCenters.forEach((center, i) => {
        center.measures.forEach((id, n) => {
            const measure = ftSvgDom.querySelector('.measure[data-id="' + id + '"]')
            const diploPos = (center.offset.x) + ' ' + (center.offset.y * -1)
            const annotPos = '0 0'
            const positions = [diploPos, diploPos, diploPos, annotPos]
            addTransformTranslate(measure, positions)

            // adjust staff lines from first measure and generate animation on them
            if (n === 0) {
                const staffLines = measure.querySelectorAll('.staff > path')
                const lastMeasure = ftSvgDom.querySelector('.measure[data-id="' + center.measures[center.measures.length - 1] + '"]')
                const lastStaffLines = lastMeasure.querySelectorAll('.staff > path')
                const dtStaffLines = dtSvgDom.querySelectorAll('.system:not(.bounding-box)')[i].querySelectorAll('.staff > path')

                staffLines.forEach((line, k) => {
                    const atStart = line.getAttribute('d').split('L')[0]
                    const atEnd = lastStaffLines[k].getAttribute('d').split('L')[1]
                    const atD = atStart + 'L' + atEnd

                    const atWidth = parseFloat(atEnd.split(' ')[0]) - parseFloat(atStart.split(' ')[0].replace('M', ''))

                    const dtLine = dtStaffLines[k]
                    const dtStart = dtLine.getAttribute('d').split('L')[0]
                    const dtEnd = dtLine.getAttribute('d').split('L')[1]

                    const dtWidth = parseFloat(dtEnd.split(' ')[0]) - parseFloat(dtStart.split(' ')[0].replace('M', ''))
                    const diff = atWidth - dtWidth

                    // console.log('diff: ', diff)

                    const dtX1 = parseFloat(atStart.split(' ')[0].replace('M', '')) + diff
                    const atY = parseFloat(atStart.split(' ')[1])
                    const dtX2 = parseFloat(atEnd.split(' ')[0]) - diff

                    // const dtNewStart = 'M' + parseFloat(atStart.split(' ')[0].replace('M', '')) + diff + ' ' + atStart.split(' ')[1]
                    // const dtNewEnd = parseFloat(atEnd.split(' ')[0]) - diff + ' ' + atEnd.split(' ')[1]
                    const dtD = 'M' + dtX1 + ' ' + atY + ' L' + dtX2 + ' ' + atY // dtNewStart + 'L' + dtNewEnd

                    // console.log('dtD: ', dtD, 'atD: ', atD)

                    addTransForm(line, 'd', [dtD, atD, atD, atD])
                    line.setAttribute('d', dtD)
                })
            } else { // suppress all other measures' staff lines
                const staffLines = measure.querySelectorAll('.staff > path')
                staffLines.forEach(line => line.remove())
            }

            const sb = dtSvgDom.querySelectorAll('.sb')[i]
            const rotations = sb.getAttribute('data-rotate').split(' ')

            const staves = measure.querySelectorAll('.staff:not(.bounding-box)')

            console.log('rotations: (' + rotations.length + ')', rotations, 'staves: ', staves.length)

            rotations.forEach((rotate, l) => {
                const staff = staves[l]

                if (staff) {
                    // TODO: this doesn't resolve all cases, when there are multiple systems with just one staff vs. multiple staves in one system
                    // staff.style.transform = 'rotate(' + rotate + 'deg)'
                    // staff.style.transformOrigin = x + 'px ' + y + 'px'
                }
            })

            supportedElements.forEach(name => {
                const query = '.' + name + ':not(.bounding-box)'
                const targets = measure.querySelectorAll(query)
                // console.log('---targets: ', targets.length, new XMLSerializer().serializeToString(targets[0]))
                targets.forEach(ftSvgNode => {
                    const atNode = atOutDom.querySelector(name + '[xml\\:id="' + ftSvgNode.getAttribute('data-id') + '"]')
                    /* if (name === 'chord') {
                        console.log('---atNode: ', new XMLSerializer().serializeToString(atNode)) 
                    } */
                    if (name === 'barLine') {
                        // barlines need different handling, as seen below
                    } else if (atNode && atNode.hasAttribute('corresp')) {
                        const correspID = atNode.getAttribute('corresp').split('#')[1]
                        const dtSvgNode = dtSvgDom.querySelector('*[data-id="' + correspID + '"]')
                        // const ftSvgNode = ftSvgDom.querySelector('*[data-id="' + atNode.getAttribute('xml:id') + '"]')
                        generateAnimation(name, ftSvgNode, dtSvgNode, center)
                    } else {
                        // const ftSvgNode = ftSvgDom.querySelector('*[data-id="' + atNode.getAttribute('xml:id') + '"]')
                        generateHideAnimation(ftSvgNode)
                    }
                })
            })

            // handling of barLines
            const atMeiMeasure = [...atOutDom.querySelectorAll('measure')].find(measure => measure.getAttribute('xml:id') === id)
            const barLineIDs = atMeiMeasure.hasAttribute('corresp') ? atMeiMeasure.getAttribute('corresp').split(' ') : []
            
            const atBarLine = ftSvgDom.querySelector('.measure:not(.bounding-box)[data-id="' + id + '"] .barLine:not(.bounding-box)')
            
            const dtSvgBarLines = [...dtSvgDom.querySelectorAll('.barLine')].filter(barLine => barLineIDs.some(value => value.endsWith('#' + barLine.getAttribute('data-id'))))
            dtSvgBarLines.forEach(dtBarLine => {
                // console.log('found a transcribed barLine in measure ' + id, new XMLSerializer().serializeToString(dtBarLine))
                generateAnimation_barLine(atBarLine, dtBarLine, center)
            })
            if (dtSvgBarLines.length === 0) {
                generateHideAnimation(atBarLine)
            }
        })
    })

    const foreignObject = appendNewElement(ftSvgDom.querySelectorAll('svg')[1], 'foreignObject', 'http://www.w3.org/2000/svg')
    foreignObject.setAttribute('x', '20%')
    foreignObject.setAttribute('y', '80%')
    foreignObject.setAttribute('width', '60%')
    foreignObject.setAttribute('height', '15%')
    foreignObject.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="width: 12000px;padding: 100px;"><input type="range" min="0" max="9.99999" style="width: 15%; height: 100px; scale: 5; margin: 5%; padding: 100px; left: 5230px; position: relative;" step="any" oninput="document.querySelectorAll('svg').forEach(svg => svg.setCurrentTime(value))"/></div>`
    const script = appendNewElement(ftSvgDom.querySelectorAll('svg')[1], 'script', 'http://www.w3.org/2000/svg')
    script.setAttribute('type', 'text/ecmascript')
    script.innerHTML = "const innerSvg = document.querySelectorAll('svg').forEach(svg => {svg.pauseAnimations(); svg.setCurrentTime(0);})"

    return ftSvgDom
}

const generateHideAnimation = (node) => {
    const hideAnim = appendNewElement(node, 'animate', 'http://www.w3.org/2000/svg')
    hideAnim.setAttribute('attributeName', 'opacity')

    const values = reverseAnimations ? '0;0;1;1;1;0;0' : '0;0;1;1'

    hideAnim.setAttribute('values', values)
    hideAnim.setAttribute('dur', duration)
    hideAnim.setAttribute('repeatCount', repeatCount)

    node.setAttribute('fill', '#999999')
    node.setAttribute('stroke', '#999999')
}

const generateAnimation = (name, ftSvgNode, dtSvgNode, positions) => {
    // console.log('----positions: ', positions)
    if (name === 'note' && ftSvgNode.parentNode.matches('.chord')) {
        // chords are animated separately below, so notes inside chords must not get double animation
        // console.log('skipping to animate notes in chords')
    } else if (name === 'note') {
        generateAnimation_note(ftSvgNode, dtSvgNode, positions)
    } else if (name === 'chord') {
        // chords actually can use the same animation as notes
        generateAnimation_note(ftSvgNode, dtSvgNode, positions)
    } else if (name === 'beamSpan' || name === 'beam') {
        // chords actually can use the same animation as notes
        generateAnimation_beam(ftSvgNode, dtSvgNode, positions)
    } else {
        console.warn('Unable to animate element ' + name)
    }
}

const generateAnimation_note = (atSvgNode, dtSvgNode, positions) => {
    try {
        const noteId = atSvgNode.getAttribute('data-id')

        // notehead animation
        const atHead = atSvgNode.querySelector('.notehead use')
        const atHeadX = parseFloat(atHead.getAttribute('x'))
        const atHeadY = parseFloat(atHead.getAttribute('y'))
        const dtHead = dtSvgNode.querySelector('.notehead use')
        const dtHeadX = parseFloat(dtHead.getAttribute('x'))
        const dtHeadY = parseFloat(dtHead.getAttribute('y'))

        const atHeadOffX = positions.atCenter.x - atHeadX
        const atHeadOffY = positions.atCenter.y - atHeadY
        const dtHeadOffX = positions.dtCenter.x - dtHeadX
        const dtHeadOffY = positions.dtCenter.y - dtHeadY

        const diffX = atHeadOffX - dtHeadOffX
        const diffY = atHeadOffY - dtHeadOffY

        const dtPos = diffX + ' ' + diffY
        const atPos = '0 0'

        addTransformTranslate(atSvgNode, [dtPos, atPos, atPos, atPos])

        const ledgers = atSvgNode.closest('.measure:not(.bounding-box)').querySelectorAll('.ledgerLines .lineDash[data-related~="#' + noteId + '"]')
        ledgers.forEach(ledger => {
            addTransformTranslate(ledger.querySelector('path'), [dtPos, atPos, atPos, atPos])
        })
        
        // const dtPosX = atHeadX + diffX

        // const ftHeadXValues = [dtPosX, atHeadX, atHeadX, atHeadX]
        // addTransForm(atHead, 'x', ftHeadXValues)

        /* 
        const anim = appendNewElement(atSvgNode, 'animateTransform', 'http://www.w3.org/2000/svg')
        anim.setAttribute('attributeName', 'transform')
        anim.setAttribute('attributeType', 'XML')
        anim.setAttribute('type', 'translate')
        const newPos = (center.offset.x) + ' ' + (center.offset.y * -1)
        anim.setAttribute('values', '0 0;0 0;' + newPos + ';0 0;0 0')
        anim.setAttribute('repeatCount', repeatCount)
        anim.setAttribute('dur', duration)

        const headAnim = appendNewElement(atHead, 'animate', 'http://www.w3.org/2000/svg')
        headAnim.setAttribute('attributeName', 'x')
        headAnim.setAttribute('values', dtHeadX + ';' + atHeadX + ';' + atHeadX + ';' + atHeadX + ';' + dtHeadX)
        headAnim.setAttribute('dur', duration)
        headAnim.setAttribute('repeatCount', repeatCount)
        */
        // TODO: animate y as well, based on offsets…
        
        // stem animation
        const atStemNode = atSvgNode.querySelector('.stem path')
        if (atStemNode) {
            const atStem = atSvgNode.querySelector('.stem path')?.getAttribute('d')
            const dtStem = dtSvgNode.querySelector('.stem path')?.getAttribute('d')
            const atStem_x = atStem.split(' ')[0]
            const atStem_y = atStem.split(' ')[1]
            const atStem_l = parseFloat(atStem.split(' ')[1]) - parseFloat(atStem.split(' ')[3])
            const dtStem_x = dtStem.split(' ')[0]
            const dtStem_l = parseFloat(dtStem.split(' ')[1]) - parseFloat(dtStem.split(' ')[3])

            const dtStemNew = atStem_x + ' ' + atStem_y + ' ' + atStem.split(' ')[2] + ' ' + (parseFloat(atStem_y) - dtStem_l)
            
            addTransForm(atStemNode, 'd', [dtStemNew, atStem, atStem, atStem])
            /*
            const stemAnim = appendNewElement(atStemNode, 'animate', 'http://www.w3.org/2000/svg')
            stemAnim.setAttribute('attributeName', 'd')
            stemAnim.setAttribute('attributeType', 'XML')
            stemAnim.setAttribute('values', dtStemNew + '; ' + atStem + '; ' + atStem + '; ' + atStem + '; ' + dtStemNew)
            stemAnim.setAttribute('dur', duration)
            stemAnim.setAttribute('repeatCount', repeatCount) */

            const atFlagNode = atSvgNode.querySelector('.flag use')
            if (atFlagNode) {
                const dtFlagNode = dtSvgNode.querySelector('.flag use')
                const atX = atFlagNode.getAttribute('x')
                const atY = atFlagNode.getAttribute('y')
                console.log('dtStem_x: ', parseInt(dtStem_x), parseInt(dtStem_x) - 7)
                const dtX = parseFloat(dtStem_x.substring(1)) - 7
                const dtY = parseFloat(atStem_y) - dtStem_l

                /* const flagAnimX = appendNewElement(atFlagNode, 'animate', 'http://www.w3.org/2000/svg')
                flagAnimX.setAttribute('attributeName', 'x')
                flagAnimX.setAttribute('values', dtX + ';' + atX + ';' + atX + ';' + atX + ';' + dtX)
                flagAnimX.setAttribute('dur', duration)
                flagAnimX.setAttribute('repeatCount', repeatCount)

                const flagAnimY = appendNewElement(atFlagNode, 'animate', 'http://www.w3.org/2000/svg')
                flagAnimY.setAttribute('attributeName', 'y')
                flagAnimY.setAttribute('values', dtY + ';' + atY + ';' + atY + ';' + atY + ';' + dtY)
                flagAnimY.setAttribute('dur', duration)
                flagAnimY.setAttribute('repeatCount', repeatCount) */
                // const dtY = 
            }
        }

        // flag animation
        /*
            x="3382"
            y="1440" => equals atStem.split(' ')[3]
        */

        /*
        <animate
            attributeName="rx"
            values="0;5;0"
            dur="10s"
            repeatCount="indefinite" />
        */
    } catch(err) {
        console.warn('Error in generateAnimation_note: ' + err, err)
    }
}

const generateAnimation_barLine = (atSvgNode, dtSvgNode, positions) => {
    try {
        const atX = atSvgNode.querySelector('path').getAttribute('d').split(' ')[0].substring(1)
        const dtX = dtSvgNode.querySelector('path').getAttribute('d').split(' ')[0].substring(1)

        const atOffX = positions.atCenter.x - atX
        const dtOffX = positions.dtCenter.x - dtX
        
        const diffX = atOffX - dtOffX

        const dtPos = diffX + ' 0'
        const atPos = '0 0'
        addTransformTranslate(atSvgNode, [dtPos, atPos, atPos, atPos])
    } catch(err) {
        console.warn('Error in generateAnimation_barLine: ' + err, err)
    }
}

const generateAnimation_beam = (atSvgNode, dtSvgNode, positions) => {
    console.log('need to animate beam')
    const atPolygons = atSvgNode.querySelectorAll('polygon')
    const dtPolygons = dtSvgNode.querySelectorAll('polygon')

    atPolygons.forEach((atPolygon, i) => {
        const dtPolygon = dtPolygons[i]
        if (dtPolygon) {
            const atPoints = atPolygon.getAttribute('points').split(' ')
            const dtPoints = dtPolygon.getAttribute('points').split(' ')
            
            const ftPoints = []
            atPoints.forEach((point, j) => {
                const atX = parseFloat(point.split(',')[0])
                const atY = parseFloat(point.split(',')[1])
                const dtX = parseFloat(dtPoints[j].split(',')[0])
                const dtY = parseFloat(dtPoints[j].split(',')[1])

                const atOffX = positions.atCenter.x - atX
                const atOffY = positions.atCenter.y - atY
                const dtOffX = positions.dtCenter.x - dtX
                const dtOffY = positions.dtCenter.y - dtY

                const diffX = atOffX - dtOffX
                const diffY = atOffY - dtOffY

                const dtPos = (atX + diffX) + ',' + (atY + diffY)
                ftPoints.push(dtPos)
            })
            const ftPointsValues = ftPoints.join(' ')
            addTransForm(atPolygon, 'points', [ftPointsValues, atPoints, atPoints, atPoints])
        } else {
            generateHideAnimation(atPolygon)
        }
    })
}

const addTransformTranslate = (node, values = []) => {
    const anim = appendNewElement(node, 'animateTransform', 'http://www.w3.org/2000/svg')
    anim.setAttribute('attributeName', 'transform')
    anim.setAttribute('attributeType', 'XML')
    anim.setAttribute('type', 'translate')

    const reverse = reverseAnimations ? values.slice(0, -1).reverse() : []
    anim.setAttribute('values', values.concat(reverse).join(';'))
    anim.setAttribute('repeatCount', repeatCount)
    anim.setAttribute('dur', duration)
    // anim.setAttribute('calcMode', 'spline')
}

const addTransForm = (node, attribute, values = []) => {
    const anim = appendNewElement(node, 'animate', 'http://www.w3.org/2000/svg')
    anim.setAttribute('attributeName', attribute)
    
    const reverse = reverseAnimations ? values.slice(0, -1).reverse() : []
    anim.setAttribute('values', values.concat(reverse).join(';'))
    anim.setAttribute('repeatCount', repeatCount)
    anim.setAttribute('dur', duration)
    // anim.setAttribute('calcMode', 'spline')
}

const generateAnimation_system = (atSvgNode, dtSvgNode, offset) => {
    /* const systemAnim = appendNewElement(atHead, 'animate', 'http://www.w3.org/2000/svg')
    systemAnim.setAttribute('attributeName', 'x')
    systemAnim.setAttribute('values', dtHeadX + ';' + atHeadX + ';' + dtHeadX)
    systemAnim.setAttribute('dur', '3s')
    systemAnim.setAttribute('repeatCount', 'indefinite') */
}