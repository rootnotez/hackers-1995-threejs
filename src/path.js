import * as THREE from "three";
import * as EASE from "./easing.js";

// Camera path math shared by the flythrough player and debug authoring mode.
//
// A waypoint is { pos, look, duration, hold?, ease?, fov?, roll? } — see
// flythrough.js for field docs.

export const DEFAULT_FOV = 75;

const LOOK_DISTANCE = 100;

function samePose(a, b) {
  const eq = (u, v) => u.every((x, i) => Math.abs(x - v[i]) < 0.01);
  return eq(a.pos, b.pos) && eq(a.look, b.look);
}

// Precompute the timeline (and spline curves, if enabled) for a waypoint list.
// When looping a spline whose last waypoint repeats the first, the curve is
// closed so the camera flows through the loop point without a kink.
export function buildPath(waypoints, { loop, spline }) {
  const n = waypoints.length;
  const closed =
    spline && loop && n > 2 && samePose(waypoints[0], waypoints[n - 1]);
  const points = closed ? waypoints.slice(0, -1) : waypoints;

  let posCurve = null;
  let lookCurve = null;
  if (spline && n > 1) {
    const curve = (key) =>
      new THREE.CatmullRomCurve3(
        points.map((wp) => new THREE.Vector3(...wp[key])),
        closed,
        "centripetal",
      );
    posCurve = curve("pos");
    lookCurve = curve("look");
  }

  // Timeline entries: "travel" into waypoint i, then an optional "hold" on it.
  const entries = [];
  const arrivals = [];
  let t = 0;
  waypoints.forEach((wp, i) => {
    if (i > 0) {
      const d = Math.max(wp.duration ?? 1, 0);
      entries.push({ type: "travel", i, start: t, end: t + d });
      t += d;
    }
    arrivals.push(t);
    if (wp.hold > 0) {
      entries.push({ type: "hold", i, start: t, end: t + wp.hold });
      t += wp.hold;
    }
  });

  return {
    waypoints,
    loop,
    spline,
    closed,
    posCurve,
    lookCurve,
    divisor: closed ? points.length : n - 1,
    entries,
    arrivals,
    duration: t,
  };
}

// Wrap (loop) or clamp a playback time into the path's range.
export function normalizeTime(path, time) {
  if (path.duration <= 0) return 0;
  if (path.loop) return ((time % path.duration) + path.duration) % path.duration;
  return Math.min(Math.max(time, 0), path.duration);
}

export function poseOf(wp) {
  return {
    pos: new THREE.Vector3(...wp.pos),
    look: new THREE.Vector3(...wp.look),
    fov: wp.fov ?? DEFAULT_FOV,
    roll: wp.roll ?? 0,
  };
}

function interpolate(path, k, e) {
  const a = path.waypoints[k];
  const b = path.waypoints[k + 1];
  let pos, look;
  if (path.posCurve) {
    const u = Math.min((k + e) / path.divisor, 1);
    pos = path.posCurve.getPoint(u);
    look = path.lookCurve.getPoint(u);
  } else {
    pos = new THREE.Vector3(...a.pos).lerp(new THREE.Vector3(...b.pos), e);
    look = new THREE.Vector3(...a.look).lerp(new THREE.Vector3(...b.look), e);
  }
  const lerp = (x, y) => x + (y - x) * e;
  return {
    pos,
    look,
    fov: lerp(a.fov ?? DEFAULT_FOV, b.fov ?? DEFAULT_FOV),
    roll: lerp(a.roll ?? 0, b.roll ?? 0),
  };
}

// Camera pose at `time` seconds into the path, or null if there are no waypoints.
export function evaluate(path, time) {
  const { waypoints, entries } = path;
  if (waypoints.length === 0) return null;
  if (waypoints.length === 1 || path.duration <= 0) return poseOf(waypoints[0]);

  const t = normalizeTime(path, time);
  for (const en of entries) {
    if (t > en.end) continue;
    if (en.type === "hold") return poseOf(waypoints[en.i]);
    const span = en.end - en.start;
    const local = span > 0 ? (t - en.start) / span : 1;
    // Splines default to linear so motion flows through waypoints; the
    // straight-line mode keeps its original ease-out-and-settle feel.
    const ease =
      waypoints[en.i].ease || (path.spline ? EASE.linear : EASE.outCubic);
    return interpolate(path, en.i - 1, ease(local));
  }
  return poseOf(waypoints[waypoints.length - 1]);
}

export function applyPose(camera, pose) {
  camera.position.copy(pose.pos);
  camera.lookAt(pose.look);
  camera.rotateZ(THREE.MathUtils.degToRad(pose.roll));
  if (camera.fov !== pose.fov) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}

// Waypoint fields (pos/look/fov/roll) describing the camera's current pose.
// Assumes rotation order "YXZ", so rotation.z is the roll about the view axis.
export function waypointFromCamera(camera) {
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const look = camera.position.clone().addScaledVector(fwd, LOOK_DISTANCE);
  const r = (n) => Math.round(n * 10) / 10;
  const wp = {
    pos: camera.position.toArray().map(r),
    look: look.toArray().map(r),
  };
  if (Math.abs(camera.fov - DEFAULT_FOV) > 0.05) wp.fov = r(camera.fov);
  const roll = THREE.MathUtils.radToDeg(camera.rotation.z);
  if (Math.abs(roll) > 0.05) wp.roll = r(roll);
  return wp;
}

const easeName = (fn) =>
  Object.entries(EASE).find(([, f]) => f === fn)?.[0] ?? null;

export function formatWaypoint(wp) {
  const num = (n) => String(Math.round(n * 100) / 100);
  const vec = (v) => `[${v.map(num).join(", ")}]`;
  const parts = [`pos: ${vec(wp.pos)}`, `look: ${vec(wp.look)}`];
  parts.push(`duration: ${num(wp.duration ?? 1)}`);
  if (wp.hold > 0) parts.push(`hold: ${num(wp.hold)}`);
  if (wp.fov != null) parts.push(`fov: ${num(wp.fov)}`);
  if (wp.roll != null) parts.push(`roll: ${num(wp.roll)}`);
  let comment = "";
  if (wp.ease) {
    const name = easeName(wp.ease);
    if (name) parts.push(`ease: ease.${name}`);
    else comment = " // custom ease not exported — re-add by hand";
  }
  return `  { ${parts.join(", ")} },${comment}`;
}

// Source text for the FLYTHROUGH array, ready to paste into flythrough.js.
export function serializeWaypoints(waypoints) {
  return `export const FLYTHROUGH = [\n${waypoints.map(formatWaypoint).join("\n")}\n];\n`;
}
