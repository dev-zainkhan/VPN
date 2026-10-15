# Veil Admin panel

React and TypeScript admin console for Veil VPN, connected to the backend admin
API (`/api/admin`, spec section 13). Screens follow
`../docs/front end/VPN App  MVP Screens admin panel.pdf`.

## Run locally

Start PostgreSQL and the backend first (see `../docs/SETUP.md`), then:

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:5173 and sign in with `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD`
from `backend/.env`. Vite forwards `/api` to the backend on port 3000, so the
sign-in cookie stays on one origin. The backend's `COOKIE_SECURE` must be `false`
for plain `http://` on your laptop.

In production the built files (`npm run build`, folder `dist/`) are served by
Caddy on the same domain as the API.

## Screens

- Sign-in with optional authenticator code; lockout and rate-limit messages
- Dashboard: alerts, KPIs, free-tier usage per AWS account, servers by region (refreshes every 60 s)
- AWS accounts: add (with a key test), update keys, rename/change plan, test, disable/enable, remove
- Servers: status tabs with counts, account/region filters, create on EC2 (regions and free-tier types from AWS),
  drain/undrain/reboot/terminate, show/hide in the app; refreshes every 15 s while a server starts or stops
- Regions: display names and visibility
- Devices: status tabs, search by full device ID, detail panel with minute adjustment, disconnect, block/unblock
- Rewards: today's numbers, daily chart (7/14/30 days), rejected callbacks, devices with the most ads
- Settings: rewards and app defaults, two-factor setup, password change

`src/api.ts` is the only file that talks to the backend.
