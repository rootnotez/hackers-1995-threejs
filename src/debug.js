import * as THREE from "three";
import {
  DEFAULT_FOV,
  poseOf,
  applyPose,
  waypointFromCamera,
  formatWaypoint,
  serializeWaypoints,
} from "./path.js";
import { transportKey } from "./playback.js";

// Free-fly authoring mode (`?debug`). Edits an in-memory copy of the
// waypoints, draws the path in the scene, and can preview the flythrough
// from any waypoint. Press C to copy the edited list for flythrough.js.

const HELP = [
  "FLY      WASD move · Space/Ctrl up/down · Q/E yaw · mouse look (click to lock)",
  "         Shift fast · wheel base speed · Z/X roll · -/= fov · 0 reset roll+fov",
  "         gamepad: L stick move · R stick look · LT/RT down/up · LB/RB roll · L3 fast",
  "EDIT     ,/. select · G go to · N insert after · U update · Del delete",
  "         [/] duration ±0.5s · Shift+[/] hold ±0.5s",
  "         C copy FLYTHROUGH · P log pose · V path · H help",
  "PREVIEW  Enter play from selected / back to fly",
  "         Space pause · ←/→ waypoint · [/] speed · \\ speed 1× · R restart",
];

const DEADZONE = 0.15;
const deadzone = (v) =>
  Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);

export function initDebug({ camera, scene, renderer, player, waypoints }) {
  const canvas = renderer.domElement;
  const s = {
    mode: "fly", // "fly" | "preview"
    yaw: 0,
    pitch: 0,
    roll: 0,
    baseSpeed: 60,
    keys: new Set(),
    drag: null,
    sel: 0,
    showPath: true,
    showHelp: true,
    flash: "",
    flashUntil: 0,
  };

  const hud = document.createElement("div");
  hud.id = "debug-hud";
  document.body.appendChild(hud);

  const flash = (msg) => {
    s.flash = msg;
    s.flashUntil = performance.now() + 2000;
  };

  // Read yaw/pitch/roll back out of the camera after something else posed it.
  function syncFromCamera() {
    s.yaw = camera.rotation.y;
    s.pitch = clampPitch(camera.rotation.x);
    s.roll = camera.rotation.z;
  }

  const clampPitch = (p) =>
    Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, p));

  function goTo(i) {
    if (!waypoints[i]) return;
    applyPose(camera, poseOf(waypoints[i]));
    syncFromCamera();
  }

  function setFov(fov) {
    camera.fov = Math.min(Math.max(fov, 10), 120);
    camera.updateProjectionMatrix();
  }

  // --- Path preview geometry ---
  const pathGroup = new THREE.Group();
  pathGroup.renderOrder = 999;
  scene.add(pathGroup);
  const overlay = (color, opacity) => ({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    fog: false,
  });
  const lineMat = new THREE.LineBasicMaterial(overlay(0x00ffcc, 0.5));
  const lookMat = new THREE.LineBasicMaterial(overlay(0xffaa00, 0.5));
  const markerMat = new THREE.MeshBasicMaterial(overlay(0x00ffcc, 0.8));
  const selMat = new THREE.MeshBasicMaterial(overlay(0xffffff, 1));
  const markerGeo = new THREE.OctahedronGeometry(5);

  function rebuildPreview() {
    for (const child of [...pathGroup.children]) {
      if (child.geometry !== markerGeo) child.geometry.dispose();
      pathGroup.remove(child);
    }
    pathGroup.visible = s.showPath;
    if (waypoints.length === 0) return;

    const { posCurve } = player.path;
    const pts = posCurve
      ? posCurve.getPoints(Math.max(waypoints.length * 32, 2))
      : waypoints.map((wp) => new THREE.Vector3(...wp.pos));
    pathGroup.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat),
    );

    waypoints.forEach((wp, i) => {
      const pos = new THREE.Vector3(...wp.pos);
      const marker = new THREE.Mesh(markerGeo, i === s.sel ? selMat : markerMat);
      marker.position.copy(pos);
      if (i === s.sel) marker.scale.setScalar(1.8);
      pathGroup.add(marker);

      // Short stub showing where this waypoint looks.
      const dir = new THREE.Vector3(...wp.look).sub(pos);
      const tip = pos.clone().addScaledVector(dir.normalize(), 25);
      pathGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([pos, tip]),
          lookMat,
        ),
      );
    });
    pathGroup.traverse((o) => (o.renderOrder = 999));
  }

  function edited(msg) {
    player.setWaypoints(waypoints);
    rebuildPreview();
    if (msg) flash(msg);
  }

  // --- Editing ---
  function insertWaypoint() {
    const wp = { ...waypointFromCamera(camera), duration: 3 };
    const at = waypoints.length === 0 ? 0 : s.sel + 1;
    waypoints.splice(at, 0, wp);
    s.sel = at;
    edited(`inserted waypoint ${at}`);
  }

  function updateWaypoint() {
    const old = waypoints[s.sel];
    if (!old) return insertWaypoint();
    const wp = { ...waypointFromCamera(camera), duration: old.duration };
    if (old.hold) wp.hold = old.hold;
    if (old.ease) wp.ease = old.ease;
    waypoints[s.sel] = wp;
    edited(`updated waypoint ${s.sel}`);
  }

  function deleteWaypoint() {
    if (waypoints.length === 0) return;
    waypoints.splice(s.sel, 1);
    const gone = s.sel;
    s.sel = Math.max(0, Math.min(s.sel, waypoints.length - 1));
    edited(`deleted waypoint ${gone}`);
  }

  function adjust(field, by, min) {
    const wp = waypoints[s.sel];
    if (!wp) return;
    const next = Math.max(min, Math.round(((wp[field] ?? 0) + by) * 10) / 10);
    if (field === "hold" && next === 0) delete wp.hold;
    else wp[field] = next;
    edited(`waypoint ${s.sel} ${field} ${next}s`);
  }

  function select(dir) {
    const n = waypoints.length;
    if (n === 0) return;
    s.sel = (s.sel + dir + n) % n;
    rebuildPreview();
  }

  function copyAll() {
    const text = serializeWaypoints(waypoints);
    console.log(text);
    navigator.clipboard
      ?.writeText(text)
      .then(() => flash(`copied ${waypoints.length} waypoints`))
      .catch(() => flash("clipboard blocked — copy from console"));
  }

  function togglePreview() {
    if (s.mode === "fly") {
      if (waypoints.length === 0) return flash("no waypoints to preview");
      s.mode = "preview";
      player.paused = false;
      player.seekWaypoint(s.sel);
    } else {
      s.mode = "fly";
      s.sel = player.currentIndex();
      syncFromCamera();
      rebuildPreview();
    }
  }

  // --- Input ---
  const FLY_ACTIONS = {
    Comma: () => select(-1),
    Period: () => select(1),
    KeyG: () => goTo(s.sel),
    KeyN: insertWaypoint,
    KeyU: updateWaypoint,
    Delete: deleteWaypoint,
    Backspace: deleteWaypoint,
    BracketLeft: (e) =>
      e.shiftKey ? adjust("hold", -0.5, 0) : adjust("duration", -0.5, 0.5),
    BracketRight: (e) =>
      e.shiftKey ? adjust("hold", 0.5, 0) : adjust("duration", 0.5, 0.5),
    KeyC: copyAll,
    KeyP: () => {
      console.log(formatWaypoint({ ...waypointFromCamera(camera), duration: 3 }));
      flash("logged pose to console");
    },
    Digit0: () => {
      s.roll = 0;
      setFov(DEFAULT_FOV);
    },
  };

  window.addEventListener("keydown", (e) => {
    if (e.metaKey) return; // leave browser shortcuts alone
    if (e.code === "KeyH") s.showHelp = !s.showHelp;
    else if (e.code === "KeyV") {
      s.showPath = !s.showPath;
      pathGroup.visible = s.showPath;
    } else if (e.code === "Enter") togglePreview();
    else if (s.mode === "preview") {
      const msg = transportKey(player, e.code);
      if (msg) flash(msg);
      else return;
    } else if (FLY_ACTIONS[e.code]) {
      if (!e.repeat) FLY_ACTIONS[e.code](e);
    } else {
      s.keys.add(e.code);
    }
    e.preventDefault();
  });
  window.addEventListener("keyup", (e) => s.keys.delete(e.code));
  window.addEventListener("blur", () => s.keys.clear());

  const look = (dx, dy) => {
    s.yaw -= dx;
    s.pitch = clampPitch(s.pitch - dy);
  };

  canvas.addEventListener("mousedown", (e) => {
    s.drag = { x: e.clientX, y: e.clientY };
    if (s.mode === "fly") canvas.requestPointerLock?.();
  });
  window.addEventListener("mouseup", () => (s.drag = null));
  window.addEventListener("mousemove", (e) => {
    if (s.mode !== "fly") return;
    if (document.pointerLockElement === canvas) {
      look(e.movementX * 0.002, e.movementY * 0.002);
    } else if (s.drag) {
      // Fallback when pointer lock is unavailable (e.g. sandboxed iframes).
      look((e.clientX - s.drag.x) * 0.002, (e.clientY - s.drag.y) * 0.002);
      s.drag = { x: e.clientX, y: e.clientY };
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = (e.deltaY || e.deltaX) > 0 ? 1 / 1.15 : 1.15;
      s.baseSpeed = Math.min(Math.max(s.baseSpeed * factor, 2), 2000);
    },
    { passive: false },
  );

  // --- Per-frame ---
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const heading = new THREE.Euler();

  function fly(delta) {
    const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
    const axis = (i) => deadzone(pad?.axes[i] ?? 0);
    const btn = (i) => pad?.buttons[i]?.value ?? 0;
    const has = (code) => s.keys.has(code);
    const key = (a, b) => (has(a) ? 1 : 0) - (has(b) ? 1 : 0);

    const fast = has("ShiftLeft") || has("ShiftRight") || btn(10) > 0.5;
    const speed = s.baseSpeed * (fast ? 3.33 : 1) * delta;

    // Gamepad look (rad/s at full deflection).
    look(axis(2) * 2.5 * delta, axis(3) * 2.0 * delta);
    s.yaw += (key("KeyQ", "KeyE") * 1.5) * delta;
    s.roll += (key("KeyZ", "KeyX") + btn(4) - btn(5)) * THREE.MathUtils.degToRad(45) * delta;
    const zoom = key("Equal", "Minus");
    if (zoom) setFov(camera.fov + zoom * 30 * delta);

    camera.rotation.set(s.pitch, s.yaw, s.roll);

    // Move relative to heading only, so roll doesn't skew WASD.
    fwd.set(0, 0, -1).applyEuler(heading.set(s.pitch, s.yaw, 0, "YXZ"));
    right.crossVectors(fwd, UP).normalize();

    const forward = key("KeyW", "KeyS") - axis(1);
    const strafe = key("KeyD", "KeyA") + axis(0);
    const lift =
      key("Space", "ControlLeft") - (has("ControlRight") ? 1 : 0) + btn(7) - btn(6);
    camera.position.addScaledVector(fwd, forward * speed);
    camera.position.addScaledVector(right, strafe * speed);
    camera.position.y += lift * speed;
  }

  function renderHud() {
    const p = camera.position;
    const deg = (r) => THREE.MathUtils.radToDeg(r).toFixed(1);
    const wp = waypoints[s.sel];
    const lines = [];
    if (s.mode === "fly") {
      lines.push(`FLY      base speed ${s.baseSpeed.toFixed(0)}`);
    } else {
      const status = player.paused ? "  [paused]" : "";
      lines.push(
        `PREVIEW  t ${player.time.toFixed(1)} / ${player.path.duration.toFixed(1)}s` +
          `  speed ${player.speed.toFixed(2)}×  wp ${player.currentIndex()}${status}`,
      );
    }
    lines.push(
      `pos  [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}]` +
        `  yaw ${deg(camera.rotation.y)}°  pitch ${deg(camera.rotation.x)}°` +
        `  roll ${deg(camera.rotation.z)}°  fov ${camera.fov.toFixed(1)}`,
    );
    const mode = `${player.spline ? "spline" : "linear"}${player.loop ? " loop" : ""}`;
    lines.push(
      wp
        ? `wp   ${s.sel} / ${waypoints.length - 1}  duration ${wp.duration ?? 1}s` +
            `  hold ${wp.hold ?? 0}s  · ${mode}${player.path.closed ? " (closed)" : ""}`
        : `wp   none — N to insert · ${mode}`,
    );
    if (performance.now() < s.flashUntil) lines.push(`» ${s.flash}`);
    if (s.showHelp) lines.push("", ...HELP);
    hud.textContent = lines.join("\n");
  }

  // Start at the first waypoint so editing begins on the existing path.
  if (waypoints.length > 0) goTo(0);
  else {
    camera.position.set(0, 200, 400);
    camera.lookAt(0, 0, 0);
    syncFromCamera();
  }
  rebuildPreview();

  return {
    update(delta) {
      if (s.mode === "preview") player.update(delta);
      else fly(Math.min(delta, 0.1));
      renderHud();
    },
  };
}
