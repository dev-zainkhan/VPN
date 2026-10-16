# Veil VPN

Free Android VPN on WireGuard, paid for by rewarded ads. The full backend
design is in `docs/backend/Veil VPN  Backend Build Specification (MVP).md`;
screen designs are in `docs/front end/`.

## Layout

| Folder | What it is | State |
| --- | --- | --- |
| `backend/` | Control API: Node.js, Express, Prisma, PostgreSQL | Phases 1–4 and 8–10 done, 6–7 coded: device API, admin API, AWS accounts, servers on EC2, agent API, connect and minutes, ad rewards, background jobs |
| `edge/` | Edge server files (boot script, WireGuard agent, firewall, TCP gateway) | Written; full boot on EC2 waits for the control server (phase 5) |
| `deploy/` | Docker Compose, Caddy, backups, AWS setup script | Dev database and `aws/create-veil-iam-user.sh` so far |
| `admin-panel/` | Admin console, React + Vite | Connected to the admin API; every screen works against the real backend |
| `android-app/` | Android app, React Native (Expo) | UI prototype with demo data; no VPN tunnel or ads yet |

## Run the backend locally

Needs Node.js 22 or newer and PostgreSQL 16.

1. Start PostgreSQL: `docker compose -f deploy/docker-compose.dev.yml up -d`
   (or any local PostgreSQL 16 with user `veil`, password `veil_dev_password`, database `veil`).
2. In `backend/`: copy `.env.example` to `.env` and fill `MASTER_KEY`, `TOKEN_PEPPER`
   and `ABUSE_PEPPER` with three different values from `openssl rand -base64 32`.
   Set `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` to create the first admin.
3. In `backend/`:

```
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Check: `curl http://localhost:3000/api/health` returns `{"ok":true}`.
`npm test` runs the unit tests; `npm run typecheck` checks the types.

## Device API so far

| Call | Does |
| --- | --- |
| `GET /api/health` | Health check |
| `POST /api/v1/devices/register` | New install; starter minutes once per phone |
| `GET /api/v1/me` | Balance, ads today, current session |
| `GET /api/v1/config` | App settings and the AdMob ad unit |
| `GET /api/v1/regions` | Regions that have a working server right now |
| `POST /api/v1/connect` | WireGuard settings for the chosen region (UDP, or TCP through TLS on 443) |
| `POST /api/v1/disconnect` | End the connection |
| `POST /api/v1/rewards/intents`, `GET /api/v1/rewards/intents/:id` | Before a rewarded ad; poll until the minutes arrive |
| `GET /api/admob/ssv` | Google's signed callback after an ad (adds the minutes) |

## Admin API so far

All under `/api/admin`. Sign-in sets an httpOnly cookie; every call except `GET` must send `X-Requested-With: veil-admin`.

| Call | Does |
| --- | --- |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Sign in (5 wrong tries lock it for 15 minutes), sign out, who am I |
| `POST /auth/totp/setup`, `/enable`, `/disable` | Two-factor codes from an authenticator app |
| `POST /auth/password` | Change password (signs out other sessions) |
| `GET/POST /aws-accounts`, `POST /aws-accounts/test` | List, add, check keys without saving |
| `PUT /aws-accounts/:id/keys`, `POST /aws-accounts/:id/test`, `PATCH`, `DELETE /aws-accounts/:id` | Replace keys, recheck, rename/disable, remove |
| `GET /aws-accounts/:id/regions`, `GET /aws-accounts/:id/regions/:code/instance-types` | Enabled regions, free-tier server types |
| `GET/POST /servers` | List servers (with counts), launch one on EC2 |
| `POST /servers/manual`, `POST /servers/:id/install-command` | Add a server on any provider (Contabo, Hetzner, …): returns a one-time install command (see `docs/ADD-SERVER.md`) |
| `POST /servers/:id/drain`, `/undrain`, `/reboot`, `/terminate`, `PATCH /servers/:id` | Server actions, hide/show |
| `GET/PUT /regions` | Region names and visibility |
| `GET /devices`, `GET /devices/:id` | Devices by status, search by full device ID |
| `POST /devices/:id/adjust`, `/disconnect`, `/block`, `/unblock` | Give or take minutes, end a connection, block a phone |
| `GET /rewards/summary`, `GET/PUT /settings`, `GET /dashboard` | Ads report, app settings, dashboard |

## Before going further: AWS accounts

The spec spreads VPN servers over several AWS accounts so that each one gets
its own free tier. AWS's Free Tier terms make you ineligible for the offers if
you open more than one account to receive additional benefits, so this can end
in full charges or closed accounts. Plan for one AWS account (credits, then paid
or Lightsail) before building phase 6.
