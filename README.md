# Pagewright app

Visual page builder with server-side saving. Close the tab, come back later, and the project opens where you left off.

## How saving works

- Every change is saved in the browser (localStorage) and sent to the server a moment later.
- Each browser gets a private project id. It is kept in the browser and added to the address as `?p=...`.
- Open the same address (or use **File > Copy link to this project**) on another device to continue there.
- Projects are stored in **Redis** when `REDIS_URL` is set. Without it, projects are JSON files in `DATA_DIR`.
- A small status dot near the Export button shows Saved, Saving..., Save failed, or Local only.
- Panel sizes, tab positions and screen size are remembered per browser, not on the server.

Anyone who has a project link can open and edit that project. Ids are random and hard to guess, but treat links like passwords. To lock the whole app behind a login, set `BASIC_AUTH_USER` and `BASIC_AUTH_PASS`. Two people editing the same project at once overwrite each other (last save wins).

## Run on your computer

```bash
npm install
npm start            # http://localhost:3000, saves files in ./data
```

With Redis:

```bash
REDIS_URL=redis://localhost:6379 npm start
```

## Run with Docker (app + Redis)

```bash
docker compose up -d --build
```

Open http://localhost:3000. Redis data lives in the `redis-data` volume.

## Deploy online

Any host that runs Node 18+ or Docker works. You need HTTPS in front (most hosts add it) so that YouTube embeds work and browsers allow clipboard and uploads.

**Render**
1. Push this folder to a GitHub repo.
2. In Render choose New > Blueprint and pick the repo. `render.yaml` creates the web service and a Redis (Key Value) instance and links them. Render changes its blueprint format from time to time; if it complains, create a Web Service (build `npm ci --omit=dev`, start `node server.js`) and a Key Value instance by hand, then set `REDIS_URL` on the web service to its internal connection string.

**Railway / Fly.io / any Docker host**
1. Deploy the folder (the `Dockerfile` is included).
2. Add a Redis service and set `REDIS_URL`.
3. Set `PORT` only if the host asks for it. The server reads `PORT`.

**A plain VPS**
1. Install Docker, copy this folder, run `docker compose up -d --build`.
2. Put Caddy or Nginx in front for HTTPS and point your domain at it.

No Redis? The app still works. It saves files in `DATA_DIR`, so mount a persistent disk or volume there, or projects vanish when the host restarts.

## Settings (environment variables)

| Name | Default | Meaning |
| --- | --- | --- |
| `PORT` | 3000 | Port to listen on |
| `REDIS_URL` | empty | Redis connection string. Empty means file storage |
| `DATA_DIR` | ./data | Where files go without Redis |
| `PROJECT_TTL_DAYS` | 0 | Delete Redis projects after this many idle days (0 = never) |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | empty | Turn on a login for the whole app |
| `BODY_LIMIT` | 60mb | Biggest project the server accepts (uploads are inside projects) |

## Files

- `server.js` Express server and API (`/api/health`, `/api/projects/:id`)
- `public/index.html` the whole builder (one file)
- `Dockerfile`, `docker-compose.yml`, `render.yaml` deploy helpers

## Notes

- The builder loads two small libraries from cdnjs (html2canvas, JSZip) and fonts from Google Fonts, so visitors need internet access for image and ZIP export.
- Export buttons save files with the browser's normal download. Some browsers ask before saving several files in a row.
