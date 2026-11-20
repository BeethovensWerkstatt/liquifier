import { liquifyLinePolygons } from './linePolygons.js'
import { deferRegulation, regulateLayout } from '../../utils/ft/regulation.js'

/**
 * Animate glissandi rendered by Thulemeier as line polygons.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG.
 * @param {SVGElement} dtSvg - Diplomatic transcription SVG.
 * @param {Document} atMeiDom - Annotated MEI DOM (unused; retained for the liquify API).
 * @param {Object} tools - Animation helper bundle.
 * @returns {void}
 */
export function liquifyLines (ftSvg, dtSvg, atMeiDom, tools) {
  // Interventions phase: move to the reg layout
  deferRegulation(tools, () => regulateLayout(ftSvg, ftSvg.querySelectorAll('g.gliss:not(.bounding-box)'), atMeiDom, tools))
  liquifyLinePolygons(ftSvg, dtSvg, tools, ['g.gliss'])
}
