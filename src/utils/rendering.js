/**
 * Check whether a render output should be regenerated.
 *
 * @param {boolean} recreate - Force recreation flag.
 * @param {Date[]} sourceDates - Source file dates.
 * @param {Date} outputDate - Existing output date.
 * @returns {boolean} True when rendering should run.
 */
export function shouldRender (recreate, sourceDates, outputDate) {
  if (recreate) return true
  return sourceDates.some(sourceDate => sourceDate.getTime() > outputDate.getTime())
}
