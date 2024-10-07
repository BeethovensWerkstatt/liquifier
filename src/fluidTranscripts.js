import { appendNewElement } from "./utils.js"
import { JSDOM } from 'jsdom'
const { DOMParser } = new JSDOM().window
const dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)

export const generateFluidTranscription = ({ atSvgDom, dtSvgDom, atOutDom, dtOutDom }) => {
    const supportedElements = ['note']

    const ftSvgDom = atSvgDom.cloneNode(true)

    supportedElements.forEach(name => {
        atOutDom.querySelectorAll(name).forEach(atNode => {
            if (atNode.hasAttribute('corresp')) {
                const correspID = atNode.getAttribute('corresp').split('#')[1]
                const dtSvgNode = dtSvgDom.querySelector('*[data-id="' + correspID + '"]')
                const ftSvgNode = ftSvgDom.querySelector('*[data-id="' + atNode.getAttribute('xml:id') + '"]')
                generateAnimation(name, ftSvgNode, dtSvgNode)
            } else {
                const ftSvgNode = ftSvgDom.querySelector('*[data-id="' + atNode.getAttribute('xml:id') + '"]')
                generateHideAnimation(ftSvgNode)
            }
        })
    })

    return ftSvgDom
}

const generateHideAnimation = (node) => {
    const hideAnim = appendNewElement(node, 'animate', 'http://www.w3.org/2000/svg')
    hideAnim.setAttribute('attributeName', 'opacity')
    hideAnim.setAttribute('values', '0;1;0')
    hideAnim.setAttribute('dur', '3s')
    hideAnim.setAttribute('repeatCount', 'indefinite')
}

const generateAnimation = (name, ftSvgNode, dtSvgNode) => {
    if (name === 'note') {
        generateAnimation_note(ftSvgNode, dtSvgNode)
    } else {
        console.warn('Unable to animate element ' + name)
    }
}

const generateAnimation_note = (atSvgNode, dtSvgNode) => {
    try {
        // notehead animation
        const atHead = atSvgNode.querySelector('.notehead use')
        const atHeadX = parseFloat(atHead.getAttribute('x'))
        const atHeadY = parseFloat(atHead.getAttribute('y'))
        const dtHead = dtSvgNode.querySelector('.notehead use')
        const dtHeadX = parseFloat(dtHead.getAttribute('x'))
        const dtHeadY = parseFloat(dtHead.getAttribute('y'))

        const headAnim = appendNewElement(atHead, 'animate', 'http://www.w3.org/2000/svg')
        headAnim.setAttribute('attributeName', 'x')
        headAnim.setAttribute('values', dtHeadX + ';' + atHeadX + ';' + dtHeadX)
        headAnim.setAttribute('dur', '3s')
        headAnim.setAttribute('repeatCount', 'indefinite')

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
            stemAnim.setAttribute('values', dtStemNew + '; ' + atStem + '; ' + dtStemNew)
            stemAnim.setAttribute('dur', '3s')
            stemAnim.setAttribute('repeatCount', 'indefinite')

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
                flagAnimX.setAttribute('values', dtX + ';' + atX + ';' + dtX)
                flagAnimX.setAttribute('dur', '3s')
                flagAnimX.setAttribute('repeatCount', 'indefinite')

                const flagAnimY = appendNewElement(atFlagNode, 'animate', 'http://www.w3.org/2000/svg')
                flagAnimY.setAttribute('attributeName', 'y')
                flagAnimY.setAttribute('values', dtY + ';' + atY + ';' + dtY)
                flagAnimY.setAttribute('dur', '3s')
                flagAnimY.setAttribute('repeatCount', 'indefinite')
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