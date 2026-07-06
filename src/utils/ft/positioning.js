import { closestElement } from '../dom.js'

export const retrieveHorizontalPositionFromDt = (dtDom, layoutInfo) => {
  let minX = Infinity
  let maxX = -Infinity

  dtDom.querySelectorAll('staff').forEach(staff => {
    const staffN = staff.getAttribute('n')
    const staffDef = closestElement(staff, '*|system').querySelector('staffDef[n="' + staffN + '"]')
    const rastrumId = staffDef.getAttribute('decls').split('#')[1]
    const rastrum = layoutInfo.pages.find(page => page.current).rastrums.find(r => r.id === rastrumId)

    const rastrumX = rastrum.x
    closestElement(staff, 'section').querySelectorAll('staff[n="' + staffN + '"] *[x], *[staff="' + staffN + '"]').forEach(elem => {
      if (elem.hasAttribute('x')) {
        const x = parseFloat(elem.getAttribute('x')) + rastrumX
        if (x < minX) minX = x
        if (x > maxX) maxX = x
      }
      if (elem.hasAttribute('x2')) {
        const x2 = parseFloat(elem.getAttribute('x2')) + rastrumX
        if (x2 < minX) minX = x2
        if (x2 > maxX) maxX = x2
      }
    })
  })
  const width = maxX - minX
  return { minX, maxX, width }
}
