// Staff-line bookkeeping that is passed between preparation steps. It is tracked in memory, so that
// the generated SVG does not carry attributes for it.
const staffLineBlocks = new WeakMap()
const staffLineClones = new WeakSet()

/**
 * Remember which AT block and line a regenerated staff line belongs to.
 *
 * @param {Element} line - Staff-line path.
 * @param {number} block - AT block index.
 * @param {number} lineIndex - Line index within the block.
 * @returns {void}
 */
export const setStaffLineBlock = (line, block, lineIndex) => {
  staffLineBlocks.set(line, { block, lineIndex })
}

/**
 * Returns the AT block and line a staff line belongs to.
 *
 * @param {Element} line - Staff-line path.
 * @returns {{block: number, lineIndex: number}|null} Block and line, if known.
 */
export const getStaffLineBlock = line => staffLineBlocks.get(line) || null

/**
 * Remember that a staff line was added to match the number of DT staff lines.
 *
 * @param {Element} line - Staff-line path.
 * @returns {void}
 */
export const markStaffLineClone = line => {
  staffLineClones.add(line)
}

/**
 * Returns whether a staff line was added to match the number of DT staff lines.
 *
 * @param {Element} line - Staff-line path.
 * @returns {boolean} Whether the line is such a clone.
 */
export const isStaffLineClone = line => staffLineClones.has(line)
