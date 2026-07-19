/**
 * Animate staff group braces (system braces) in fluid systems output.
 *
 * Current data status: no DT<->AT correspondence yet.
 * For now, these AT-only elements stay hidden through regulation and become
 * visible starting at supplements.
 *
 * Target selector in AT/FT SVG: `g.system + path`
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG (unused for now)
 * @param {Document} atMeiDom - AT MEI DOM (unused for now)
 * @param {Object} tools - Animation helper bundle
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer
 * @returns {void}
 */
export const liquifyStaffGrpBraces = (ftSvg, dtSvg, atMeiDom, tools) => {
  const { setAnimation } = tools

  const braces = ftSvg.querySelectorAll('g.system > path')

  braces.forEach(brace => {
    brace.setAttribute('opacity', '0')
    setAnimation({
      element: brace,
      states: {
        digitalFacsimile: { type: 'opacity', val: '0' },
        writingZone: { type: 'opacity', val: '0' },
        finding: { type: 'opacity', val: '0' },
        normalization: { type: 'opacity', val: '0' },
        readingOrder: { type: 'opacity', val: '0' },
        regulation: { type: 'opacity', val: '0' },
        supplements: { type: 'opacity', val: '1' },
        interventions: { type: 'opacity', val: '1' }
      }
    })
  })
}
