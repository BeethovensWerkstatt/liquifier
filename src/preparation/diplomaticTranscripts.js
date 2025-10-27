/**
 * get control points for curve bezier attribute for rastrum on position x/y with factor (default 90)
 */
export const scaleXYControlpoints = (bezier, { x, y }, factor = 90) => bezier.map((c, i) => factor * (c + (i % 2 ? y : x)))
