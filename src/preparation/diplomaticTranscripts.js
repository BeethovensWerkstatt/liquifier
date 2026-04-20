/**
 * Processes xycontrolpoints for this operation.
 *
 * @param {Object} bezier - Input object used by this function.
 * @param {Object} options2 - Structured options object.
 * @param {number} factor - Numeric input used by this function.
 * @returns {void} No return value.
 */
export const scaleXYControlpoints = (bezier, { x, y }, factor = 90) => bezier.map((c, i) => factor * (c + (i % 2 ? y : x)))
