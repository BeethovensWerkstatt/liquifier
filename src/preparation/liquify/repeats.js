import { liquifyLinePolygons } from './linePolygons.js'
import { deferRegulation, regulateLayout } from '../../utils/ft/regulation.js'

/**
 * Animate repeat symbols rendered by Thulemeier as line polygons.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {SVGElement} dtSvg - Diplomatic transcription SVG.
 * @param {Document} atMeiDom - Annotated MEI DOM (unused; retained for the liquify API).
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
export function liquifyRepeats (ftSvg, dtSvg, atMeiDom, tools) {
  // Interventions phase: move to the reg layout
  deferRegulation(tools, () => regulateLayout(ftSvg, ftSvg.querySelectorAll('g.repeat:not(.bounding-box), g.mRpt:not(.bounding-box), g.halfmRpt:not(.bounding-box), g.beatRpt:not(.bounding-box)'), atMeiDom, tools))
  liquifyLinePolygons(ftSvg, dtSvg, tools, ['g.repeat', 'g.mRpt', 'g.halfmRpt', 'g.beatRpt'])
}
