// Camera flythrough waypoints.
//
// Each entry: { pos: [x,y,z], look: [x,y,z], duration, ease? }
//   - `pos`      world-space camera position
//   - `look`     world-space point the camera aims at
//   - `duration` seconds to travel from the PREVIOUS waypoint to this one
//                (the first waypoint's duration is ignored — it's the starting pose)
//   - `ease`     optional easing fn t->t (default: easeOutCubic)
//
// Author waypoints by running `npm run dev` and opening `?debug` to free-fly
// the scene. Press `P` to log the current pose to the console; paste it here.
//
// City extents (for orientation):
//   - Floor is roughly 1300 (X) x 660 (Z), centered at origin.
//   - Buildings are 15 tall on a 16-unit grid.
//   - Y=2 puts the camera at street level; Y=300+ is overhead.

export const LOOP_FLYTHROUGH = true;

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const FLYTHROUGH = [
  // High overhead establishing shot
  { pos: [0, 500, 1000], look: [0, 0, 0], duration: 0 },

  // Swoop down toward the city
  { pos: [400, 120, 400], look: [0, 10, 0], duration: 6, ease: easeInOutCubic },

  // Skim along a horizontal avenue
  { pos: [300, 8, 0], look: [-300, 8, 0], duration: 5, ease: easeInOutCubic },
  { pos: [-300, 8, 0], look: [-600, 8, 0], duration: 5, ease: easeInOutCubic },

  // Pull up and back for an outro
  { pos: [-600, 200, 400], look: [0, 0, 0], duration: 6, ease: easeInOutCubic },

  // Loop back to the establishing shot
  { pos: [0, 500, 1000], look: [0, 0, 0], duration: 6, ease: easeInOutCubic },
];
