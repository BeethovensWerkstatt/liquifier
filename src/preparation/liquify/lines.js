import { liquifyLinePolygons } from './linePolygons.js'

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
  liquifyLinePolygons(ftSvg, dtSvg, tools, ['g.gliss'])
}
