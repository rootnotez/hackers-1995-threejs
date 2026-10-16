import { buildPath, evaluate, applyPose, normalizeTime } from "./path.js";

// Plays a waypoint path on the camera with its own clock, so it can be
// paused, scrubbed, and sped up independently of the shader animation.
export class Player {
  constructor(camera, { loop, spline }) {
    this.camera = camera;
    this.loop = loop;
    this.spline = spline;
    this.time = 0;
    this.speed = 1;
    this.paused = false;
    this.path = buildPath([], { loop, spline });
  }

  setWaypoints(waypoints) {
    this.path = buildPath(waypoints, { loop: this.loop, spline: this.spline });
  }

  update(delta) {
    if (!this.paused) this.time += delta * this.speed;
    this.time = normalizeTime(this.path, this.time);
    const pose = evaluate(this.path, this.time);
    if (pose) applyPose(this.camera, pose);
  }

  seekWaypoint(i) {
    const { arrivals } = this.path;
    if (arrivals.length === 0) return;
    i = Math.min(Math.max(i, 0), arrivals.length - 1);
    this.time = normalizeTime(this.path, arrivals[i]);
  }

  // Index of the waypoint most recently reached.
  currentIndex() {
    const { arrivals } = this.path;
    let idx = 0;
    arrivals.forEach((a, i) => {
      if (a <= this.time + 1e-3) idx = i;
    });
    return idx;
  }

  // Jump to the next/previous waypoint. Going back from just past a waypoint
  // skips to the one before it, like a media player's "previous track".
  step(dir) {
    const { arrivals } = this.path;
    const n = arrivals.length;
    if (n === 0) return 0;
    let target;
    if (dir > 0) {
      target = arrivals.findIndex((a) => a > this.time + 1e-3);
      if (target === -1) target = this.loop ? 0 : n - 1;
    } else {
      target = arrivals.findLastIndex((a) => a < this.time - 0.25);
      if (target === -1) target = this.loop ? n - 1 : 0;
    }
    this.seekWaypoint(target);
    // A looped path's last waypoint wraps to time 0, i.e. waypoint 0.
    return this.currentIndex();
  }
}

// Shared playback keys. Returns a short status string for on-screen feedback,
// or null if the key isn't a transport key.
export function transportKey(player, code) {
  switch (code) {
    case "Space":
      player.paused = !player.paused;
      return player.paused ? "paused" : "playing";
    case "ArrowRight":
      return `waypoint ${player.step(1)}`;
    case "ArrowLeft":
      return `waypoint ${player.step(-1)}`;
    case "BracketRight":
      player.speed = Math.min(player.speed * 1.25, 8);
      return `speed ${player.speed.toFixed(2)}×`;
    case "BracketLeft":
      player.speed = Math.max(player.speed / 1.25, 0.05);
      return `speed ${player.speed.toFixed(2)}×`;
    case "Backslash":
      player.speed = 1;
      return "speed 1.00×";
    case "KeyR":
      player.time = 0;
      return "restart";
    default:
      return null;
  }
}
