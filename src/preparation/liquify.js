// import { appendNewElement } from '../utils/dom.js'
import { liquifyNotes } from './liquify/notes.js'
import { liquifyBarlines } from './liquify/barlines.js'
import { liquifyCurves } from './liquify/curves.js'
import { liquifyAccids } from './liquify/accids.js'
import { liquifyRests } from './liquify/rests.js'
import { liquifyBeams } from './liquify/beams.js'
import { liquifyMeterSigs } from './liquify/meterSigs.js'
import { liquifyClefs } from './liquify/clefs.js'
import { liquifyChords } from './liquify/chords.js'
import { liquifyLedgerLines } from './liquify/liquifyLedgerLines.js'
import { liquifyTrills } from './liquify/trills.js'
import { liquifyFermatas } from './liquify/fermatas.js'
import { liquifyPedals } from './liquify/pedals.js'
import { liquifyFings } from './liquify/fings.js'
import { liquifyFs } from './liquify/fs.js'
import { liquifyArtics } from './liquify/artics.js'
import { liquifyDynams } from './liquify/dynams.js'
import { liquifyTempo } from './liquify/tempo.js'
import { liquifyDirs } from './liquify/dirs.js'
import { liquifyHairpins } from './liquify/hairpins.js'
import { liquifyTupletNums } from './liquify/tupletNums.js'
import { liquifyTremolos } from './liquify/tremolos.js'
import { liquifyStaffGrpBraces } from './liquify/staffGrpBraces.js'
// import { adjustViewBoxForContent } from './liquify/viewbox.js'

// const duration = '5s'
// const repeatCount = 'indefinite'
// const reverseAnimations = false

/**
 * Orchestrate animation of all musical events (notes, rests, chords, etc.) between AT and DT transcriptions
 * This function serves as the main coordinator for animating all types of musical notation elements.
 *
 * @param {SVGElement} ftSvg - Fluid transcription SVG (cloned from AT)
 * @param {SVGElement} dtSvg - Diplomatic transcript SVG
 * @param {Document} atMeiDom - AT MEI DOM for accessing element metadata
 * @param {Object} tools - Shared animation helper bundle
 * @param {Function} tools.getNewPos - Converts DT coordinates into FT coordinate space
 * @param {Function} tools.convertD - Converts DT path data into FT coordinate space
 * @param {number} tools.scaleFactor - DT-to-AT scale factor
 * @param {Map<string, string[]>} tools.correspMappings - AT element id to DT ids mapping
 * @param {string} tools.stateModel - Active state model (fluidTranscript or fluidSystems)
 * @param {Function} tools.getRegSuppTranslate - Returns regulation/supplements translate for one element id
 * @param {Function} tools.setAnimation - Phase-aware animation descriptor writer
 * @param {Object} tools.logger - Logger instance
 * @returns {void} No return value.
 */
export const liquifyMusic = (ftSvg, dtSvg, atMeiDom, tools) => {
  // events
  liquifyNotes(ftSvg, dtSvg, atMeiDom, tools)
  liquifyBarlines(ftSvg, dtSvg, atMeiDom, tools)
  liquifyRests(ftSvg, dtSvg, atMeiDom, tools)
  liquifyChords(ftSvg, dtSvg, atMeiDom, tools)
  liquifyLedgerLines(ftSvg, dtSvg, atMeiDom, tools)
  liquifyAccids(ftSvg, dtSvg, atMeiDom, tools)
  liquifyClefs(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyDots(ftSvg, dtSvg, atMeiDom, tools)
  liquifyMeterSigs(ftSvg, dtSvg, atMeiDom, tools)
  liquifyArtics(ftSvg, dtSvg, atMeiDom, tools)
  liquifyTupletNums(ftSvg, dtSvg, atMeiDom, tools)
  liquifyTremolos(ftSvg, dtSvg, atMeiDom, tools)
  liquifyStaffGrpBraces(ftSvg, dtSvg, atMeiDom, tools)

  // controlevents
  liquifyBeams(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyRepeats(ftSvg, dtSvg, atMeiDom, tools)
  liquifyDirs(ftSvg, dtSvg, atMeiDom, tools)
  liquifyTempo(ftSvg, dtSvg, atMeiDom, tools)
  liquifyDynams(ftSvg, dtSvg, atMeiDom, tools)
  liquifyCurves(ftSvg, dtSvg, atMeiDom, tools)
  liquifyHairpins(ftSvg, dtSvg, atMeiDom, tools)
  liquifyTrills(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyOctaves(ftSvg, dtSvg, atMeiDom, tools)
  liquifyFermatas(ftSvg, dtSvg, atMeiDom, tools)
  liquifyPedals(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyWords(ftSvg, dtSvg, atMeiDom, tools)
  liquifyFings(ftSvg, dtSvg, atMeiDom, tools)
  liquifyFs(ftSvg, dtSvg, atMeiDom, tools)
  // liquifyMetamarks(ftSvg, dtSvg, atMeiDom, tools)
}
