import "./style.css";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { createDataTexture, DataFlowShader } from "./DataTexture.js";
import { createCircuitTexture, FloorShader } from "./CircuitTexture.js";
import { createGarbageTexture, GarbageShader } from "./GarbageTexture.js";
import { FLYTHROUGH, LOOP_FLYTHROUGH } from "./flythrough.js";

// Toggle with `?debug` in the URL to enable free-fly authoring mode.
const DEBUG = new URLSearchParams(location.search).has("debug");

// --- Configuration ---
const CONFIG = {
  colors: {
    background: 0x050510,
    floorBase: 0x0a0a1a,
    floorHighlight: 0x1b4ac2,
    pillarBase: 0x111122,
    pillarData: 0xbf00ff,
  },
  bloom: {
    strength: 0.5,
    radius: 0.2,
    threshold: 0.2,
  },
};

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.background);
scene.fog = new THREE.FogExp2(CONFIG.colors.background, 0.002);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ReinhardToneMapping;
document.querySelector("#app").appendChild(renderer.domElement);

// --- Lighting ---
scene.add(new THREE.AmbientLight(0x404040, 2));
const pointLight = new THREE.PointLight(0xff00ff, 2, 50);
pointLight.position.set(0, 10, 0);
scene.add(pointLight);

// --- City Grid ---
const gridCols = 80;
const gridRows = 40;
const spacing = 16;
const boxWidth = 6;
const boxHeight = 15;

const floorWidth = gridCols * spacing + 20;
const floorDepth = gridRows * spacing + 20;
const floorGeometry = new THREE.PlaneGeometry(floorWidth, floorDepth, 100, 50);
const circuitTexture = createCircuitTexture();

const floorMaterial = new THREE.ShaderMaterial({
  vertexShader: FloorShader.vertexShader,
  fragmentShader: FloorShader.fragmentShader,
  uniforms: {
    uTexture: { value: circuitTexture },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(CONFIG.colors.floorHighlight) },
    uFloorSize: { value: new THREE.Vector2(floorWidth, floorDepth) },
    uSpacing: { value: spacing },
    uBoxWidth: { value: boxWidth },
  },
  transparent: false,
  side: THREE.DoubleSide,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const pillarGroup = new THREE.Group();
scene.add(pillarGroup);

const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxWidth);
const dataTexture = createDataTexture();

const neonColors = [0xc692ff, 0x98fce8, 0x4d8dff];
const materialsByColor = [];

neonColors.forEach((colorHex, pIndex) => {
  materialsByColor[pIndex] = [];
  for (let i = 0; i < 8; i++) {
    const col = new THREE.Color(colorHex);
    const otherIndices = neonColors
      .map((_, idx) => idx)
      .filter((idx) => idx !== pIndex);
    const idx2 = otherIndices.splice(
      Math.floor(Math.random() * otherIndices.length),
      1,
    )[0];
    const idx3 = otherIndices.splice(
      Math.floor(Math.random() * otherIndices.length),
      1,
    )[0];
    const col2 = new THREE.Color(neonColors[idx2]);
    const col3 = new THREE.Color(neonColors[idx3]);

    const mat = new THREE.ShaderMaterial({
      vertexShader: DataFlowShader.vertexShader,
      fragmentShader: DataFlowShader.fragmentShader,
      uniforms: {
        uTexture: { value: dataTexture },
        uTime: { value: 0 },
        uColor: { value: col },
        uColor2: { value: col2 },
        uColor3: { value: col3 },
        uBorderColor: { value: col },
        uSpeed: { value: 0.1 },
      },
      transparent: true,
      side: THREE.FrontSide,
    });

    const edgeMat = new THREE.LineBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.4,
    });

    materialsByColor[pIndex].push({ face: mat, edge: edgeMat });
  }
});

const garbageTexture = createGarbageTexture();
const garbageMaterial = new THREE.ShaderMaterial({
  vertexShader: GarbageShader.vertexShader,
  fragmentShader: GarbageShader.fragmentShader,
  uniforms: {
    uTexture: { value: garbageTexture },
    uTime: { value: 0 },
  },
  transparent: true,
  side: THREE.FrontSide,
});

const garbageEdgeMaterial = new THREE.LineBasicMaterial({
  color: 0xab49e3,
  transparent: true,
  opacity: 0.8,
});

const garbageBaseMaterial = new THREE.MeshBasicMaterial({
  color: 0x020205,
  transparent: true,
  opacity: 0.8,
});

const startX = -((gridCols - 1) * spacing) / 2;
const startZ = -((gridRows - 1) * spacing) / 2;

function getShaderSeed(x, z) {
  const dot = x * 12.9898 + z * 78.233;
  const sinVal = Math.sin(dot);
  const prod = sinVal * 43758.5453;
  return prod - Math.floor(prod);
}

let garbageR, garbageC;
let attempts = 0;
do {
  garbageR = Math.floor(Math.random() * gridRows);
  garbageC = Math.floor(Math.random() * gridCols);
  const testX = startX + garbageC * spacing;
  const testZ = startZ + garbageR * spacing;
  const seed = getShaderSeed(testX, testZ);
  const isVoid =
    (garbageR === 3 || garbageR === 4) && (garbageC === 7 || garbageC === 8);
  const isStatic = seed < 0.45;
  if (!isVoid && isStatic) break;
} while (attempts++ < 1000);

const edgesGeometry = new THREE.EdgesGeometry(geometry);

for (let r = 0; r < gridRows; r++) {
  for (let c = 0; c < gridCols; c++) {
    const noise = (Math.random() - 0.5) * 20.0;
    let gradientPos = (c + noise) / gridCols;
    gradientPos = Math.max(0.0, Math.min(0.999, gradientPos));
    const themeIndex = Math.floor(gradientPos * neonColors.length);

    const variations = materialsByColor[themeIndex];
    const selectedSet =
      variations[Math.floor(Math.random() * variations.length)];
    const selectedMaterial = selectedSet.face;
    const selectedEdgeMaterial = selectedSet.edge;

    if (r === garbageR && c === garbageC) {
      const validSides = [0, 1, 4, 5];
      const sideIndex =
        validSides[Math.floor(Math.random() * validSides.length)];
      const baseMat = selectedMaterial;
      const garbageMaterials = Array(6).fill(baseMat);
      garbageMaterials[sideIndex] = garbageMaterial;
      garbageMaterials[2] = garbageBaseMaterial;
      garbageMaterials[3] = garbageBaseMaterial;

      const mesh = new THREE.Mesh(geometry, garbageMaterials);
      mesh.position.set(
        startX + c * spacing,
        boxHeight / 2,
        startZ + r * spacing,
      );
      pillarGroup.add(mesh);

      const edges = new THREE.LineSegments(edgesGeometry, selectedEdgeMaterial);
      mesh.add(edges);
      continue;
    }

    if ((r === 3 || r === 4) && (c === 7 || c === 8)) continue;

    const mesh = new THREE.Mesh(geometry, selectedMaterial);
    mesh.position.set(
      startX + c * spacing,
      boxHeight / 2,
      startZ + r * spacing,
    );
    pillarGroup.add(mesh);

    const edges = new THREE.LineSegments(edgesGeometry, selectedEdgeMaterial);
    mesh.add(edges);
  }
}

// --- Post Processing ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    CONFIG.bloom.strength,
    CONFIG.bloom.radius,
    CONFIG.bloom.threshold,
  ),
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// --- Flythrough Driver ---
// Each waypoint: { pos: [x,y,z], look: [x,y,z], duration: seconds, ease?: fn }
// duration on a waypoint = time spent traveling FROM the previous waypoint TO this one.
// The first waypoint's duration is ignored (it's the starting pose).
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function applyWaypoint(wp) {
  camera.position.set(wp.pos[0], wp.pos[1], wp.pos[2]);
  camera.lookAt(wp.look[0], wp.look[1], wp.look[2]);
}

function lerpWaypoint(a, b, t, ease) {
  const e = (ease || easeOutCubic)(t);
  camera.position.set(
    a.pos[0] + (b.pos[0] - a.pos[0]) * e,
    a.pos[1] + (b.pos[1] - a.pos[1]) * e,
    a.pos[2] + (b.pos[2] - a.pos[2]) * e,
  );
  const lx = a.look[0] + (b.look[0] - a.look[0]) * e;
  const ly = a.look[1] + (b.look[1] - a.look[1]) * e;
  const lz = a.look[2] + (b.look[2] - a.look[2]) * e;
  camera.lookAt(lx, ly, lz);
}

const segments = [];
let totalDuration = 0;
for (let i = 1; i < FLYTHROUGH.length; i++) {
  const dur = FLYTHROUGH[i].duration ?? 1;
  segments.push({
    from: FLYTHROUGH[i - 1],
    to: FLYTHROUGH[i],
    start: totalDuration,
    end: totalDuration + dur,
    ease: FLYTHROUGH[i].ease,
  });
  totalDuration += dur;
}

function updateFlythrough(elapsed) {
  if (FLYTHROUGH.length === 0) return;
  if (FLYTHROUGH.length === 1) {
    applyWaypoint(FLYTHROUGH[0]);
    return;
  }

  let t = elapsed;
  if (LOOP_FLYTHROUGH) {
    t = totalDuration > 0 ? elapsed % totalDuration : 0;
  } else if (t >= totalDuration) {
    applyWaypoint(FLYTHROUGH[FLYTHROUGH.length - 1]);
    return;
  }

  for (const seg of segments) {
    if (t <= seg.end) {
      const local = (t - seg.start) / (seg.end - seg.start);
      lerpWaypoint(seg.from, seg.to, local, seg.ease);
      return;
    }
  }
  applyWaypoint(FLYTHROUGH[FLYTHROUGH.length - 1]);
}

// --- Debug Free-Fly (authoring mode) ---
// WASD/QE/Space/Shift to move; mouse-drag to look; press P to log a waypoint
// with the current pose (paste into flythrough.js).
const debug = {
  enabled: DEBUG,
  yaw: 0,
  pitch: 0,
  keys: {},
  drag: { active: false, x: 0, y: 0 },
  hud: null,
};

if (DEBUG) {
  camera.position.set(0, 200, 400);
  camera.lookAt(0, 0, 0);
  debug.yaw = camera.rotation.y;
  debug.pitch = camera.rotation.x;

  debug.hud = document.createElement("div");
  debug.hud.id = "debug-hud";
  document.body.appendChild(debug.hud);

  window.addEventListener("keydown", (e) => {
    debug.keys[e.key.toLowerCase()] = true;
    if (e.key === "p" || e.key === "P") logCurrentPose();
  });
  window.addEventListener("keyup", (e) => {
    debug.keys[e.key.toLowerCase()] = false;
  });

  renderer.domElement.addEventListener("mousedown", (e) => {
    debug.drag.active = true;
    debug.drag.x = e.clientX;
    debug.drag.y = e.clientY;
  });
  window.addEventListener("mouseup", () => (debug.drag.active = false));
  window.addEventListener("mousemove", (e) => {
    if (!debug.drag.active) return;
    const dx = e.clientX - debug.drag.x;
    const dy = e.clientY - debug.drag.y;
    debug.yaw -= dx * 0.002;
    debug.pitch -= dy * 0.002;
    debug.pitch = Math.max(
      -Math.PI / 2 + 0.1,
      Math.min(Math.PI / 2 - 0.1, debug.pitch),
    );
    debug.drag.x = e.clientX;
    debug.drag.y = e.clientY;
  });
}

function logCurrentPose() {
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const look = camera.position.clone().add(fwd.multiplyScalar(20));
  const fmt = (n) => n.toFixed(1);
  const wp = `  { pos: [${fmt(camera.position.x)}, ${fmt(camera.position.y)}, ${fmt(camera.position.z)}], look: [${fmt(look.x)}, ${fmt(look.y)}, ${fmt(look.z)}], duration: 3 },`;
  console.log(wp);
}

function updateDebug(delta) {
  const speed = (debug.keys["shift"] ? 200 : 60) * delta;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();

  if (debug.keys["w"]) camera.position.addScaledVector(fwd, speed);
  if (debug.keys["s"]) camera.position.addScaledVector(fwd, -speed);
  if (debug.keys["d"]) camera.position.addScaledVector(right, speed);
  if (debug.keys["a"]) camera.position.addScaledVector(right, -speed);
  if (debug.keys[" "]) camera.position.y += speed;
  if (debug.keys["control"]) camera.position.y -= speed;
  if (debug.keys["q"]) debug.yaw += 1.5 * delta;
  if (debug.keys["e"]) debug.yaw -= 1.5 * delta;

  camera.rotation.y = debug.yaw;
  camera.rotation.x = debug.pitch;

  const p = camera.position;
  debug.hud.textContent =
    `pos  [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}]\n` +
    `yaw  ${debug.yaw.toFixed(2)}  pitch ${debug.pitch.toFixed(2)}\n` +
    `WASD move · Q/E yaw · Space/Ctrl up/down · Shift = fast\n` +
    `P = log waypoint to console`;
}

// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Drive shader time uniforms
  materialsByColor.forEach((variations) =>
    variations.forEach((set) => (set.face.uniforms.uTime.value = elapsed)),
  );
  floorMaterial.uniforms.uTime.value = elapsed;
  garbageMaterial.uniforms.uTime.value = elapsed;
  garbageEdgeMaterial.opacity = 0.5 + 0.5 * Math.sin(elapsed * 8.0);

  if (DEBUG) {
    updateDebug(delta);
  } else {
    updateFlythrough(elapsed);
  }

  composer.render();
}

animate();
