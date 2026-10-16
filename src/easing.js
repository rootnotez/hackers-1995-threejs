// Easing curves for waypoint `ease` fields. Each maps t in [0,1] -> [0,1].
// Exported by name so the debug-mode copy (C) can write them back as
// `ease: ease.inOutCubic` in flythrough.js.

export const linear = (t) => t;
export const inCubic = (t) => t * t * t;
export const outCubic = (t) => 1 - Math.pow(1 - t, 3);
export const inOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const inOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
