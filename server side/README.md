# Server-side scaffold

The backend and edge-service structures follow the Veil VPN backend build
specification. The separate React/TypeScript admin-panel frontend is now
available as a UI prototype; it is not connected to the backend API.

- `backend/` — Express and TypeScript control API, Prisma schema/migrations,
  modules, middleware, jobs, and tests.
- `edge/` — edge bootstrap template, WireGuard agent, TCP gateway, firewall
  script, and protocol test tool.
- `deploy/` — Docker Compose, Caddy, backup, and DNS deployment files.
- `admin-panel/` — browser admin console for dashboard, infrastructure,
  devices, rewards, and settings. All data is simulated locally.

Run the admin UI from `admin-panel/` with `npm install` followed by `npm run
dev`. Backend implementation remains out of scope for this phase.
