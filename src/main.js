import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { createDataTexture, DataFlowShader } from "./DataTexture.js";
import { createCircuitTexture, FloorShader } from "./CircuitTexture.js";
import { createGarbageTexture, GarbageShader } from "./GarbageTexture.js";
import {
  FLYTHROUGH,
  LOOP_FLYTHROUGH,
  SPLINE_FLYTHROUGH,
} from "./flythrough.js";
import { DEFAULT_FOV } from "./path.js";
import { Player, transportKey } from "./playback.js";
import { initDebug } from "./debug.js";

// --- URL Parameters ---
//   ?debug          free-fly authoring mode
//   ?speed=0.5      playback speed multiplier
//   ?start=3        begin at waypoint 3      ?t=12.5  begin 12.5s in
//   ?paused         start paused
//   ?loop=0         override LOOP_FLYTHROUGH  ?spline=0  override SPLINE_FLYTHROUGH
//   ?seed=42        deterministic scene (pillar colors, garbage column, textures)
const params = new URLSearchParams(location.search);
const DEBUG = params.has("debug");
const flag = (name, fallback) =>
  params.has(name)
    ? !["0", "false", "no", "off"].includes(params.get(name).toLowerCase())
    : fallback;

// Replace Math.random with a seeded PRNG (mulberry32) before any scene
// generation runs, so the same seed always builds the same city.
if (params.has("seed")) {
  let h = 1779033703;
  for (const ch of params.get("seed")) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  DEFAULT_FOV,
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

// --- Flythrough Player ---
const player = new Player(camera, {
  loop: flag("loop", LOOP_FLYTHROUGH),
  spline: flag("spline", SPLINE_FLYTHROUGH),
});
// Debug mode edits a copy so the imported list stays pristine.
const waypoints = DEBUG ? FLYTHROUGH.map((wp) => ({ ...wp })) : FLYTHROUGH;
player.setWaypoints(waypoints);
player.speed = Number(params.get("speed")) || 1;
player.paused = flag("paused", false);
if (params.has("start")) player.seekWaypoint(Number(params.get("start")) || 0);
if (params.has("t")) player.time = Number(params.get("t")) || 0;

const debugMode = DEBUG
  ? initDebug({ camera, scene, renderer, player, waypoints })
  : null;

if (!DEBUG) {
  // Transport keys with a brief on-screen status that fades out, so
  // recordings stay clean.
  const toast = document.createElement("div");
  toast.id = "transport-toast";
  document.body.appendChild(toast);
  let toastTimer;
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey) return;
    const msg = transportKey(player, e.code);
    if (!msg) return;
    e.preventDefault();
    toast.textContent = msg;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 1200);
  });
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

  if (debugMode) {
    debugMode.update(delta);
  } else {
    player.update(delta);
  }

  composer.render();
}

animate();
