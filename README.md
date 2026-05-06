# Hackers 1995 — Flythrough

Stripped-down fork of David Vidovic's [Hackers (1995) Three.js scene](https://davidvidovic.com), repurposed as a scriptable camera flythrough. The original game (leaderboard, music, intro UI, controls, Vercel backend) lives on the `main` branch; this branch keeps only the scene and a waypoint-driven camera.

## Run with podman

The project runs entirely inside a container — nothing installs to your host.

### Build

```bash
podman build -t hackers-flythrough .
```

This uses `Containerfile`, which runs `npm install` against the locked dependencies (`three`, `vite`).

### Run (dev server with hot reload)

```bash
podman run --rm -it \
  --name hackers-flythrough \
  -p 5173:5173 \
  -v "$PWD":/app:z \
  -v /app/node_modules \
  -e CHOKIDAR_USEPOLLING=true \
  hackers-flythrough
```

Then open <http://localhost:5173>.

What each flag does:

- `--rm` — delete the container when it stops.
- `--name hackers-flythrough` — fixed name so you can `podman stop hackers-flythrough` from another terminal.
- `-p 5173:5173` — publish Vite's dev port to the host.
- `-v "$PWD":/app:z` — bind-mount source into the container so edits hot-reload.
- `-v /app/node_modules` — anonymous volume that shadows the bind-mounted `node_modules`, so the container's deps don't get clobbered by (or leak into) the host directory.
- `-e CHOKIDAR_USEPOLLING=true` — file-watch fallback in case inotify events don't propagate through podman's macOS VM.

Stop with `Ctrl-C`, or from another shell:

```bash
podman stop hackers-flythrough
```

### Run (production preview)

To serve the static built bundle instead of the dev server:

```bash
podman run --rm -it -p 4173:4173 \
  -v "$PWD":/app:z -v /app/node_modules \
  hackers-flythrough \
  sh -c "npm run build && npm run preview -- --host 0.0.0.0"
```

Then open <http://localhost:4173>.

## Authoring the flythrough

Camera waypoints live in [`src/flythrough.js`](src/flythrough.js). Each entry is `{ pos: [x,y,z], look: [x,y,z], duration, ease? }`; `duration` is seconds spent traveling *from* the previous waypoint *to* this one.

To author waypoints interactively, open <http://localhost:5173/?debug> for a free-fly mode:

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
