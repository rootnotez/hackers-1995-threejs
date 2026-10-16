# Hackers 1995 — Flythrough

Stripped-down fork of David Vidovic's [Hackers (1995) Three.js scene](https://davidvidovic.com), repurposed as a scriptable camera flythrough. The original game (leaderboard, music, intro UI, controls, Vercel backend) lives on the `main` branch; this branch keeps only the scene and a waypoint-driven camera.

Three.js is vendored locally in `vendor/` and loaded via an importmap — no build step, no Node, no npm, no CDN.

## Run locally with podman

### Quick (no image build)

```bash
podman run --rm -p 8080:80 -v "$PWD":/usr/share/nginx/html:z nginx:alpine
```

Open <http://localhost:8080>.

### From the Containerfile

```bash
podman build -t hackers-flythrough .
podman run --rm --name hackers-flythrough -p 8080:80 hackers-flythrough
```

Stop with `Ctrl-C` or `podman stop hackers-flythrough`.

## Deploy to GitHub Pages

No workflow needed. In the repo settings under **Pages**, set the source to **Deploy from a branch**, select the `flythrough` branch, and root (`/`). GitHub will serve the static files directly.

Live at: <https://rootnotez.github.io/hackers-1995-threejs/>

## Authoring the flythrough

Camera waypoints live in [`src/flythrough.js`](src/flythrough.js). Each entry is `{ pos: [x,y,z], look: [x,y,z], duration, hold?, ease?, fov?, roll? }`; `duration` is seconds spent traveling *from* the previous waypoint *to* this one, and `hold` pauses on the waypoint after arriving. `SPLINE_FLYTHROUGH` switches between a smooth Catmull-Rom curve through all waypoints (default) and straight lines between them.

### Playback controls

| Key | Action |
|---|---|
| `Space` | pause / play |
| `←` / `→` | previous / next waypoint |
| `[` / `]` | slower / faster |
| `\` | reset speed to 1× |
| `R` | restart |

URL parameters, combinable: `?speed=0.5`, `?start=3` (begin at waypoint 3), `?t=12.5` (begin 12.5 s in), `?paused`, `?loop=0`, `?spline=0`, `?seed=42` (deterministic city — same pillar colors, garbage column, and textures every load).

### Debug authoring mode

Open <http://localhost:8080/?debug>. It edits an in-memory copy of the waypoints, draws the path (cyan line, waypoint markers, orange look-direction stubs), and starts at waypoint 0.

| Input | Action |
|---|---|
| `WASD` | move along the view direction |
| `Space` / `Ctrl` | up / down |
| `Q` / `E` | yaw |
| mouse | look (click to lock the pointer, `Esc` to release) |
| `Shift` | fast |
| mouse wheel | base speed |
| `Z` / `X` | roll |
| `-` / `=` | field of view |
| `0` | reset roll and FOV |
| `,` / `.` | select previous / next waypoint |
| `G` | jump camera to selected waypoint |
| `N` | insert a waypoint at the current pose after the selected one |
| `U` | update selected waypoint to the current pose (keeps duration, hold, ease) |
| `Delete` / `Backspace` | delete selected waypoint |
| `[` / `]` | selected waypoint's duration ±0.5 s |
| `Shift+[` / `Shift+]` | selected waypoint's hold ±0.5 s |
| `Enter` | preview the flythrough from the selected waypoint; `Enter` again returns to free-fly at the current pose. Playback keys work while previewing. |
| `C` | copy the whole `FLYTHROUGH` array to the clipboard (also logged to the console) |
| `P` | log just the current pose to the console |
| `V` | toggle path overlay |
| `H` | toggle help |

A standard gamepad also works: left stick moves, right stick looks, `LT`/`RT` down/up, `LB`/`RB` roll, `L3` fast.

Edits are lost on reload, so press `C` and paste over `FLYTHROUGH` in `src/flythrough.js` before refreshing. Comments in the array aren't preserved.

## Scene reference

The city floor is roughly 1300 × 660 units (X × Z), centered at the origin. Buildings are 15 units tall on a 16-unit grid. `Y=2` is street level; `Y≥300` is overhead. Bloom (`CONFIG.bloom` in `src/main.js`) is tuned for those distances — retune if your waypoints sit much higher or lower.

## Updating Three.js

The `vendor/` directory contains a pinned copy of `three@0.160.0`. To upgrade:

1. Set the new version in a variable and re-download the files:

```bash
VER=0.161.0  # replace with target version
BASE="https://unpkg.com/three@$VER"

curl -sL "$BASE/build/three.module.js" -o vendor/three.module.js
curl -sL "$BASE/examples/jsm/postprocessing/EffectComposer.js" -o vendor/examples/jsm/postprocessing/EffectComposer.js
curl -sL "$BASE/examples/jsm/postprocessing/RenderPass.js"     -o vendor/examples/jsm/postprocessing/RenderPass.js
curl -sL "$BASE/examples/jsm/postprocessing/UnrealBloomPass.js" -o vendor/examples/jsm/postprocessing/UnrealBloomPass.js
curl -sL "$BASE/examples/jsm/postprocessing/Pass.js"           -o vendor/examples/jsm/postprocessing/Pass.js
curl -sL "$BASE/examples/jsm/postprocessing/ShaderPass.js"     -o vendor/examples/jsm/postprocessing/ShaderPass.js
curl -sL "$BASE/examples/jsm/postprocessing/MaskPass.js"       -o vendor/examples/jsm/postprocessing/MaskPass.js
curl -sL "$BASE/examples/jsm/shaders/CopyShader.js"            -o vendor/examples/jsm/shaders/CopyShader.js
curl -sL "$BASE/examples/jsm/shaders/LuminosityHighPassShader.js" -o vendor/examples/jsm/shaders/LuminosityHighPassShader.js
```

2. Check for any new transitive imports the postprocessing files may have added:

```bash
grep "^import" vendor/examples/jsm/postprocessing/*.js vendor/examples/jsm/shaders/*.js
```

Download any new relative paths that aren't already present, then load the page and confirm the flythrough still runs.

The importmap in `index.html` only needs updating if the top-level entry-point paths change (unlikely between minor versions).

## Credits

Original scene by **David Vidovic** — [davidvidovic.com](https://davidvidovic.com).
