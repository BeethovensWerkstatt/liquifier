export const prepareAtForRendering = ({ dtDom, atDom, sourceDom }, dtOutDom) => {
    const outDom = atDom.cloneNode(true)
    
    outDom.querySelectorAll('scoreDef staffDef').forEach((sd, i) => {
        const scale = dtOutDom.querySelector('scoreDef staffDef[n="' + (i + 1) + '"]').getAttribute('scale')
        
        sd.setAttribute('scale', scale)
    })
    return outDom
}