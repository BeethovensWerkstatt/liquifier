import { deferRegulation, regulateLayout } from '../../utils/ft/regulation.js'

/**
 * Animate key signatures. Key signatures are only part of the AT, so there is no DT state to
 * animate from: they appear together with the other supplied elements. In the interventions
 * phase, they move to the layout of the reg rendering.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT).
 * @param {SVGElement} dtSvg - Diplomatic transcription SVG (unused; retained for the liquify API).
 * @param {Document} atMeiDom - AT MEI DOM.
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
export const liquifyKeySigs = (ftSvg, dtSvg, atMeiDom, tools) => {
  // Interventions phase: move to the reg layout
  deferRegulation(tools, () => regulateLayout(ftSvg, ftSvg.querySelectorAll('g.keySig:not(.bounding-box)'), atMeiDom, tools))
}
