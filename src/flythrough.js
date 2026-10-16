// Camera flythrough waypoints.
//
// Each entry: { pos: [x,y,z], look: [x,y,z], duration, hold?, ease?, fov?, roll? }
//   - `pos`      world-space camera position
//   - `look`     world-space point the camera aims at
//   - `duration` seconds to travel from the PREVIOUS waypoint to this one
//                (the first waypoint's duration is ignored — it's the starting pose)
//   - `hold`     optional seconds to pause on this waypoint after arriving
//   - `ease`     optional easing for the travel into this waypoint, e.g.
//                `ease.inOutCubic` (see easing.js). Defaults to linear for
//                spline paths and outCubic for straight-line paths. A non-linear
//                ease on a spline makes the camera slow down at that waypoint.
//   - `fov`      optional vertical field of view in degrees (default 75)
//   - `roll`     optional roll in degrees about the view direction (default 0)
//
// Author waypoints by opening `?debug` to free-fly the scene: insert/update
// waypoints in place, preview with Enter, then press C to copy the whole
// array and paste it over FLYTHROUGH below.
//
// City extents (for orientation):
//   - Floor is roughly 1300 (X) x 660 (Z), centered at origin.
//   - Buildings are 15 tall on a 16-unit grid.
//   - Y=2 puts the camera at street level; Y=300+ is overhead.

import * as ease from "./easing.js";

export const LOOP_FLYTHROUGH = true;

// Smooth Catmull-Rom curve through all waypoints (true) or straight lines
// between them (false). When looping, end on a copy of the first waypoint so
// the curve closes seamlessly.
export const SPLINE_FLYTHROUGH = true;

export const FLYTHROUGH = [
  // High overhead establishing shot
  { pos: [0, 500, 1000], look: [0, 0, 0], duration: 0 },

  // Swoop down toward the city
  { pos: [400, 120, 400], look: [0, 10, 0], duration: 6 },

  // Skim along a horizontal avenue
  { pos: [300, 8, 0], look: [-300, 8, 0], duration: 5 },
  { pos: [-300, 8, 0], look: [-600, 8, 0], duration: 5 },

  // Pull up and back for an outro
  { pos: [-600, 200, 400], look: [0, 0, 0], duration: 6 },

  // Loop back to the establishing shot
  { pos: [0, 500, 1000], look: [0, 0, 0], duration: 6 },
];
