import { appendNewElement, getSystemCenter, getAtSystemCenters } from "./utils.js"
import { JSDOM } from 'jsdom'
const { DOMParser, XMLSerializer } = new JSDOM().window
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)

const duration = '5s'
const repeatCount = 'indefinite'
const reverseAnimations = true

/*
ANIMATION PHASES:
0: start with diplomatic positions
1: animated to normalized positions within measures
2: showing supplied objects
3: animated to continuous system
*/

export const generateFluidTranscription = ({ atSvgDom, dtSvgDom, atOutDom, dtOutDom, sourceDom }) => {
    const supportedElements = ['note']

    const ftSvgDom = atSvgDom.cloneNode(true)

    const dtSystemCenters = []
    dtSvgDom.querySelectorAll('.system:not(.bounding-box)').forEach(system => {
        const measures = system.querySelectorAll('.measure:not(.bounding-box)')
        dtSystemCenters.push(getSystemCenter(measures))
    })

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

                    console.log('diff: ', diff)

                    const dtX1 = parseFloat(atStart.split(' ')[0].replace('M', '')) + diff
                    const atY = parseFloat(atStart.split(' ')[1])
                    const dtX2 = parseFloat(atEnd.split(' ')[0]) - diff

                    // const dtNewStart = 'M' + parseFloat(atStart.split(' ')[0].replace('M', '')) + diff + ' ' + atStart.split(' ')[1]
                    // const dtNewEnd = parseFloat(atEnd.split(' ')[0]) - diff + ' ' + atEnd.split(' ')[1]
                    const dtD = 'M' + dtX1 + ' ' + atY + ' L' + dtX2 + ' ' + atY // dtNewStart + 'L' + dtNewEnd

                    console.log('dtD: ', dtD, 'atD: ', atD)

                    addTransForm(line, 'd', [dtD, atD, atD, atD])
                    line.setAttribute('d', dtD)

                    /* const dtLine = dtSvgDom.querySelectorAll('.staff > path')[k]
                    const dtLineD = dtLine.getAttribute('d')
                    const atLine = atSvgDom.querySelectorAll('.staff > path')[k]
                    const atLineD = atLine.getAttribute('d')
                    const atLineX = parseFloat(atLineD.split(' ')[0])
                    const atLineY = parseFloat(atLineD.split(' ')[1])
                    const dtLineX = parseFloat(dtLineD.split(' ')[0])
                    const dtLineY = parseFloat(dtLineD.split(' ')[1])
                    const atLineOffX = center.atCenter.x - atLineX
                    const atLineOffY = center.atCenter.y - atLineY
                    const dtLineOffX = center.dtCenter.x - dtLineX
                    const dtLineOffY = center.dtCenter.y - dtLineY
                    const diffX = atLineOffX - dtLineOffX
                    const diffY = atLineOffY - dtLineOffY
                    const dtLineNew = dtLineX + diffX + ' ' + (dtLineY + diffY)
                    const ftLineXValues = [dtLineNew, atLineD, atLineD, atLineD]
                    addTransForm(line, 'd', ftLineXValues) */
                })
            } else { // suppress all other measures' staff lines
                const staffLines = measure.querySelectorAll('.staff > path')
                staffLines.forEach(line => line.remove())
            }

            supportedElements.forEach(name => {
                const query = '.' + name + ':not(.bounding-box)'
                const targets = measure.querySelectorAll(query)
                // console.log('---targets: ', targets.length, new XMLSerializer().serializeToString(targets[0]))
                targets.forEach(ftSvgNode => {
                    const atNode = atOutDom.querySelector(name + '[xml\\:id="' + ftSvgNode.getAttribute('data-id') + '"]')
                    // console.log('---atNode: ', new XMLSerializer().serializeToString(atNode))
                    if (atNode.hasAttribute('corresp')) {
                        const correspID = atNode.getAttribute('corresp').split('#')[1]
                        const dtSvgNode = dtSvgDom.querySelector('*[data-id="' + correspID + '"]')
                        // const ftSvgNode = ftSvgDom.querySelector('*[data-id="' + atNode.getAttribute('xml:id') + '"]')
                        generateAnimation(name, ftSvgNode, dtSvgNode, center)
                    } else {
                        const ftSvgNode = ftSvgDom.querySelector('*[data-id="' + atNode.getAttribute('xml:id') + '"]')
                        generateHideAnimation(ftSvgNode)
                    }
                })
            })

            /* const anim = appendNewElement(measure, 'animateTransform', 'http://www.w3.org/2000/svg')
            anim.setAttribute('attributeName', 'transform')
            anim.setAttribute('attributeType', 'XML')
            anim.setAttribute('type', 'translate')
            const newPos = (center.offset.x) + ' ' + (center.offset.y * -1)
            anim.setAttribute('values', '0 0;0 0;' + newPos + ';0 0;0 0')
            anim.setAttribute('repeatCount', repeatCount)
            anim.setAttribute('dur', duration) */
            // <animateTransform xmlns="http://www.w3.org/2000/svg" attributeName="transform" attributeType="XML" type="translate" values="0 0;1000 500;0 0" repeatCount="indefinite" dur="3s"/>
        })
    })

    return ftSvgDom
}

const generateHideAnimation = (node) => {
    const hideAnim = appendNewElement(node, 'animate', 'http://www.w3.org/2000/svg')
    hideAnim.setAttribute('attributeName', 'opacity')

    const values = reverseAnimations ? '0;0;1;1;1;0;0' : '0;0;1;1'

    hideAnim.setAttribute('values', values)
    hideAnim.setAttribute('dur', duration)
    hideAnim.setAttribute('repeatCount', repeatCount)
}

const generateAnimation = (name, ftSvgNode, dtSvgNode, positions) => {
    // console.log('----positions: ', positions)
    if (name === 'note') {
        generateAnimation_note(ftSvgNode, dtSvgNode, positions)
    } else {
        console.warn('Unable to animate element ' + name)
    }
}

const generateAnimation_note = (atSvgNode, dtSvgNode, positions) => {
    try {
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

        const dtPosX = atHeadX + diffX

        const ftHeadXValues = [dtPosX, atHeadX, atHeadX, atHeadX]
        addTransForm(atHead, 'x', ftHeadXValues)

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

            const dtStemNew = dtStem_x + ' ' + atStem_y + ' ' + dtStem.split(' ')[2] + ' ' + (parseFloat(atStem_y) - dtStem_l)

            const stemAnim = appendNewElement(atStemNode, 'animate', 'http://www.w3.org/2000/svg')
            stemAnim.setAttribute('attributeName', 'd')
            stemAnim.setAttribute('attributeType', 'XML')
            stemAnim.setAttribute('values', dtStemNew + '; ' + atStem + '; ' + atStem + '; ' + atStem + '; ' + dtStemNew)
            stemAnim.setAttribute('dur', duration)
            stemAnim.setAttribute('repeatCount', repeatCount)

            const atFlagNode = atSvgNode.querySelector('.flag use')
            if (atFlagNode) {
                const dtFlagNode = dtSvgNode.querySelector('.flag use')
                const atX = atFlagNode.getAttribute('x')
                const atY = atFlagNode.getAttribute('y')
                console.log('dtStem_x: ', parseInt(dtStem_x), parseInt(dtStem_x) - 7)
                const dtX = parseFloat(dtStem_x.substring(1)) - 7
                const dtY = parseFloat(atStem_y) - dtStem_l

                const flagAnimX = appendNewElement(atFlagNode, 'animate', 'http://www.w3.org/2000/svg')
                flagAnimX.setAttribute('attributeName', 'x')
                flagAnimX.setAttribute('values', dtX + ';' + atX + ';' + atX + ';' + atX + ';' + dtX)
                flagAnimX.setAttribute('dur', duration)
                flagAnimX.setAttribute('repeatCount', repeatCount)

                const flagAnimY = appendNewElement(atFlagNode, 'animate', 'http://www.w3.org/2000/svg')
                flagAnimY.setAttribute('attributeName', 'y')
                flagAnimY.setAttribute('values', dtY + ';' + atY + ';' + atY + ';' + atY + ';' + dtY)
                flagAnimY.setAttribute('dur', duration)
                flagAnimY.setAttribute('repeatCount', repeatCount)
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

const addTransformTranslate = (node, values = []) => {
    const anim = appendNewElement(node, 'animateTransform', 'http://www.w3.org/2000/svg')
    anim.setAttribute('attributeName', 'transform')
    anim.setAttribute('attributeType', 'XML')
    anim.setAttribute('type', 'translate')

    const reverse = reverseAnimations ? values.slice(0, -1).reverse() : []
    anim.setAttribute('values', values.concat(reverse).join(';'))
    anim.setAttribute('repeatCount', repeatCount)
    anim.setAttribute('dur', duration)
}

const addTransForm = (node, attribute, values = []) => {
    const anim = appendNewElement(node, 'animate', 'http://www.w3.org/2000/svg')
    anim.setAttribute('attributeName', attribute)
    
    const reverse = reverseAnimations ? values.slice(0, -1).reverse() : []
    anim.setAttribute('values', values.concat(reverse).join(';'))
    anim.setAttribute('repeatCount', repeatCount)
    anim.setAttribute('dur', duration)
}

const generateAnimation_system = (atSvgNode, dtSvgNode, offset) => {
    /* const systemAnim = appendNewElement(atHead, 'animate', 'http://www.w3.org/2000/svg')
    systemAnim.setAttribute('attributeName', 'x')
    systemAnim.setAttribute('values', dtHeadX + ';' + atHeadX + ';' + dtHeadX)
    systemAnim.setAttribute('dur', '3s')
    systemAnim.setAttribute('repeatCount', 'indefinite') */
}