import { JSDOM } from 'jsdom'
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

const uuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}