# Hackers 1995 — Flythrough

Stripped-down fork of David Vidovic's [Hackers (1995) Three.js scene](https://davidvidovic.com), repurposed as a scriptable camera flythrough. The original game (leaderboard, music, intro UI, controls, Vercel backend) lives on the `main` branch; this branch keeps only the scene and a waypoint-driven camera.

Three.js loads from [esm.sh](https://esm.sh) via an importmap — no build step, no Node, no npm.

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

Camera waypoints live in [`src/flythrough.js`](src/flythrough.js). Each entry is `{ pos: [x,y,z], look: [x,y,z], duration, ease? }`; `duration` is seconds spent traveling *from* the previous waypoint *to* this one.

To author waypoints interactively, open <http://localhost:8080/?debug> for a free-fly mode:

- `WASD` — move
- `Q` / `E` — yaw
- `Space` / `Ctrl` — up / down
- `Shift` — fast move
- mouse-drag — look around
- `P` — log a waypoint with the current pose to the browser console

Paste logged waypoints into `src/flythrough.js`.

## Scene reference

The city floor is roughly 1300 × 660 units (X × Z), centered at the origin. Buildings are 15 units tall on a 16-unit grid. `Y=2` is street level; `Y≥300` is overhead. Bloom (`CONFIG.bloom` in `src/main.js`) is tuned for those distances — retune if your waypoints sit much higher or lower.

## Credits

Original scene by **David Vidovic** — [davidvidovic.com](https://davidvidovic.com).
