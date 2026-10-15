# Veil VPN — Backend Build Specification (MVP)

Oct 11, 2026 · @Zaira

## 1. How to use this document

Build the backend by giving your AI assistant one step at a time from section 3, together with the sections that step names. Every name, version, table, endpoint and rule is already decided here; the AI copies them and decides nothing.

### 1.1 The workflow

1. Open a new chat for each phase in section 3.
2. Paste the master prompt below as the first message.
3. Paste the step you are on, plus every section the step lists under "Read".
4. Ask for the files that step creates. Save them at the exact paths given.
5. Run the step's "Done when" check. Do not start the next step until it passes.
6. If a check fails, paste the error and section 17 (Troubleshooting) into the same chat.

### 1.2 Master prompt (paste this first, every time)

```
You are implementing one step of a backend that is fully specified in a document I will paste.
Rules you must follow:
1. Use exactly the file paths, names, versions, types, endpoints, status codes and error codes in the document. Do not rename anything.
2. Do not add any library, table, column, endpoint or setting that the document does not list.
3. If the document does not say how to do something, stop and ask me. Do not guess.
4. Write complete files. No placeholders, no "TODO", no "...rest of code".
5. TypeScript strict mode. No "any" except where the document shows it.
6. Never log secrets, tokens, keys, passwords, IP addresses of app users, or device IDs.
7. After the code, list the exact commands I must run, in order.
The step and the sections it needs follow.
```

### 1.3 Conventions in this document

- Text in `code style` is exact. Copy it character for character.
- `[LIKE_THIS]` is a value you supply yourself (a domain, a password). Everything else is fixed.
- MUST and NEVER are rules. Breaking one is a bug, even if the code runs.
- Times are UTC everywhere: in the database, in the API and in jobs.
- Durations and balances are stored in whole seconds. The API returns seconds; the app formats them.
- The product name used in code is `veil`. If you rename the product later, change only display text, never identifiers.

### 1.4 Scope

This document covers everything that runs on servers: the control-plane API, the PostgreSQL database, the AWS orchestration, the edge VPN servers and their agent, and deployment. The Android app and the React admin panel are separate builds; this document defines the exact API contract they call (sections 8, 10 and 13), so they can be built against it.

## 2. System overview and fixed decisions

The system has one control server (API + database) and any number of disposable VPN edge servers in your AWS accounts. The control server never carries user traffic: it only issues configs, meters minutes and manages servers.

&#91;embedded content: architecture · control server, edge server, three clients\]

The app talks to the control server only over HTTPS; its tunnel goes straight to an edge server. Edge servers call out to the API and accept no management connections.

### 2.1 The five parts

| Part | What it is | Runs where |
| --- | --- | --- |
| Control API | Node.js + Express + Prisma, one process | Control server (one EC2 t3.micro in your "Control" AWS account), Docker container `api` |
| Database | PostgreSQL 16 | Control server, Docker container `postgres` |
| HTTPS front door | Caddy 2 with automatic Let's Encrypt certificates | Control server, Docker container `caddy` |
| Edge server | Ubuntu 24.04 + WireGuard + `veil-agent` (Python) + `veil-tcpgw` (Python) | EC2 instances launched by the API in your edge AWS accounts |
| Clients | Android app and admin panel (built separately) | Phones and your browser |

### 2.2 Who talks to whom

1. App → Control API over HTTPS: register, list regions, connect, disconnect, rewards. Auth: device token.
2. AdMob → Control API: server-side verification (SSV) callback, an HTTPS GET. Auth: Google's signature.
3. Edge agent → Control API over HTTPS: register on boot, fetch desired peers every 2 seconds, report usage every 60 seconds. Auth: agent token.
4. Control API → AWS EC2 API: launch, reboot, terminate, describe. Auth: the stored IAM access keys of each AWS account.
5. App → Edge server: the VPN tunnel itself. WireGuard over UDP 51820, or WireGuard wrapped in TLS on TCP 443.
6. Admin panel → Control API over HTTPS. Auth: admin session cookie + 2FA.

The edge server never accepts connections from the control server. The agent always calls out. This is why edge servers need no SSH and no open management port.

### 2.3 Fixed decisions

| Area | Decision |
| --- | --- |
| Runtime | Node.js 22 LTS (any 22.x) |
| Language | TypeScript 5.6.3, `strict: true` |
| Web framework | Express 4.21.2 |
| ORM and migrations | Prisma 5.22.0 (`prisma` and `@prisma/client`) |
| Database | PostgreSQL 16, Docker image `postgres:16-alpine`, database `veil`, user `veil` |
| Validation | zod 3.23.8 |
| AWS | AWS SDK for JavaScript v3: `@aws-sdk/client-ec2` and @aws-sdk/client-sts (latest 3.x at install, same version, locked by `package-lock.json`) |
| Logging | pino 9.5.0 |
| Passwords | bcryptjs 2.4.3, cost 12 |
| 2FA | otplib 12.0.1 (TOTP, 6 digits, 30 seconds) |
| Rate limits | express-rate-limit 7.4.1, in-memory store |
| Tests | vitest 2.1.5 |
| Edge OS | Ubuntu Server 24.04 LTS, amd64, latest Canonical image per region |
| Edge code | Python 3.12 standard library only (ships with Ubuntu 24.04), no pip |
| VPN | WireGuard (`wireguard-tools` from apt). No OpenVPN. |
| UDP port | 51820 |
| TCP fallback | `veil-tcpgw`: TLS on TCP 443, carries WireGuard packets inside |
| Tunnel network | `10.66.0.0/16`. Server is `10.66.0.1`. Clients get one address from `10.66.0.2` to `10.66.255.254` |
| DNS inside tunnel | `1.1.1.1` and `1.0.0.1` |
| MTU | UDP mode 1420, TCP mode 1280 |
| IPv6 | Not offered. The app routes `::/0` into the tunnel so IPv6 cannot leak; the server drops it |
| Domain | Free DuckDNS subdomain `[YOURNAME].duckdns.org` |
| URL layout | App API `/api/v1/…`, admin API `/api/admin/…`, agent API `/api/agent/v1/…`, AdMob callback `/api/admob/ssv`, admin panel files `/admin/` (same origin, so no CORS) |
| IDs | UUID v4, generated by PostgreSQL `gen_random_uuid()` |
| Time | UTC everywhere |

If npm reports that a pinned version does not exist, use the newest version with the same major number (for example 4.x for Express) and write that exact version into `package.json`.

### 2.4 Not in the MVP

Redis, Terraform, golden AMIs, bastion hosts, SSH on edge servers, OpenVPN, IPv6, user accounts and sign-in, CloudWatch, Elastic IPs and NAT Gateways. Do not add any of them.

## 3. Build order

Build in this exact order: 12 phases, 27 steps. Each step lists what to read, what it creates, and the check that must pass before you move on. The control server is deployed in phase 5 because edge servers and AdMob need a public HTTPS address to call.

### Phase 0 — Accounts and tools

1. **Create accounts.** Read: 4.1. Done when: you can sign in to GitHub, the Control AWS account, at least one edge AWS account, DuckDNS and AdMob.
2. **Install tools.** Read: 4.2. Done when: `node -v` prints `v22.`…, `docker compose version` prints a version, `git --version` works.
3. **Create the repository.** Read: 4.3. Done when: the folder tree in 4.3 exists and is pushed to a private GitHub repo.

### Phase 1 — Backend skeleton

4. **Project setup.** Read: 5. Creates: `backend/package.json`, `backend/tsconfig.json`, `backend/src/server.ts`, `backend/src/app.ts`. Done when: `npm run dev` starts and `curl http://localhost:3000/api/health` returns `{"ok":true}`.
5. **Core modules.** Read: 7. Creates: everything under `backend/src/core/`. Done when: `npm test` passes the crypto and error tests from 16.1.

### Phase 2 — Database

6. **Local PostgreSQL, schema and seed.** Read: 6, 4.4. Creates: `deploy/docker-compose.dev.yml`, `backend/prisma/schema.prisma`, the first migration, `backend/prisma/seed.ts`. Done when: `npx prisma migrate dev` succeeds, `npx prisma db seed` succeeds, and `npx prisma studio` shows 17 rows in `Region`, 1 row in `Settings` and 1 row in `Admin`.

### Phase 3 — Device API

7. **Device auth, register, me, config, regions.** Read: 8.1 to 8.5, 7.5. Done when: the curl script in 16.2 step A registers a device, returns a token, and `GET /api/v1/me` shows `balanceSeconds: 3600`.
8. **Reinstall protection.** Read: 8.2 rules 4 to 6. Done when: registering twice with the same `abuseKey` gives starter minutes only the first time.

### Phase 4 — Admin auth and AWS accounts

9. **Admin login, session, 2FA.** Read: 13.1, 13.2. Done when: login works, a wrong password 5 times locks for 15 minutes, and enabling 2FA then requires the code.
10. **AWS accounts module.** Read: 12.1 to 12.4, 13.3. Done when: `POST /api/admin/aws-accounts/test` with your edge account's EC2-only keys returns `ok: true` and lists its regions.

### Phase 5 — Deploy the control server

11. **Control server on AWS.** Read: 15.1 to 15.4. Done when: `https://[YOURNAME].duckdns.org/api/health` returns `{"ok":true}` from your phone on mobile data.
12. **Backups and budget alerts.** Read: 15.5, 15.6. Done when: a backup file appears after running the backup script once, and AWS Budgets shows your alert in every account.

### Phase 6 — Edge servers

13. **Edge files.** Read: 11.1 to 11.5. Creates: `edge/bootstrap.sh.tpl`, `edge/veil_agent.py`, `edge/veil_tcpgw.py`, `edge/fw.sh, edge/tools/tcp_client_test.py`. Done when: `python3 -m py_compile` passes on all three Python files.
14. **Agent API.** Read: 11.6. Done when: the unit tests in 16.1 for peer-list versioning pass.
15. **Provisioning and terminate.** Read: 12.5 to 12.8, 13.4. Done when: `POST /api/admin/servers` creates a server that turns `active` within 5 minutes, and terminate removes it from AWS.
16. **Server jobs.** Read: 14 jobs J1, J2, J3. Done when: a server whose instance you terminate by hand in the AWS console `turns failed with reason instance_lost within 6 minutes`.

### Phase 7 — Connections and minutes

17. **Connect and disconnect.** Read: 9.1 to 9.4, 8.6, 8.7. Done when: test 16.2 step B works. The official WireGuard app on your phone connects with the returned config, and your public IP changes to the server's IP.
18. **Metering and cutoff.** Read: 9.5, 9.6, job J4. Done when: a device with 120 seconds of balance gets disconnected within 3 minutes of connecting.
19. **TCP mode.** Read: 11.5, 9.3. Done when: test 16.2 step C works through `tcp_client_test.py`.

### Phase 8 — Rewards

20. **Reward intents and SSV.** Read: 10. Done when: the SSV unit tests in 16.1 pass, including replay and bad signature.
21. **Real AdMob callback.** Read: 10.6. Done when: watching one rewarded ad on your test phone adds 30 minutes, and replaying the same callback URL adds nothing.

### Phase 9 — Remaining admin API

22. **Servers, regions, devices.** Read: 13.4 to 13.6. Done when: every endpoint in 18.3 marked "Admin" returns the documented shape.
23. **Rewards summary, settings, dashboard.** Read: 13.7 to 13.9. Done when: the dashboard numbers match a manual count in Prisma Studio.

### Phase 10 — Remaining jobs

24. **Cleanup and usage jobs.** Read: 14 jobs J5 to J8. Done when: the job log line for each job appears on schedule (section 14 says what each prints).

### Phase 11 — Hardening

25. **Security checklist.** Read: 16.3. Done when: every box in 16.3 is ticked.
26. **Load check.** Read: 16.4. Done when: the k6 script finishes with no 5xx and p95 under 300 ms.

### Phase 12 — Launch

27. **Production switch.** Read: 16.5. Done when: real AdMob ad unit IDs are set, test devices are removed, and a fresh install on a second phone completes the whole flow.

## 4. Phase 0: accounts, tools and repository

You need five free accounts, four tools and one repository before any code. The only unavoidable cost in the whole project is Google Play's one-time $25 developer fee, which you pay later, only when publishing the app.

### 4.1 Accounts

| Account | What to do | Write down |
| --- | --- | --- |
| GitHub | Create a private repository named `veil`. | Repository URL |
| AWS "Control" account | New AWS account used only for the control server. Turn on MFA for the root user. Do not join it to AWS Organizations. | Account ID |
| AWS edge accounts (1 or more) | New AWS accounts used only for VPN servers. In each: create IAM user `veil-orchestrator`, attach the inline policy from 12.1, create an access key (use case "Application running outside AWS"). Never create keys for the root user. Do not join AWS Organizations, because linked accounts share one free tier. | Access key ID and secret for each |
| DuckDNS (duckdns.org) | Sign in, create one subdomain, for example `veilapi`. | Subdomain and DuckDNS token |
| AdMob | Add an Android app, then create one ad unit of type "Rewarded". Leave server-side verification for 10.6. | App ID (`ca-app-pub-…~…`) and ad unit ID (`ca-app-pub-…/…`) |

### 4.2 Tools on your computer

- **Windows users:** install WSL2 with Ubuntu 24.04 and run every command in this document inside that Ubuntu terminal.
- **Node.js 22:** install nvm, then `nvm install 22` and `nvm use 22`.
- **Docker:** Docker Desktop (Windows, macOS) or Docker Engine with the Compose plugin (Linux).
- **Git** and **VS Code**.
- **On your phone:** the official WireGuard app from the Play Store, used for testing in phase 7.

### 4.3 Repository layout

Create exactly this tree. Files are filled in by later steps; create empty files now only for `.gitignore` and `README.md`.

```
veil/
  .gitignore
  README.md
  backend/
    package.json
    package-lock.json
    tsconfig.json
    vitest.config.ts
    .env.example
    Dockerfile
    prisma/
      schema.prisma
      seed.ts
      migrations/
    src/
      server.ts
      app.ts
      core/
        config.ts
        db.ts
        logger.ts
        errors.ts
        crypto.ts
        http.ts
        rateLimits.ts
        pagination.ts
      middleware/
        deviceAuth.ts
        adminAuth.ts
        agentAuth.ts
        errorHandler.ts
      modules/
        devices/      devices.routes.ts  devices.service.ts  devices.schemas.ts
        regions/      regions.routes.ts  regions.service.ts
        settings/     settings.service.ts
        connections/  connections.routes.ts  connections.service.ts  ipAllocator.ts  serverPicker.ts
        metering/     metering.service.ts
        rewards/      rewards.routes.ts  rewards.service.ts  ssvVerifier.ts
        agent/        agent.routes.ts  agent.service.ts  edgeFiles.ts
        aws/          awsClient.ts  awsAccounts.service.ts  provisioning.service.ts  bootstrap.ts
        admin/        auth.routes.ts  auth.service.ts  accounts.routes.ts  servers.routes.ts
                      regions.routes.ts  devices.routes.ts  rewards.routes.ts  settings.routes.ts
                      dashboard.routes.ts  audit.ts
      jobs/
        scheduler.ts
        j1_provisionTimeout.ts  j2_reconcileInstances.ts  j3_agentSilence.ts
        j4_staleSessions.ts  j5_expireIntents.ts  j6_pruneRewards.ts
        j7_pruneAdminSessions.ts  j8_monthRollover.ts
    test/
  edge/
    bootstrap.sh.tpl
    veil_agent.py
    veil_tcpgw.py
    fw.sh
    tools/
      tcp_client_test.py
  deploy/
    docker-compose.dev.yml
    docker-compose.prod.yml
    Caddyfile
    backup.sh
    duckdns.sh
```

The admin panel (`admin-panel/`) and Android app (`android-app/`) are added as sibling folders later.

### 4.4 .gitignore

```
node_modules/
dist/
.env
*.log
backups/
```

The real `.env` file is never committed. Only `backend/.env.example` (section 18.1) is.

## 5. Backend project setup

The backend is one CommonJS TypeScript project in `backend/`, run with `tsx` in development and compiled `node dist/server.js` in production. Copy these files exactly.

### 5.1 backend/package.json

```json
{
  "name": "veil-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@aws-sdk/client-ec2": "^3.0.0",
    "@aws-sdk/client-sts": "^3.0.0",
    "@prisma/client": "5.22.0",
    "bcryptjs": "2.4.3",
    "cookie-parser": "1.4.7",
    "express": "4.21.2",
    "express-rate-limit": "7.4.1",
    "helmet": "8.0.0",
    "otplib": "12.0.1",
    "pino": "9.5.0",
    "prisma": "5.22.0",
    "tsx": "4.19.2",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "2.4.6",
    "@types/cookie-parser": "1.4.7",
    "@types/express": "4.17.21",
    "@types/node": "22.9.0",
    "typescript": "5.6.3",
    "vitest": "2.1.5"
  }
}
```

`prisma` and `tsx` are normal dependencies on purpose: the production container runs `prisma migrate deploy` and the seed script. After the first `npm install`, replace `^3.0.0` for both `@aws-sdk/client-ec2` and `@aws-sdk/client-sts` with the exact versions npm installed (they must be the same version), then commit `package-lock.json`.

### 5.2 backend/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

### 5.3 backend/vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

### 5.4 src/server.ts must do, in order

1. Import `config` from `core/config.ts`. Loading it validates every environment variable and exits the process with code 1 if one is missing or invalid.
2. Build the app with `createApp()` from `app.ts`.
3. Listen on host `0.0.0.0`, port `config.PORT`. Log `api listening` with the port.
4. If `config.JOBS_ENABLED` is `true`, call `startScheduler()` from `jobs/scheduler.ts`.
5. On `SIGTERM` and `SIGINT`: stop the scheduler, call `server.close()`, then `prisma.$disconnect()`, then `process.exit(0)`. Force exit with code 1 after 10 seconds.

### 5.5 src/app.ts must do, in order

1. `const app = express()`.
2. `app.set('trust proxy', 1)`. Caddy is the one proxy in front; this makes `req.ip` the real client IP for rate limiting.
3. `app.disable('x-powered-by')`, then `app.use(helmet())`.
4. Mount `/api/admob/ssv` before the JSON parser (it is a GET with a query string; see 10.4).
5. `app.use(express.json({ limit: '64kb' }))` and `app.use(cookieParser())`.
6. `GET /api/health` returns `200 {"ok":true}`. No auth, no database call.
7. Mount routers: `/api/v1` (devices, regions, connections, rewards), `/api/agent/v1` (agent), `/api/admin` (all admin routers).
8. Any other path: `404` with error code `NOT_FOUND`.
9. Last: the error handler from `middleware/errorHandler.ts`.
10. Export `createApp()`. Do not call `listen` in this file (tests import it).

### 5.6 Coding conventions (every module)

- **Layers.** `*.routes.ts` parses input and calls a service. `*.service.ts` holds the logic and the database calls. Routes never call Prisma directly.
- **Validation.** Every body, query and path parameter is parsed with a zod schema. A parse failure returns `400` with code `VALIDATION_FAILED` and zod's issues in `details`.
- **Async handlers.** Wrap every handler with `ah()` from `core/http.ts` so thrown errors reach the error handler.
- **Errors.** Throw `new AppError(code, message?)` from `core/errors.ts`. The HTTP status comes from the code table in 18.2. Never send an error response by hand.
- **Success responses.** Send the documented object directly with `res.json(...)`. No wrapper object.
- **JSON names.** camelCase in the API. Database columns are snake\_case through Prisma `@map`.
- **Dates.** ISO 8601 UTC strings in the API, for example `2026-10-11T14:32:00.000Z`.
- **Writes that touch more than one row** run inside `prisma.$transaction`.
- **No global state** except the Prisma client, the logger, the config object and the in-memory rate-limit stores.

## 6. Database

The database has 16 tables, defined by the Prisma schema below. Copy it exactly; every later section depends on these names.

### 6.1 Local PostgreSQL: deploy/docker-compose.dev.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: veil
      POSTGRES_USER: veil
      POSTGRES_PASSWORD: veil_dev_password
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - veil_pg_dev:/var/lib/postgresql/data
volumes:
  veil_pg_dev:
```

Start it with `docker compose -f deploy/docker-compose.dev.yml up -d`. Local `DATABASE_URL` is `postgresql://veil:veil_dev_password@localhost:5432/veil?schema=public`.

### 6.2 backend/prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum DevicePlatform {
  android
}

enum ServerStatus {
  provisioning
  active
  draining
  failed
  terminating
  terminated
}

enum ServerFailReason {
  launch_error
  never_registered
  agent_silent
  instance_lost
}

enum AwsAccountStatus {
  working
  keys_rejected
  disabled
}

enum FreeTierPlan {
  legacy_12_month
  free_plan_credits
  paid
}

enum Protocol {
  udp
  tcp
}

enum DefaultProtocol {
  auto
  udp
  tcp
}

enum WalletReason {
  starter
  ad_reward
  admin_adjust
}

enum IntentStatus {
  pending
  credited
  rejected
  expired
}

enum RewardOutcome {
  credited
  rejected
}

enum RejectReason {
  bad_signature
  duplicate
  wrong_ad_unit
  stale
  unknown_device
  blocked
  bad_intent
  daily_limit
}

model Region {
  code        String   @id
  displayName String   @map("display_name")
  countryCode String   @map("country_code")
  visible     Boolean  @default(true)
  sortOrder   Int      @map("sort_order")
  servers     Server[]
  accountRegions AccountRegion[]

  @@map("regions")
}

model Settings {
  id                Int             @id @default(1)
  minutesPerAd      Int             @default(30) @map("minutes_per_ad")
  starterMinutes    Int             @default(60) @map("starter_minutes")
  maxAdsPerDay      Int             @default(10) @map("max_ads_per_day")
  lowMinutesWarning Int             @default(10) @map("low_minutes_warning")
  defaultProtocol   DefaultProtocol @default(auto) @map("default_protocol")
  supportEmail      String?         @map("support_email")
  updatedAt         DateTime        @updatedAt @map("updated_at")

  @@map("settings")
}

model Admin {
  id                String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email             String         @unique
  passwordHash      String         @map("password_hash")
  totpSecretEnc     String?        @map("totp_secret_enc")
  totpEnabled       Boolean        @default(false) @map("totp_enabled")
  failedLogins      Int            @default(0) @map("failed_logins")
  lockedUntil       DateTime?      @map("locked_until")
  passwordChangedAt DateTime       @default(now()) @map("password_changed_at")
  createdAt         DateTime       @default(now()) @map("created_at")
  sessions          AdminSession[]
  audits            AdminAudit[]

  @@map("admins")
}

model AdminSession {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  adminId   String   @map("admin_id") @db.Uuid
  admin     Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  tokenHash String   @unique @map("token_hash")
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([expiresAt])
  @@map("admin_sessions")
}

model AdminAudit {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  adminId    String   @map("admin_id") @db.Uuid
  admin      Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  action     String
  targetType String   @map("target_type")
  targetId   String?  @map("target_id")
  detail     Json?
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([createdAt])
  @@map("admin_audits")
}

model AbuseKey {
  keyHash        String    @id @map("key_hash")
  starterGranted Boolean   @default(false) @map("starter_granted")
  blocked        Boolean   @default(false)
  blockedReason  String?   @map("blocked_reason")
  blockedAt      DateTime? @map("blocked_at")
  installCount   Int       @default(0) @map("install_count")
  createdAt      DateTime  @default(now()) @map("created_at")
  devices        Device[]

  @@map("abuse_keys")
}

model Device {
  id             String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tokenHash      String         @unique @map("token_hash")
  abuseKeyHash   String         @map("abuse_key_hash")
  abuseKey       AbuseKey       @relation(fields: [abuseKeyHash], references: [keyHash])
  platform       DevicePlatform
  appVersion     String         @map("app_version")
  balanceSeconds Int            @default(0) @map("balance_seconds")
  adsToday       Int            @default(0) @map("ads_today")
  adsDay         String?        @map("ads_day")
  firstSeenAt    DateTime       @default(now()) @map("first_seen_at")
  lastSeenAt     DateTime       @default(now()) @map("last_seen_at")
  session        Session?
  walletEntries  WalletEntry[]
  intents        RewardIntent[]

  @@index([abuseKeyHash])
  @@index([firstSeenAt, id])
  @@map("devices")
}

model WalletEntry {
  id        String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deviceId  String       @map("device_id") @db.Uuid
  device    Device       @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  seconds   Int
  reason    WalletReason
  refId     String?      @map("ref_id")
  createdAt DateTime     @default(now()) @map("created_at")

  @@index([deviceId, createdAt])
  @@map("wallet_entries")
}

model AwsAccount {
  id                 String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nickname           String           @unique
  awsAccountNumber   String           @unique @map("aws_account_number")
  accessKeyIdEnc     String           @map("access_key_id_enc")
  secretAccessKeyEnc String           @map("secret_access_key_enc")
  accessKeyLast4     String           @map("access_key_last4")
  status             AwsAccountStatus @default(working)
  freeTierPlan       FreeTierPlan     @default(legacy_12_month) @map("free_tier_plan")
  lastCheckedAt      DateTime?        @map("last_checked_at")
  lastError          String?          @map("last_error")
  createdAt          DateTime         @default(now()) @map("created_at")
  servers            Server[]
  accountRegions     AccountRegion[]
  usage              AccountUsage[]

  @@map("aws_accounts")
}

model AccountRegion {
  awsAccountId    String     @map("aws_account_id") @db.Uuid
  awsAccount      AwsAccount @relation(fields: [awsAccountId], references: [id], onDelete: Cascade)
  regionCode      String     @map("region_code")
  region          Region     @relation(fields: [regionCode], references: [code])
  vpcId           String     @map("vpc_id")
  securityGroupId String     @map("security_group_id")
  createdAt       DateTime   @default(now()) @map("created_at")

  @@id([awsAccountId, regionCode])
  @@map("account_regions")
}

model AccountUsage {
  awsAccountId String     @map("aws_account_id") @db.Uuid
  awsAccount   AwsAccount @relation(fields: [awsAccountId], references: [id], onDelete: Cascade)
  month        String
  txBytes      BigInt     @default(0) @map("tx_bytes")

  @@id([awsAccountId, month])
  @@map("account_usage")
}

model Server {
  id                 String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  awsAccountId       String            @map("aws_account_id") @db.Uuid
  awsAccount         AwsAccount        @relation(fields: [awsAccountId], references: [id])
  regionCode         String            @map("region_code")
  region             Region            @relation(fields: [regionCode], references: [code])
  instanceId         String?           @unique @map("instance_id")
  instanceType       String            @map("instance_type")
  publicIp           String?           @map("public_ip")
  status             ServerStatus      @default(provisioning)
  failReason         ServerFailReason? @map("fail_reason")
  failDetail         String?           @map("fail_detail")
  visible            Boolean           @default(true)
  wgPublicKey        String?           @map("wg_public_key")
  tcpCertSha256      String?           @map("tcp_cert_sha256")
  bootstrapTokenHash String?           @map("bootstrap_token_hash")
  agentTokenHash     String?           @unique @map("agent_token_hash")
  agentVersion       String?           @map("agent_version")
  peersVersion       Int               @default(1) @map("peers_version")
  appliedVersion     Int               @default(0) @map("applied_version")
  lastReportAt       DateTime?         @map("last_report_at")
  cpuPct             Float?            @map("cpu_pct")
  memPct             Float?            @map("mem_pct")
  txCounter          BigInt            @default(0) @map("tx_counter")
  launchedAt         DateTime          @default(now()) @map("launched_at")
  activeAt           DateTime?         @map("active_at")
  terminatedAt       DateTime?         @map("terminated_at")
  sessions           Session[]

  @@index([status])
  @@index([regionCode, status])
  @@index([awsAccountId])
  @@map("servers")
}

model Session {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deviceId        String    @unique @map("device_id") @db.Uuid
  device          Device    @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  serverId        String    @map("server_id") @db.Uuid
  server          Server    @relation(fields: [serverId], references: [id], onDelete: Cascade)
  protocol        Protocol
  publicKey       String    @map("public_key")
  tunnelIp        String    @map("tunnel_ip")
  startedAt       DateTime  @default(now()) @map("started_at")
  lastHandshakeAt DateTime? @map("last_handshake_at")
  lastDebitAt     DateTime  @default(now()) @map("last_debit_at")

  @@unique([serverId, tunnelIp])
  @@unique([serverId, publicKey])
  @@index([serverId])
  @@map("sessions")
}

model RewardIntent {
  id           String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  deviceId     String        @map("device_id") @db.Uuid
  device       Device        @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  nonce        String        @unique
  status       IntentStatus  @default(pending)
  rejectReason RejectReason? @map("reject_reason")
  createdAt    DateTime      @default(now()) @map("created_at")
  expiresAt    DateTime      @map("expires_at")

  @@index([deviceId, createdAt])
  @@index([status, expiresAt])
  @@map("reward_intents")
}

model AdReward {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  transactionId   String        @unique @map("transaction_id")
  deviceId        String?       @map("device_id") @db.Uuid
  intentId        String?       @map("intent_id") @db.Uuid
  adUnit          String        @map("ad_unit")
  rewardAmount    Int           @map("reward_amount")
  rewardItem      String        @map("reward_item")
  outcome         RewardOutcome
  rejectReason    RejectReason? @map("reject_reason")
  secondsCredited Int           @default(0) @map("seconds_credited")
  createdAt       DateTime      @default(now()) @map("created_at")

  @@index([createdAt])
  @@index([deviceId, createdAt])
  @@map("ad_rewards")
}

model RejectCounter {
  day    String
  reason RejectReason
  count  Int          @default(0)

  @@id([day, reason])
  @@map("reject_counters")
}
```

### 6.3 Rules the schema encodes

- **No connection history.** `Session` holds only live connections, one per device (`deviceId` is unique). Disconnecting deletes the row. Nothing about past connections is stored anywhere. Usage debits change `Device.balanceSeconds` only and never create a `WalletEntry`.
- **Blocking follows the phone, not the install.** `blocked` lives on `AbuseKey`. A device is blocked when its abuse key is blocked, so a reinstall (new `Device` row, same abuse key) is still blocked.
- **Starter minutes once per phone.** `AbuseKey.starterGranted` turns true the first time; later installs get 0 starter minutes.
- **Reward deduplication.** `AdReward.transactionId` is unique. A second insert with the same AdMob transaction fails and is counted in `RejectCounter` with reason `duplicate`.
- **Unverifiable callbacks are never stored.** A callback with a bad signature only increments `RejectCounter` (reason `bad_signature`).
- **BigInt columns** (`txBytes`, `txCounter`) are converted with `Number(value)` before being sent as JSON.
- **`Device.lastSeenAt`** is updated by the device auth middleware only when the stored value is more than 5 minutes old, to avoid a write on every request.

### 6.4 backend/prisma/seed.ts

The seed is safe to run many times. It must:

1. Upsert `Settings` with `id = 1` and the defaults from the schema (create only; never overwrite existing values).
2. Upsert the 17 regions below (create if missing; on update change nothing).
3. If the `admins` table is empty, create one admin with the lowercased email `ADMIN_EMAIL` and password `ADMIN_INITIAL_PASSWORD` from the environment, hashed with bcryptjs cost 12. If either variable is missing, print `skipping admin seed` and continue.

| sortOrder | code | displayName | countryCode |
| --- | --- | --- | --- |
| 1 | `us-east-1` | Virginia, United States | US |
| 2 | `us-east-2` | Ohio, United States | US |
| 3 | `us-west-1` | California, United States | US |
| 4 | `us-west-2` | Oregon, United States | US |
| 5 | `ca-central-1` | Montreal, Canada | CA |
| 6 | `sa-east-1` | São Paulo, Brazil | BR |
| 7 | `eu-west-1` | Dublin, Ireland | IE |
| 8 | `eu-west-2` | London, United Kingdom | GB |
| 9 | `eu-west-3` | Paris, France | FR |
| 10 | `eu-central-1` | Frankfurt, Germany | DE |
| 11 | `eu-north-1` | Stockholm, Sweden | SE |
| 12 | `ap-south-1` | Mumbai, India | IN |
| 13 | `ap-southeast-1` | Singapore | SG |
| 14 | `ap-southeast-2` | Sydney, Australia | AU |
| 15 | `ap-northeast-1` | Tokyo, Japan | JP |
| 16 | `ap-northeast-2` | Seoul, South Korea | KR |
| 17 | `ap-northeast-3` | Osaka, Japan | JP |

All 17 are AWS regions that are enabled by default in every account. Opt-in regions are deliberately left out.

### 6.5 Commands

```
cd backend
npx prisma migrate dev --name init
npx prisma db seed
npx prisma studio
```

## 7. Core modules

Everything in `src/core/` and `src/middleware/` is shared by every feature: configuration, encryption, errors, the three kinds of authentication, rate limits and logging. Build these before any feature.

### 7.1 core/config.ts

Parse `process.env` with this zod schema at import time. On failure, print each invalid variable name (never its value) and call `process.exit(1)`. Export the parsed object as `config`.

| Variable | Type and rule | Default |
| --- | --- | --- |
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | integer | `3000` |
| `DATABASE_URL` | string, starts with `postgresql://` | none, required |
| `PUBLIC_BASE_URL` | URL, no trailing slash, for example `https://veilapi.duckdns.org` | none, required |
| `MASTER_KEY` | base64 that decodes to exactly 32 bytes | none, required |
| `TOKEN_PEPPER` | string, at least 32 characters | none, required |
| `ABUSE_PEPPER` | string, at least 32 characters | none, required |
| `ADMOB_AD_UNIT_ID` | string matching `^ca-app-pub-\d+/\d+$` | none, required |
| `ADMOB_KEYS_URL` | URL | `https://www.gstatic.com/admob/reward/verifier-keys.json` |
| `EDGE_FILES_DIR` | path | `../edge` |
| `COOKIE_SECURE` | `true` or `false` | `true` |
| `JOBS_ENABLED` | `true` or `false` | `true` |
| `LOG_LEVEL` | `fatal` `error` `warn` `info` `debug` | `info` |
| `ADMIN_EMAIL` | email, used only by the seed | optional |
| `ADMIN_INITIAL_PASSWORD` | at least 12 characters, used only by the seed | optional |

Generate `MASTER_KEY`, `TOKEN_PEPPER` and `ABUSE_PEPPER` with `openssl rand -base64 32`, once each. Never change `MASTER_KEY` or the peppers after launch: stored AWS keys, 2FA secrets and every token hash depend on them.

### 7.2 core/db.ts

Export one `const prisma = new PrismaClient()`. Every module imports this instance. Never create a second client.

### 7.3 core/crypto.ts

All functions use Node's built-in `crypto` module. No other crypto library.

| Function | Exact behaviour |
| --- | --- |
| `randomToken(bytes = 32): string` | `crypto.randomBytes(bytes).toString('base64url')` |
| `hashToken(token: string): string` | HMAC-SHA256 with key `TOKEN_PEPPER`, output hex. Used for device, admin session, agent and bootstrap tokens |
| `hashAbuseKey(value: string): string` | HMAC-SHA256 with key `ABUSE_PEPPER`, output hex |
| `encrypt(plain: string): string` | AES-256-GCM, key = `MASTER_KEY` decoded from base64, random 12-byte IV. Returns `v1:` + base64(iv) + `:` + base64(authTag) + `:` + base64(ciphertext) |
| `decrypt(blob: string): string` | Reverse of `encrypt`. Throws if the prefix is not `v1` or the auth tag fails |
| `sha256Hex(data: string \| Buffer): string` | SHA-256, output lowercase hex |
| `safeEqual(a: string, b: string): boolean` | `false` if lengths differ, else `crypto.timingSafeEqual` on the UTF-8 buffers |

Tokens are shown to their owner once and stored only as `hashToken(token)`. A token is looked up by computing its hash and querying the unique hash column.

### 7.4 core/errors.ts

```ts
export class AppError extends Error {
  constructor(public code: ErrorCode, message?: string, public details?: unknown) {
    super(message ?? code);
  }
}
```

`ErrorCode` is a string union of every code in table 18.2, and `statusFor(code)` returns that table's HTTP status. The error handler in `middleware/errorHandler.ts`:

1. If the error is an `AppError`: respond `statusFor(code)` with `{"error":{"code":…,"message":…,"details":…}}` (omit `details` when undefined).
2. If it is a `ZodError`: respond `400` with code `VALIDATION_FAILED` and `details = error.issues`.
3. Anything else: log it at `error` level (message and stack only) and respond `500` with code `INTERNAL` and message `Internal error`. Never send the stack to the client.

### 7.5 Authentication middleware

**deviceAuth** (`middleware/deviceAuth.ts`), used by every `/api/v1` route except `POST /api/v1/devices/register`:

1. Read header `Authorization`. It must be `Bearer <token>`. Missing or malformed: throw `AUTH_REQUIRED`.
2. Find `Device` where `tokenHash = hashToken(token)`, including `abuseKey`. Not found: throw `AUTH_INVALID`.
3. Set `req.device` (the row) and `req.deviceBlocked = device.abuseKey.blocked`.
4. If `lastSeenAt` is more than 5 minutes ago, update it to now. Do not wait for this write to finish before calling `next()`, but catch and log its error.

**adminAuth** (`middleware/adminAuth.ts`), used by every `/api/admin` route except `POST /api/admin/auth/login`:

1. Read cookie `veil_admin`. Missing: throw `AUTH_REQUIRED`.
2. Find `AdminSession` where `tokenHash = hashToken(cookie)` and `expiresAt > now()`, including `admin`. Not found: throw `AUTH_REQUIRED` and clear the cookie.
3. For any method other than `GET`, require header `X-Requested-With: veil-admin`. Missing: throw `CSRF_FAILED`. Together with the `SameSite=Strict` cookie, this blocks cross-site requests.
4. Set `req.admin` and `req.adminSessionId`.

**agentAuth** (`middleware/agentAuth.ts`), used by every `/api/agent/v1` route except `POST /api/agent/v1/register`:

1. Read `Authorization: Bearer <token>`. Missing: throw `AUTH_REQUIRED`.
2. Find `Server` where `agentTokenHash = hashToken(token)`. Not found, or status `terminating` or `terminated`: throw `AUTH_INVALID`.
3. Set `req.server`.

Declare the added request fields in a new file `src/types/express.d.ts` by augmenting `Express.Request` with optional `device`, `deviceBlocked`, `admin`, `adminSessionId` and `server`, typed with the Prisma model types.

### 7.6 core/http.ts

- `ah(fn)` returns `(req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`.
- `parse<T>(schema: ZodType<T>, value: unknown): T` calls `schema.parse(value)` (the error handler turns a `ZodError` into `400`).

### 7.7 core/rateLimits.ts

Create each limiter with express-rate-limit: `standardHeaders: 'draft-7'`, `legacyHeaders: false`, and a `handler` that calls `next(new AppError('RATE_LIMITED'))`.

| Limiter | Limit | Key | Used on |
| --- | --- | --- | --- |
| `registerLimiter` | 10 per hour | `req.ip` | `POST /api/v1/devices/register` |
| `deviceLimiter` | 120 per minute | `req.device.id` | every other `/api/v1` route, after `deviceAuth` |
| `connectLimiter` | 20 per 10 minutes | `req.device.id` | `POST /api/v1/connect` |
| `intentLimiter` | 30 per hour | `req.device.id` | `POST /api/v1/rewards/intents` |
| `ssvLimiter` | 300 per minute | `req.ip` | `GET /api/admob/ssv` |
| `adminLoginLimiter` | 10 per 15 minutes | `req.ip` | `POST /api/admin/auth/login` |
| `adminLimiter` | 300 per minute | `req.adminSessionId` | every other `/api/admin` route, after `adminAuth` |
| `agentLimiter` | 120 per minute | `req.server.id` (or `req.ip` for register) | every `/api/agent/v1` route |

The in-memory store is correct because there is exactly one API process. If you ever run two, this must change.

### 7.8 core/pagination.ts

- Query parameters: `limit` (integer 1 to 100, default 50) and `cursor` (optional string).
- `encodeCursor({ t: Date, id: string })` = base64url of `JSON.stringify({ t: t.toISOString(), id })`. `decodeCursor` reverses it; an invalid cursor throws `VALIDATION_FAILED`.
- Lists sort by a timestamp descending, then `id` descending. The next page uses `WHERE (ts, id) < (cursor.t, cursor.id)`, written in Prisma as `OR: [{ ts: { lt: t } }, { ts: t, id: { lt: id } }]`.
- Fetch `limit + 1` rows. If you got more than `limit`, drop the extra one and set `nextCursor` from the last kept row; otherwise `nextCursor = null`.
- Every list response is `{ "items": [...], "nextCursor": string | null, "total": number }`, where `total` is a `count()` with the same filters.

### 7.9 core/logger.ts and the no-logs rule

Export one pino logger with level `LOG_LEVEL` and `redact: { paths: ['authorization', 'cookie', 'token', 'password', 'secretAccessKey', 'accessKeyId', '*.token', '*.password'], remove: true }`.

Add one request-finished log line per request with exactly these fields: `method`, `route` (the Express route pattern such as `/api/v1/connect`, never the raw URL), `status`, `ms`.

NEVER log, at any level: a client IP address, a device ID, a WireGuard public key, a tunnel IP, a query string, a request body, or any token. The AdMob callback URL contains the device ID, so it is never logged either. These rules are what make the no-logs promise true.

## 8. Device API (used by the Android app)

The app uses seven endpoints under `/api/v1` plus the two reward endpoints in section 10. All requests and responses are JSON. Every endpoint except register needs `Authorization: Bearer <deviceToken>`.

### 8.1 Common rules

- Route order on every authenticated endpoint: `deviceAuth`, then `deviceLimiter`, then any endpoint limiter, then the handler.
- A blocked device may call `GET /me`, `GET /config` and `GET /regions`. Every other endpoint returns `403 BLOCKED` for it.
- Times are ISO strings. Balances are seconds.

### 8.2 POST /api/v1/devices/register

No auth. Limiter: `registerLimiter`. Called on first launch, and again whenever the app has no stored token (for example after a reinstall).

Request:

```json
{ "abuseKey": "9f2c…(64 lowercase hex chars)", "platform": "android", "appVersion": "1.0.0" }
```

- `abuseKey`: the app computes SHA-256 of the string `ANDROID_ID + ":veil-abuse-v1"` and sends it as 64 lowercase hex characters. Zod: `/^[0-9a-f]{64}$/`. The raw `ANDROID_ID` never leaves the phone.
- `platform`: exactly `"android"`.
- `appVersion`: 1 to 20 characters, `/^[0-9A-Za-z.\-]+$/`.

Rules, all inside one `prisma.$transaction`:

1. `keyHash = hashAbuseKey(abuseKey)`.
2. Upsert `AbuseKey` by `keyHash` (create with defaults if missing) and increment `installCount` by 1.
3. Read `Settings` row 1.
4. If the abuse key is blocked: the new device gets `balanceSeconds = 0`.
5. Else, if `starterGranted` is false: `balanceSeconds = starterMinutes × 60`, set `starterGranted = true`, and create a `WalletEntry` with `reason = starter` and that many seconds.
6. Else: `balanceSeconds = 0`. This is the reinstall protection: starter minutes are given once per phone.
7. `deviceToken = randomToken()`. Create the `Device` with `tokenHash = hashToken(deviceToken)`.

Response `201`:

```json
{ "deviceId": "uuid", "deviceToken": "base64url", "balanceSeconds": 3600, "blocked": false }
```

The app stores `deviceId` and `deviceToken` in encrypted storage. The token is never shown again.

### 8.3 GET /api/v1/me

Response `200`:

```json
{
  "deviceId": "uuid",
  "balanceSeconds": 2520,
  "blocked": false,
  "adsToday": 3,
  "adsLimit": 10,
  "session": { "sessionId": "uuid", "regionCode": "eu-central-1", "protocol": "udp", "startedAt": "2026-10-11T14:00:00.000Z" }
}
```

- `adsToday` is `device.adsToday` if `device.adsDay` equals today's UTC date (`YYYY-MM-DD`), otherwise `0`.
- `adsLimit` is `Settings.maxAdsPerDay`.
- `session` is `null` when there is no `Session` row for the device.

### 8.4 GET /api/v1/config

Response `200`:

```json
{
  "minutesPerAd": 30,
  "maxAdsPerDay": 10,
  "lowMinutesWarningSeconds": 600,
  "defaultProtocol": "auto",
  "supportEmail": "help@example.com",
  "admobAdUnitId": "ca-app-pub-…/…",
  "tcpLocalPort": 51821,
  "serverTime": "2026-10-11T14:32:00.000Z"
}
```

`lowMinutesWarningSeconds = Settings.lowMinutesWarning × 60`. `supportEmail` may be `null`. `admobAdUnitId` is `config.ADMOB_AD_UNIT_ID`.

### 8.5 GET /api/v1/regions

Returns the regions a user can pick right now, sorted by `sortOrder`.

A region is included only when `Region.visible = true` and it has at least one eligible server. Eligible means all of: `status = active`, `visible = true`, `lastReportAt` within the last 3 minutes, and its AWS account `status = working`.

Response `200`:

```json
{ "items": [ { "code": "eu-central-1", "displayName": "Frankfurt, Germany", "countryCode": "DE", "pingHost": "3.121.48.207", "pingPort": 443 } ] }
```

`pingHost` is the public IP of the region's eligible server with the fewest sessions. The app measures latency by timing a TCP connect to `pingHost:443` three times and taking the middle value; ICMP ping is blocked by the security group. "Fastest location" in the app means the region with the lowest measured value.

### 8.6 POST /api/v1/connect

Limiters: `deviceLimiter`, `connectLimiter`. Logic is in section 9.

Request:

```json
{ "regionCode": "eu-central-1", "protocol": "udp", "publicKey": "base64 WireGuard public key, 44 chars" }
```

- `regionCode`: one of the codes returned by `/regions`.
- `protocol`: `"udp"` or `"tcp"`. In the app's Auto mode, the app sends `udp` first; if no WireGuard handshake completes within 8 seconds, it calls connect again with `tcp`.
- `publicKey`: the device's WireGuard public key. The app generates the key pair once per install and keeps the private key in Android Keystore-backed encrypted storage. The private key is never sent. Validation: a 44-character string that base64-decodes to exactly 32 bytes; otherwise `400 INVALID_PUBLIC_KEY`.

Response `200`:

```json
{
  "sessionId": "uuid",
  "server": { "id": "uuid", "regionCode": "eu-central-1", "publicIp": "3.121.48.207" },
  "wireguard": {
    "address": "10.66.3.17/32",
    "dns": ["1.1.1.1", "1.0.0.1"],
    "mtu": 1420,
    "peer": {
      "publicKey": "server WireGuard public key",
      "endpoint": "3.121.48.207:51820",
      "allowedIps": ["0.0.0.0/0", "::/0"],
      "persistentKeepalive": 25
    }
  },
  "tcp": null,
  "balanceSeconds": 2520
}
```

When `protocol` is `tcp`, three things differ: `mtu` is `1280`, `peer.endpoint` is `127.0.0.1:51821` (the app's local forwarder, see 11.5), and `tcp` is `{ "host": "3.121.48.207", "port": 443, "certSha256": "64 lowercase hex chars" }`.

Errors: `403 BLOCKED`, `402 BALANCE_EMPTY`, `404 REGION_UNAVAILABLE`, `503 NO_SERVER_AVAILABLE`, `400 INVALID_PUBLIC_KEY`, `409 PUBLIC_KEY_IN_USE`.

The WireGuard peer is added on the server within about 2 seconds of this response (the agent's poll interval). WireGuard retries its handshake every 5 seconds by itself, so the app just starts the tunnel immediately.

### 8.7 POST /api/v1/disconnect

Body: `{}`. Deletes the device's `Session` if one exists (logic in 9.4). Always responds `200 {"ok":true}`, even if there was no session. The app calls this when the user taps Disconnect, before stopping the tunnel.

## 9. Connection engine

A connection is one `Session` row: the device, its server, its WireGuard public key and its tunnel IP. Minutes are debited by the server side from the agent's handshake reports, never from anything the app claims.

### 9.1 Server picker (connections/serverPicker.ts)

`pickServer(regionCode)` returns the eligible server in that region with the fewest sessions, or `null`.

1. Eligible means: `regionCode` matches, `status = active`, `visible = true`, `lastReportAt >= now - 180 s`, `wgPublicKey` and `publicIp` not null, and the server's AWS account has `status = working`.
2. For each eligible server, count its `Session` rows (`_count: { select: { sessions: true } }`).
3. Drop servers with 200 or more sessions. The constant is `MAX_SESSIONS_PER_SERVER = 200`.
4. Return the server with the lowest count. On a tie, the one with the earliest `activeAt`.

### 9.2 Tunnel IP allocator (connections/ipAllocator.ts)

- `randomTunnelIp()`: pick an integer `n` uniformly from 2 to 65534 with `crypto.randomInt(2, 65535)`. Return `10.66.${n >> 8}.${n & 255}`. This covers `10.66.0.2` to `10.66.255.254` and never returns the server's `10.66.0.1`.
- Uniqueness is enforced by the database (`@@unique([serverId, tunnelIp])`). When the session insert fails with Prisma error `P2002` on `tunnel_ip`, choose a new IP and retry, up to 10 attempts in total. After 10 failures throw `NO_SERVER_AVAILABLE`.

### 9.3 connect(device, input) (connections/connections.service.ts)

1. If `deviceBlocked`: throw `BLOCKED`.
2. If `device.balanceSeconds <= 0`: throw `BALANCE_EMPTY`.
3. Load the `Region` by `regionCode`. Missing or `visible = false`: throw `REGION_UNAVAILABLE`.
4. `server = pickServer(regionCode)`. If `null`: throw `NO_SERVER_AVAILABLE`.
5. In one `prisma.$transaction`:
   1. Find the device's existing `Session`. If one exists, delete it and increment `peersVersion` by 1 on its server.
   2. Create the new `Session`: `deviceId`, `serverId = server.id`, `protocol`, `publicKey`, `tunnelIp = randomTunnelIp()`, `lastDebitAt = now`, `lastHandshakeAt = null`.
   3. Increment `peersVersion` by 1 on `server`.
6. Error handling for step 5: `P2002` on `tunnel_ip` → retry step 5 with a new IP (9.2). `P2002` on `public_key` → throw `PUBLIC_KEY_IN_USE`.
7. Build the response from 8.6. `wireguard.peer.publicKey = server.wgPublicKey`. For `udp`: `mtu = 1420`, `endpoint = ${server.publicIp}:51820`, `tcp = null`. For `tcp`: `mtu = 1280`, `endpoint = 127.0.0.1:51821`, `tcp = { host: server.publicIp, port: 443, certSha256: server.tcpCertSha256 }`.

### 9.4 endSession(deviceId, reason)

One function used by every path that ends a connection: app disconnect, balance reaching zero, admin "Disconnect now", blocking, stale-session cleanup, and a server being terminated or failing.

1. Delete the `Session` where `deviceId` matches. If nothing was deleted, return.
2. Increment `peersVersion` by 1 on the session's server, in the same transaction.
3. `reason` is one of `user`, `balance_empty`, `admin`, `blocked`, `stale`, `server_gone`. It is used only for a debug log line containing the reason and the server ID. Never log the device ID.

When a server is terminated or marked failed, delete all its sessions in one `deleteMany` (no version bump needed, the server is gone).

### 9.5 Metering (metering/metering.service.ts)

`applyReport(server, peers, reportTime)` runs on every agent report (every 60 seconds per server). `peers` is the list from the report body (11.6), each with `publicKey` and `latestHandshake` (Unix seconds, `0` means never).

For each `Session` of this server:

1. Find the report entry with the same `publicKey`. Missing → treat `latestHandshake` as `0`.
2. `active = latestHandshake > 0 && reportTime − latestHandshake <= 180 seconds`.
3. If active:
   1. `seconds = clamp(floor((reportTime − session.lastDebitAt) / 1000), 0, 120)`.
   2. Run exactly this SQL through `prisma.$queryRaw`: `UPDATE devices SET balance_seconds = GREATEST(balance_seconds - ${seconds}, 0) WHERE id = ${deviceId}::uuid RETURNING balance_seconds`.
   3. Update the session: `lastDebitAt = reportTime`, `lastHandshakeAt = new Date(latestHandshake × 1000)`.
   4. If the returned balance is `0`: call `endSession(deviceId, 'balance_empty')`.
4. If not active: set `lastDebitAt = reportTime` only. Idle time is never charged later.

Why this works: with `persistentKeepalive = 25`, WireGuard renews its handshake about every 2 minutes for as long as the tunnel is up, so a handshake younger than 180 seconds means the tunnel is alive. The 120-second cap means a delayed report never charges more than two minutes at once.

### 9.6 What the user experiences at zero

1. The report that takes the balance to 0 ends the session and bumps the server's `peersVersion`.
2. The agent sees the new version within 2 seconds and removes the peer, so the tunnel stops passing traffic.
3. While connected, the app polls `GET /api/v1/me` every 60 seconds and also counts down locally from `balanceSeconds`. When `/me` returns `balanceSeconds: 0` or `session: null`, the app stops the tunnel and shows the "out of time" screen.

Worst case, a user gets up to about 60 extra seconds after reaching zero. That is accepted for the MVP.

## 10. Ad rewards and AdMob server-side verification

Minutes are created in exactly one place: the AdMob callback handler, after Google's signature checks out and the reward matches an intent the device asked for. A client saying "I watched an ad" never adds minutes.

### 10.1 The flow

1. The app calls `POST /api/v1/rewards/intents` and receives a `nonce`.
2. The app loads a rewarded ad with server-side verification options `userId = deviceId` and `customData = nonce`.
3. The user watches the ad. Google's servers call `GET /api/admob/ssv?…` with a signed query string containing that `user_id` and `custom_data`.
4. The backend verifies the signature, checks the intent, and credits `minutesPerAd × 60` seconds.
5. Meanwhile the app polls `GET /api/v1/rewards/intents/:id` every 2 seconds until the status is no longer `pending`.

### 10.2 POST /api/v1/rewards/intents

Auth: device. Limiters: `deviceLimiter`, `intentLimiter`. Body: `{}`.

1. Blocked: throw `BLOCKED`.
2. Compute today's ad count (8.3 rule). If it is at least `Settings.maxAdsPerDay`: throw `DAILY_LIMIT_REACHED`.
3. Create `RewardIntent`: `nonce = randomToken(16)`, `status = pending`, `expiresAt = now + 30 minutes`.

Response `201`:

```json
{ "intentId": "uuid", "nonce": "base64url", "userId": "device uuid", "customData": "same as nonce", "adUnitId": "ca-app-pub-…/…" }
```

In the app (react-native-google-mobile-ads): `RewardedAd.createForAdRequest(adUnitId, { serverSideVerificationOptions: { userId, customData } })`.

### 10.3 GET /api/v1/rewards/intents/:intentId

Auth: device. Only the intent's own device may read it; any other device gets `404 NOT_FOUND`.

Response `200`:

```json
{ "status": "credited", "secondsCredited": 1800, "rejectReason": null, "balanceSeconds": 4320 }
```

`status` is `pending`, `credited`, `rejected` or `expired`. The app polls every 2 seconds for up to 30 seconds. If it is still `pending` after that, the app shows "Your minutes will appear shortly" and refreshes `/me` later.

### 10.4 GET /api/admob/ssv (rewards/ssvVerifier.ts and rewards.service.ts)

No device auth. Limiter: `ssvLimiter`. This route is mounted before the JSON parser and must read the raw URL.

AdMob sends these query parameters, with `signature` and `key_id` always last: `ad_network`, `ad_unit`, `custom_data`, `key_id`, `reward_amount`, `reward_item`, `signature`, `timestamp`, `transaction_id`, `user_id`.

**Signature check — follow exactly. Do not re-encode the query string.**

1. `raw = req.originalUrl`. `query = raw.slice(raw.indexOf('?') + 1)`.
2. `i = query.indexOf('&signature=')`. If `i === -1`: bad signature.
3. `message = query.slice(0, i)`. This exact byte string is what Google signed.
4. `tail = new URLSearchParams(query.slice(i + 1))`. Read `signature` and `key_id` from it.
5. Get the PEM key for `key_id` from the key cache (10.5). Unknown key: bad signature.
6. `valid = crypto.verify('sha256', Buffer.from(message, 'utf8'), { key: pem, dsaEncoding: 'der' }, Buffer.from(signature, 'base64url'))`.
7. Not valid: increment `RejectCounter` for today with reason `bad_signature` (upsert, `count + 1`) and respond `403` with code `SSV_BAD_SIGNATURE`. Store nothing else.

**Business checks — after a valid signature.** Parse `params = new URLSearchParams(message)`. Run these in order inside one `prisma.$transaction`. The first failing check decides the outcome:

| Order | Check | Fails with reason |
| --- | --- | --- |
| 1 | `ad_unit` equals `ADMOB_AD_UNIT_ID`, or equals the part of it after the `/` | `wrong_ad_unit` |
| 2 | `timestamp` (milliseconds) is no more than 24 hours old and no more than 5 minutes in the future | `stale` |
| 3 | A `Device` with `id = user_id` exists (`user_id` must also be a valid UUID) | `unknown_device` |
| 4 | That device's abuse key is not blocked | `blocked` |
| 5 | A `RewardIntent` exists with `nonce = custom_data`, the same `deviceId`, `status = pending` and `expiresAt > now` | `bad_intent` |
| 6 | Today's ad count for the device is below `Settings.maxAdsPerDay` | `daily_limit` |

If all checks pass: `seconds = Settings.minutesPerAd × 60`. In the same transaction:

1. Create `AdReward` with `transactionId`, `deviceId`, `intentId`, `adUnit`, `rewardAmount`, `rewardItem`, `outcome = credited`, `secondsCredited = seconds`.
2. Update the device: `balanceSeconds + seconds`. If `adsDay` is today, `adsToday + 1`; otherwise `adsDay = today` and `adsToday = 1`.
3. Create `WalletEntry` with `reason = ad_reward`, `seconds`, `refId = AdReward.id`.
4. Set the intent `status = credited`.

If a check fails: create `AdReward` with `outcome = rejected`, the `rejectReason` and `secondsCredited = 0` (`deviceId` and `intentId` only when they were found), and set the intent, if found, to `status = rejected` with the same reason.

**Duplicates.** If the `AdReward` insert fails with `P2002` on `transaction_id`, the whole transaction rolls back (so nothing is credited twice). Then, outside it, increment `RejectCounter` for today with reason `duplicate`.

**Response.** Every case after a valid signature responds `200` with body `ok`. AdMob only needs a 2xx.

### 10.5 The key cache

- Fetch `ADMOB_KEYS_URL` with `fetch()`. The JSON looks like `{"keys":[{"keyId":3335741209,"pem":"-----BEGIN PUBLIC KEY-----…","base64":"…"}]}`.
- Store a map from `String(keyId)` to `pem`, with the fetch time.
- Reuse the map for 1 hour. After that, refetch on the next request.
- When `key_id` is not in the map, refetch immediately, but at most once every 60 seconds.
- If a fetch fails and an older map exists, keep using the older map and log a warning. Never hardcode a key.

### 10.6 AdMob console setup and the real-device test

1. In AdMob, open the rewarded ad unit you created in 4.1 and set its reward to amount `30`, item `minutes` (display only; the server decides the real amount).
2. In the same ad unit's settings, find **Server-side verification** and enter `https://[YOURNAME].duckdns.org/api/admob/ssv`. Use **Verify URL**; AdMob sends a test callback and expects a 2xx.
3. In AdMob **Settings → Test devices**, add your phone. Your real ad unit then serves test ads to it and still sends callbacks to your server. Do not use Google's public sample ad unit IDs for this phase: callbacks for them never reach your server.
4. Watch one ad in the app. `Device.balanceSeconds` must rise by 1800 within about 30 seconds.
5. Copy the callback URL from your browser's network tools or by temporarily adding a debug line (remove it afterwards: it contains the device ID), and request it again with curl. The response must be `ok` and the balance must not change.

### 10.7 Abuse limits in one place

- Starter minutes: once per phone (8.2).
- Ads: at most `maxAdsPerDay` credited per device per UTC day, and each needs a fresh intent.
- Intents: at most 30 per hour per device (`intentLimiter`).
- Replays: blocked by the unique `transactionId` and the 24-hour timestamp window.
- Blocked phones: cannot connect, cannot create intents, and callbacks for them are rejected.

## 11. Edge server

An edge server is a stock Ubuntu 24.04 instance that configures itself on first boot from a small script, downloads two Python programs from the API, and then follows the API's instructions. Nothing on it is configured by hand, and it has no SSH: a broken server is terminated and replaced.

### 11.1 What runs on an edge server

| Item | Path | Purpose |
| --- | --- | --- |
| `wg0` interface | `/etc/wireguard/wg0.conf` | WireGuard on UDP 51820, address `10.66.0.1/16`. No peers in the file; the agent adds them live |
| Firewall script | `/etc/veil/fw.sh` | NAT and isolation rules, run by `wg0`'s `PostUp` / `PostDown` |
| `veil-agent.service` | `/opt/veil/veil_agent.py` | Registers, syncs peers every 2 s, reports every 60 s |
| `veil-tcpgw.service` | `/opt/veil/veil_tcpgw.py` | TLS on TCP 443 carrying WireGuard packets |
| Agent config | `/etc/veil/agent.json` (mode 600) | `apiBase`, `serverId`, `bootstrapToken` |
| Agent token | `/etc/veil/agent_token` (mode 600) | Written once after registration |
| TLS key and certificate | `/etc/veil/tls/key.pem`, `/etc/veil/tls/cert.pem` | Self-signed, generated at boot; the app pins its SHA-256 |
| Boot log | `/var/log/veil-bootstrap.log` | Output of the boot script |

### 11.2 edge/bootstrap.sh.tpl (EC2 user data)

The API fills the six `{{…}}` placeholders (12.6) and passes the result as user data. Placeholders are replaced with plain string replacement; the values contain no special characters.

```bash
#!/bin/bash
set -euo pipefail
exec > /var/log/veil-bootstrap.log 2>&1

API_BASE="{{API_BASE}}"
SERVER_ID="{{SERVER_ID}}"
BOOTSTRAP_TOKEN="{{BOOTSTRAP_TOKEN}}"
AGENT_SHA256="{{AGENT_SHA256}}"
TCPGW_SHA256="{{TCPGW_SHA256}}"
FW_SHA256="{{FW_SHA256}}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y wireguard-tools iptables curl openssl

cat > /etc/sysctl.d/99-veil.conf <<'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.core.rmem_max = 4194304
net.core.wmem_max = 4194304
EOF
sysctl --system

umask 077
mkdir -p /etc/wireguard /etc/veil/tls /opt/veil
wg genkey > /etc/wireguard/server.key
wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
  -subj "/CN=veil-edge" -keyout /etc/veil/tls/key.pem -out /etc/veil/tls/cert.pem

curl -fsS --retry 10 --retry-delay 5 "${API_BASE}/api/agent/v1/files/veil_agent.py" -o /opt/veil/veil_agent.py
curl -fsS --retry 10 --retry-delay 5 "${API_BASE}/api/agent/v1/files/veil_tcpgw.py" -o /opt/veil/veil_tcpgw.py
curl -fsS --retry 10 --retry-delay 5 "${API_BASE}/api/agent/v1/files/fw.sh" -o /etc/veil/fw.sh
echo "${AGENT_SHA256}  /opt/veil/veil_agent.py" | sha256sum -c -
echo "${TCPGW_SHA256}  /opt/veil/veil_tcpgw.py" | sha256sum -c -
echo "${FW_SHA256}  /etc/veil/fw.sh" | sha256sum -c -
chmod 700 /etc/veil/fw.sh
chmod 755 /opt/veil
chmod 644 /opt/veil/veil_agent.py /opt/veil/veil_tcpgw.py

cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.66.0.1/16
ListenPort = 51820
PrivateKey = $(cat /etc/wireguard/server.key)
PostUp = /etc/veil/fw.sh up
PostDown = /etc/veil/fw.sh down
EOF

cat > /etc/veil/agent.json <<EOF
{"apiBase":"${API_BASE}","serverId":"${SERVER_ID}","bootstrapToken":"${BOOTSTRAP_TOKEN}"}
EOF
chmod 600 /etc/veil/agent.json

cat > /etc/systemd/system/veil-agent.service <<'EOF'
[Unit]
Description=Veil edge agent
After=network-online.target wg-quick@wg0.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/veil/veil_agent.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/veil-tcpgw.service <<'EOF'
[Unit]
Description=Veil TCP gateway
After=network-online.target wg-quick@wg0.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/veil/veil_tcpgw.py
DynamicUser=yes
AmbientCapabilities=CAP_NET_BIND_SERVICE
LoadCredential=cert.pem:/etc/veil/tls/cert.pem
LoadCredential=key.pem:/etc/veil/tls/key.pem
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now wg-quick@wg0
systemctl enable --now veil-tcpgw
systemctl enable --now veil-agent
```

`fw.sh` (11.4) is the third downloaded file. All three are checked against the SHA-256 values the API computed at startup, so a tampered download stops the boot. `chmod 644` is required because `veil-tcpgw` runs as an unprivileged dynamic user and must be able to read its own file.

### 11.3 edge/veil\_agent.py

Copy this file exactly. It uses only the Python 3.12 standard library.

```python
#!/usr/bin/env python3
"""Veil edge agent. Python 3.12 standard library only."""
import hashlib
import ipaddress
import json
import os
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.request

VERSION = "1.0.0"
CONFIG_PATH = "/etc/veil/agent.json"
TOKEN_PATH = "/etc/veil/agent_token"
WG_PUB_PATH = "/etc/wireguard/server.pub"
CERT_PATH = "/etc/veil/tls/cert.pem"
WG_IFACE = "wg0"
TUNNEL_NET = ipaddress.ip_network("10.66.0.0/16")
SERVER_TUNNEL_IP = "10.66.0.1"
KEY_RE = re.compile(r"^[A-Za-z0-9+/]{43}=$")
IMDS = "http://169.254.169.254"
POLL_SECONDS = 2
REPORT_SECONDS = 60


def log(msg):
    print(f"veil-agent: {msg}", flush=True)


def http(method, url, body=None, headers=None, timeout=10):
    hdrs = {"User-Agent": f"veil-agent/{VERSION}"}
    if headers:
        hdrs.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, None


def imds(path):
    req = urllib.request.Request(IMDS + "/latest/api/token", method="PUT",
                                 headers={"X-aws-ec2-metadata-token-ttl-seconds": "300"})
    with urllib.request.urlopen(req, timeout=5) as r:
        token = r.read().decode()
    req = urllib.request.Request(IMDS + "/latest/meta-data/" + path,
                                 headers={"X-aws-ec2-metadata-token": token})
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.read().decode().strip()


def read_text(path):
    with open(path) as f:
        return f.read().strip()


def cert_sha256():
    der = ssl.PEM_cert_to_DER_cert(read_text(CERT_PATH) + "\n")
    return hashlib.sha256(der).hexdigest()


def register(cfg):
    delay = 5
    while True:
        try:
            body = {
                "serverId": cfg["serverId"],
                "bootstrapToken": cfg["bootstrapToken"],
                "instanceId": imds("instance-id"),
                "publicIp": imds("public-ipv4"),
                "wgPublicKey": read_text(WG_PUB_PATH),
                "tcpCertSha256": cert_sha256(),
                "agentVersion": VERSION,
            }
            status, data = http("POST", cfg["apiBase"] + "/api/agent/v1/register", body)
            if status == 200 and data and "agentToken" in data:
                fd = os.open(TOKEN_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w") as f:
                    f.write(data["agentToken"])
                log("registered")
                return data["agentToken"]
            log(f"register failed with HTTP {status}")
        except Exception as e:
            log(f"register error: {e}")
        time.sleep(delay)
        delay = min(delay * 2, 60)


def wg(*args):
    return subprocess.run(["wg", *args], check=True, capture_output=True, text=True).stdout


def current_peers():
    lines = wg("show", WG_IFACE, "dump").strip().splitlines()
    peers = {}
    for line in lines[1:]:
        f = line.split("\t")
        if len(f) < 8:
            continue
        ip = f[3].split("/")[0] if f[3] and f[3] != "(none)" else None
        peers[f[0]] = {"ip": ip, "latestHandshake": int(f[4]), "rx": int(f[5]), "tx": int(f[6])}
    return peers


def parse_desired(peers):
    desired = {}
    for p in peers:
        pk = str(p.get("publicKey", ""))
        try:
            addr = ipaddress.ip_address(str(p.get("tunnelIp", "")))
        except ValueError:
            continue
        if KEY_RE.match(pk) and addr in TUNNEL_NET and str(addr) != SERVER_TUNNEL_IP:
            desired[pk] = str(addr)
    return desired


def reconcile(desired):
    current = current_peers()
    for pk, info in current.items():
        if pk not in desired or desired[pk] != info["ip"]:
            wg("set", WG_IFACE, "peer", pk, "remove")
    for pk, ip in desired.items():
        if pk not in current or current[pk]["ip"] != ip:
            wg("set", WG_IFACE, "peer", pk, "allowed-ips", f"{ip}/32")


def default_iface():
    out = subprocess.run(["ip", "-4", "route", "show", "default"],
                         capture_output=True, text=True).stdout.split()
    return out[out.index("dev") + 1] if "dev" in out else None


def net_tx_bytes(iface):
    if not iface:
        return 0
    with open("/proc/net/dev") as f:
        for line in f:
            if line.strip().startswith(iface + ":"):
                return int(line.split(":", 1)[1].split()[8])
    return 0


def cpu_times():
    with open("/proc/stat") as f:
        parts = [int(x) for x in f.readline().split()[1:]]
    return sum(parts), parts[3] + parts[4]


def mem_pct():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            key, value = line.split(":", 1)
            info[key] = int(value.split()[0])
    return round(100.0 * (1 - info["MemAvailable"] / info["MemTotal"]), 1)


def uptime_seconds():
    with open("/proc/uptime") as f:
        return int(float(f.read().split()[0]))


def main():
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    token = read_text(TOKEN_PATH) if os.path.exists(TOKEN_PATH) else register(cfg)
    auth = {"Authorization": f"Bearer {token}"}
    base = cfg["apiBase"] + "/api/agent/v1"
    iface = default_iface()
    applied = 0
    last_report = 0.0
    prev_cpu = cpu_times()
    while True:
        try:
            status, data = http("GET", base + "/peers", headers={**auth, "If-None-Match": f'"{applied}"'})
            if status == 200 and data is not None:
                reconcile(parse_desired(data.get("peers", [])))
                applied = int(data["version"])
            elif status == 401:
                log("agent token rejected; this server is being removed")
                time.sleep(300)
                continue
            now = time.time()
            if now - last_report >= REPORT_SECONDS:
                iface = iface or default_iface()
                total, idle = cpu_times()
                dt, di = total - prev_cpu[0], idle - prev_cpu[1]
                prev_cpu = (total, idle)
                cpu = round(100.0 * (1 - di / dt), 1) if dt > 0 else 0.0
                peers = [{"publicKey": pk, "latestHandshake": p["latestHandshake"],
                          "rxBytes": p["rx"], "txBytes": p["tx"]}
                         for pk, p in current_peers().items()]
                body = {"appliedVersion": applied, "peers": peers, "cpuPct": max(0.0, min(cpu, 100.0)),
                        "memPct": mem_pct(), "netTxBytes": net_tx_bytes(iface),
                        "uptimeSeconds": uptime_seconds()}
                status, _ = http("POST", base + "/report", body, auth, timeout=20)
                if status == 200:
                    last_report = now
                else:
                    log(f"report failed with HTTP {status}")
                    last_report = now - REPORT_SECONDS + 10
        except Exception as e:
            log(f"loop error: {e}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
```

### 11.4 edge/fw.sh (served as a file, run by wg0)

These rules masquerade client traffic out of the main interface and stop clients from reaching the instance metadata service, the VPC, each other, the server itself, or port 25.

```bash
#!/bin/bash
set -u
IFACE=$(ip -4 route show default | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')

if [ "$1" = "up" ]; then
  iptables -N VEIL_FWD 2>/dev/null || true
  iptables -F VEIL_FWD
  iptables -A VEIL_FWD -d 169.254.0.0/16 -j DROP
  iptables -A VEIL_FWD -d 10.0.0.0/8 -j DROP
  iptables -A VEIL_FWD -d 172.16.0.0/12 -j DROP
  iptables -A VEIL_FWD -d 192.168.0.0/16 -j DROP
  iptables -A VEIL_FWD -d 100.64.0.0/10 -j DROP
  iptables -A VEIL_FWD -p tcp --dport 25 -j DROP
  iptables -A VEIL_FWD -o "$IFACE" -j ACCEPT
  iptables -A VEIL_FWD -j DROP
  iptables -C FORWARD -i wg0 -j VEIL_FWD 2>/dev/null || iptables -I FORWARD 1 -i wg0 -j VEIL_FWD
  iptables -C FORWARD -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || iptables -I FORWARD 2 -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
  iptables -C FORWARD -o wg0 -j DROP 2>/dev/null || iptables -I FORWARD 3 -o wg0 -j DROP
  iptables -C INPUT -i wg0 -j DROP 2>/dev/null || iptables -I INPUT 1 -i wg0 -j DROP
  iptables -t nat -C POSTROUTING -s 10.66.0.0/16 -o "$IFACE" -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s 10.66.0.0/16 -o "$IFACE" -j MASQUERADE
  iptables -t mangle -C FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
else
  iptables -D FORWARD -i wg0 -j VEIL_FWD 2>/dev/null || true
  iptables -D FORWARD -o wg0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true
  iptables -D FORWARD -o wg0 -j DROP 2>/dev/null || true
  iptables -D INPUT -i wg0 -j DROP 2>/dev/null || true
  iptables -t nat -D POSTROUTING -s 10.66.0.0/16 -o "$IFACE" -j MASQUERADE 2>/dev/null || true
  iptables -t mangle -D FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null || true
  iptables -F VEIL_FWD 2>/dev/null || true
  iptables -X VEIL_FWD 2>/dev/null || true
fi
exit 0
```

### 11.5 TCP mode: edge/veil\_tcpgw.py and the frame protocol

The frame protocol is the same on the server, the test tool and the Android app:

- One TLS 1.3 connection to the server's TCP 443 carries a stream of frames.
- Each frame is a 2-byte big-endian length `N` (1 to 1500) followed by exactly `N` bytes: one WireGuard UDP datagram.
- The server opens one UDP socket per TLS connection, connected to `127.0.0.1:51820`, and relays in both directions.
- The client does not trust any certificate authority. After the TLS handshake it computes SHA-256 of the server certificate in DER form and compares it with `certSha256` from the connect response. If they differ, it closes the connection before sending anything.
- A connection with no data either way for 180 seconds is closed. A frame of length 0 or above 1500 closes the connection.

```python
#!/usr/bin/env python3
"""Veil TCP gateway: WireGuard datagrams inside TLS on TCP 443. Python 3.12 standard library only."""
import asyncio
import os
import ssl
import struct

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 443
WG_ADDR = ("127.0.0.1", 51820)
MAX_FRAME = 1500
IDLE_SECONDS = 180
MAX_CONNECTIONS = 1000
MAX_BUFFER = 1024 * 1024

active = 0


class UdpSide(asyncio.DatagramProtocol):
    def __init__(self, writer, touch):
        self.writer = writer
        self.touch = touch

    def datagram_received(self, data, addr):
        if self.writer.is_closing():
            return
        if self.writer.transport.get_write_buffer_size() > MAX_BUFFER:
            return  # drop the packet, as UDP would
        self.writer.write(struct.pack("!H", len(data)) + data)
        self.touch()


async def watchdog(writer, last, loop):
    while not writer.is_closing():
        await asyncio.sleep(10)
        if loop.time() - last[0] > IDLE_SECONDS:
            writer.close()
            return


async def handle(reader, writer):
    global active
    if active >= MAX_CONNECTIONS:
        writer.close()
        return
    active += 1
    loop = asyncio.get_running_loop()
    last = [loop.time()]

    def touch():
        last[0] = loop.time()

    transport = None
    wd = asyncio.create_task(watchdog(writer, last, loop))
    try:
        transport, _ = await loop.create_datagram_endpoint(lambda: UdpSide(writer, touch), remote_addr=WG_ADDR)
        while True:
            (length,) = struct.unpack("!H", await reader.readexactly(2))
            if length == 0 or length > MAX_FRAME:
                break
            payload = await reader.readexactly(length)
            transport.sendto(payload)
            touch()
    except (asyncio.IncompleteReadError, ConnectionError, ssl.SSLError, OSError):
        pass
    finally:
        active -= 1
        wd.cancel()
        if transport is not None:
            transport.close()
        writer.close()


def make_context():
    creds = os.environ.get("CREDENTIALS_DIRECTORY", "/etc/veil/tls")
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    ctx.load_cert_chain(os.path.join(creds, "cert.pem"), os.path.join(creds, "key.pem"))
    return ctx


async def main():
    server = await asyncio.start_server(handle, LISTEN_HOST, LISTEN_PORT, ssl=make_context(),
                                        ssl_handshake_timeout=15, backlog=512)
    print("veil-tcpgw: listening on 443", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
```

**edge/tools/tcp\_client\_test.py** is the reference client. The Android app's TCP forwarder must behave exactly like it: listen on UDP `127.0.0.1:51821`, frame everything WireGuard sends there, and send unframed replies back to the last local address it heard from.

```python
#!/usr/bin/env python3
"""Test client for veil-tcpgw.
Usage: python3 tcp_client_test.py --host 3.121.48.207 --cert-sha256 <64 hex> [--listen 51821]"""
import argparse
import asyncio
import hashlib
import ssl
import struct


class LocalUdp(asyncio.DatagramProtocol):
    def __init__(self):
        self.peer = None
        self.writer = None

    def datagram_received(self, data, addr):
        self.peer = addr
        if self.writer is not None and not self.writer.is_closing():
            self.writer.write(struct.pack("!H", len(data)) + data)


async def run(host, fingerprint, listen_port):
    loop = asyncio.get_running_loop()
    udp, local = await loop.create_datagram_endpoint(LocalUdp, local_addr=("127.0.0.1", listen_port))
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    delay = 1
    while True:
        try:
            reader, writer = await asyncio.open_connection(host, 443, ssl=ctx, server_hostname="veil-edge")
            der = writer.get_extra_info("ssl_object").getpeercert(binary_form=True)
            if hashlib.sha256(der).hexdigest() != fingerprint.lower():
                print("certificate fingerprint mismatch; refusing to send traffic")
                writer.close()
                return
            print("connected")
            delay = 1
            local.writer = writer
            while True:
                (length,) = struct.unpack("!H", await reader.readexactly(2))
                payload = await reader.readexactly(length)
                if local.peer is not None:
                    udp.sendto(payload, local.peer)
        except (OSError, asyncio.IncompleteReadError, ssl.SSLError) as e:
            print(f"connection lost: {e}; retrying in {delay}s")
        local.writer = None
        await asyncio.sleep(delay)
        delay = min(delay * 2, 15)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--cert-sha256", required=True)
    ap.add_argument("--listen", type=int, default=51821)
    a = ap.parse_args()
    asyncio.run(run(a.host, a.cert_sha256, a.listen))
```

Note for the Android build: the app must exclude its own package from the tunnel (WireGuard `Interface` excluded applications = the app's package name). Otherwise the forwarder's TLS connection would be routed back into the tunnel it is carrying.

### 11.6 Agent API (backend: agent.routes.ts, agent.service.ts, edgeFiles.ts)

**edgeFiles.ts.** At API startup, read `veil_agent.py`, `veil_tcpgw.py` and `fw.sh` from `EDGE_FILES_DIR` into memory and compute each file's `sha256Hex`. Export `getEdgeFile(name)` and `edgeSha(name)`. If any of the three files is missing, exit the process with code 1.

**GET /api/agent/v1/files/:name** — no auth, `agentLimiter` keyed by IP. `name` must be one of the three file names, else `404 NOT_FOUND`. Respond `200`, `Content-Type: text/plain; charset=utf-8`, body = the file. The code is not secret; integrity comes from the hashes in user data.

**POST /api/agent/v1/register** — no agent auth (the bootstrap token is the credential).

```json
{ "serverId": "uuid", "bootstrapToken": "…", "instanceId": "i-0123456789abcdef0",
  "publicIp": "3.121.48.207", "wgPublicKey": "44 chars", "tcpCertSha256": "64 hex", "agentVersion": "1.0.0" }
```

Zod: `instanceId` `/^i-[0-9a-f]{8,17}$/`, `publicIp` a valid IPv4, `wgPublicKey` 44 characters decoding to 32 bytes, `tcpCertSha256` `/^[0-9a-f]{64}$/`.

1. Load the server by `serverId`. Missing: `401 AUTH_INVALID`.
2. `bootstrapTokenHash` is null (already used) or `!safeEqual(bootstrapTokenHash, hashToken(bootstrapToken))`: `401 AUTH_INVALID`.
3. `server.instanceId` is null: `409 SERVER_STATE` (the agent retries). `server.instanceId !== instanceId`: `401 AUTH_INVALID`.
4. `status` must be `provisioning`, or `failed` with `failReason = never_registered`. Otherwise `409 SERVER_STATE`.
5. `agentToken = randomToken()`. Update the server: `agentTokenHash = hashToken(agentToken)`, `bootstrapTokenHash = null`, `wgPublicKey`, `tcpCertSha256`, `publicIp`, `agentVersion`, `status = active`, `failReason = null`, `failDetail = null`, `activeAt = now`, `lastReportAt = now`, `peersVersion + 1`.
6. Respond `200 {"agentToken":"…","pollSeconds":2,"reportSeconds":60}`.

**GET /api/agent/v1/peers** — agent auth.

1. Read header `If-None-Match`, strip the quotes, parse as an integer.
2. If it equals `server.peersVersion`: respond `304` with no body.
3. Else respond `200` with header `ETag: "<peersVersion>"` and body `{"version": <peersVersion>, "peers": [{"publicKey":"…","tunnelIp":"10.66.3.17"}]}`, built from all `Session` rows of this server.

**POST /api/agent/v1/report** — agent auth.

```json
{ "appliedVersion": 41, "peers": [ { "publicKey": "…", "latestHandshake": 1791690000, "rxBytes": 1234, "txBytes": 5678 } ],
  "cpuPct": 12.5, "memPct": 41.0, "netTxBytes": 987654321, "uptimeSeconds": 3600 }
```

Zod: `peers` at most 1000 items; all numbers non-negative integers except `cpuPct` and `memPct` (0 to 100).

In one transaction:

1. Update the server: `lastReportAt = now`, `cpuPct`, `memPct`, `appliedVersion`.
2. If `status = failed` and `failReason = agent_silent`: set `status = active`, `failReason = null`.
3. Data out: `delta = netTxBytes − server.txCounter`; if `delta < 0` (the counter reset after a reboot), `delta = netTxBytes`. Upsert `AccountUsage` for this server's account and the current month (`YYYY-MM`, UTC), adding `delta` to `txBytes`. Set `server.txCounter = netTxBytes`.
4. Call `applyReport(server, peers, now)` from 9.5.

Respond `200 {"ok":true,"version":<peersVersion>}`.

## 12. AWS orchestration

The API manages edge servers with the AWS SDK v3, using the encrypted access keys of each stored AWS account. Each account's IAM user can only manage EC2, and can only reboot or terminate instances tagged as Veil's.

### 12.1 IAM policy for the `veil-orchestrator` user (every edge account)

In the AWS console: IAM → Users → `veil-orchestrator` → Add permissions → Create inline policy → JSON. Paste exactly, name it `veil-orchestrator`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VeilDescribeAndLaunch",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeRegions",
        "ec2:DescribeImages",
        "ec2:DescribeInstanceTypes",
        "ec2:DescribeInstances",
        "ec2:DescribeVpcs",
        "ec2:DescribeSecurityGroups",
        "ec2:CreateDefaultVpc",
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:CreateTags",
        "ec2:RunInstances"
      ],
      "Resource": "*"
    },
    {
      "Sid": "VeilManageOwnInstances",
      "Effect": "Allow",
      "Action": ["ec2:RebootInstances", "ec2:TerminateInstances"],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:ResourceTag/veil-managed": "true" } }
    }
  ]
}
```

`sts:GetCallerIdentity` needs no permission. The control account needs no keys at all, because the control server is never managed by the API.

### 12.2 Key storage and clients (aws/awsClient.ts)

- Stored: `accessKeyIdEnc = encrypt(accessKeyId)`, `secretAccessKeyEnc = encrypt(secretAccessKey)`, `accessKeyLast4 = accessKeyId.slice(-4)`. The API never returns the key ID or secret; it shows `AKIA…` + last 4.
- `ec2For(account, region)`: decrypt both, return `new EC2Client({ region, credentials: { accessKeyId, secretAccessKey }, maxAttempts: 3 })`.
- `stsFor(accessKeyId, secretAccessKey)`: `new STSClient({ region: 'us-east-1', credentials: … })`.
- Clients are created per operation. Decrypted keys are never stored outside the function that uses them.

### 12.3 testKeys(accessKeyId, secretAccessKey) (aws/awsAccounts.service.ts)

1. `GetCallerIdentityCommand`. Save `Account` (12 digits) as `awsAccountNumber`. If `Arn` ends with `:root`: throw `AWS_ROOT_KEYS`.
2. `DescribeRegionsCommand({ AllRegions: false })` in `us-east-1`. Keep the region codes that also exist in the `Region` table.
3. `DescribeInstanceTypesCommand` in `us-east-1` with filters `free-tier-eligible = true` and `processor-info.supported-architecture = x86_64`. Collect `InstanceType` names.
4. Return `{ ok: true, awsAccountNumber, regions: [...codes], freeTierTypes: [...names] }`.

AWS errors are converted with 12.8.

### 12.4 Account lifecycle

- **Add:** run `testKeys`. If `awsAccountNumber` already exists in `AwsAccount`: `409 AWS_ACCOUNT_EXISTS`. Else create with `status = working`, `lastCheckedAt = now`.
- **Update keys:** run `testKeys`. The returned `awsAccountNumber` must equal the stored one, else `409 AWS_ACCOUNT_MISMATCH`. Save the new encrypted keys, `status = working`, `lastError = null`.
- **Disable / enable:** `status = disabled` or `working`. A disabled account's servers keep running, but no server is created in it and its servers are not eligible for new connections (9.1).
- **Remove:** if the account has any server whose status is not `terminated`: `409 ACCOUNT_HAS_SERVERS`. Else delete its `terminated` server rows, then the account (its `AccountRegion` and `AccountUsage` rows cascade).
- **Key failures:** whenever any AWS call for an account fails with an error that 12.8 maps to `AWS_KEYS_INVALID`, set that account's `status = keys_rejected` and `lastError` to the AWS error name.

### 12.5 ensureRegionSetup(account, regionCode)

Returns the `AccountRegion` row, creating AWS resources only when missing.

1. If an `AccountRegion` row exists, call `DescribeSecurityGroupsCommand({ GroupIds: [row.securityGroupId] })`. If it succeeds, return the row. If the error is `InvalidGroup.NotFound`, delete the row and continue.
2. `DescribeVpcsCommand` with filter `isDefault = true`. If there is none, `CreateDefaultVpcCommand({})` and use its `Vpc.VpcId`.
3. `DescribeSecurityGroupsCommand` with filters `group-name = veil-edge` and `vpc-id = <vpcId>`. If found, use it.
4. Otherwise `CreateSecurityGroupCommand({ GroupName: 'veil-edge', Description: 'Veil VPN edge server', VpcId, TagSpecifications: [{ ResourceType: 'security-group', Tags: [{ Key: 'veil-managed', Value: 'true' }] }] })`, then `AuthorizeSecurityGroupIngressCommand` with two rules: UDP 51820 from `0.0.0.0/0`, and TCP 443 from `0.0.0.0/0`. Ignore error `InvalidPermission.Duplicate`. Do not add SSH. Leave the default outbound rule.
5. Upsert the `AccountRegion` row with `vpcId` and `securityGroupId`, and return it.

### 12.6 createServer(accountId, regionCode, instanceType?) (aws/provisioning.service.ts)

1. The account must have `status = working`, else `409 AWS_ACCOUNT_UNAVAILABLE`. The region must exist in `Region`, else `404 NOT_FOUND`.
2. **Image.** `DescribeImagesCommand({ Owners: ['099720109477'], Filters: [{ Name: 'name', Values: ['ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*'] }, { Name: 'state', Values: ['available'] }, { Name: 'architecture', Values: ['x86_64'] }] })`. Pick the image with the latest `CreationDate`. Cache the result per account and region in memory for 24 hours. None found: `502 AWS_ERROR` with message `No Ubuntu 24.04 image found`. (`099720109477` is Canonical's official AWS account.)
3. **Instance type.** Get the free-tier x86\_64 types for this region with `DescribeInstanceTypesCommand` (same filters as 12.3). If `instanceType` was given, it must be in that list, else `400 INSTANCE_TYPE_NOT_FREE`. If not given, choose `t3.micro` if listed, else `t2.micro` if listed, else the first listed. Empty list: `409 NO_FREE_TIER_TYPE`.
4. `accountRegion = ensureRegionSetup(account, regionCode)`.
5. `bootstrapToken = randomToken()`. Create the `Server` row: `awsAccountId`, `regionCode`, `instanceType`, `status = provisioning`, `bootstrapTokenHash = hashToken(bootstrapToken)`, `launchedAt = now`.
6. **User data.** Read `edge/bootstrap.sh.tpl` and replace `{{API_BASE}}` with `PUBLIC_BASE_URL`, `{{SERVER_ID}}` with the new server ID, `{{BOOTSTRAP_TOKEN}}` with the token, and `{{AGENT_SHA256}}`, `{{TCPGW_SHA256}}`, `{{FW_SHA256}}` with `edgeSha(...)` of the three files. Base64-encode the result.
7. **Launch.** `RunInstancesCommand` with exactly:
   - `ImageId`, `InstanceType`, `MinCount: 1`, `MaxCount: 1`
   - `SecurityGroupIds: [accountRegion.securityGroupId]`
   - `UserData: <base64>`
   - `MetadataOptions: { HttpTokens: 'required', HttpEndpoint: 'enabled', HttpPutResponseHopLimit: 1 }`
   - `BlockDeviceMappings: [{ DeviceName: '/dev/sda1', Ebs: { VolumeSize: 8, VolumeType: 'gp3', DeleteOnTermination: true, Encrypted: true } }]`
   - `InstanceInitiatedShutdownBehavior: 'terminate'`
   - `ClientToken: <server id>` (makes a retried call launch only one instance)
   - `TagSpecifications` for `instance` and `volume`, each with tags `Name = veil-<regionCode>-<first 8 chars of server id>`, `veil-managed = true`, `veil-server-id = <server id>`
   - No `KeyName` (no SSH key), no subnet (AWS uses a default subnet of the default VPC, which assigns a public IPv4).
8. Success: set `server.instanceId = Instances[0].InstanceId`. Failure: set `status = failed`, `failReason = launch_error`, `failDetail` = AWS error name + message (first 500 characters), apply 12.4 key-failure rule, and throw the mapped error from 12.8.
9. Return the server. It becomes `active` when the agent registers (11.6), usually 2 to 4 minutes later.

### 12.7 Server actions

| Action | Rules |
| --- | --- |
| Drain | Only from `active`. Set `status = draining`. Existing sessions continue; no new sessions are placed here (9.1). |
| Undrain | Only from `draining`. Set `status = active`. |
| Hide / show | Set `visible`. Same placement effect as drain, but independent of status. |
| Reboot | Only `active`, `draining` or `failed` with an `instanceId`. `RebootInstancesCommand`. Status does not change; the agent resumes after boot and resyncs all peers (its version starts at 0). |
| Terminate | Any status except `terminating` and `terminated`. Set `status = terminating`, delete all its sessions. If `instanceId` is null, set `status = terminated`, `terminatedAt = now` and stop. Else `TerminateInstancesCommand`; error `InvalidInstanceID.NotFound` counts as success. Job J2 sets `terminated` once AWS reports the instance terminated or gone. |

After `terminating`, the agent's token stops working (7.5), so the agent goes quiet before the instance disappears.

### 12.8 AWS error mapping

In SDK v3 the AWS error code is `err.name`.

| AWS error name | AppError code |
| --- | --- |
| `InvalidClientTokenId`, `SignatureDoesNotMatch`, `AuthFailure` | `AWS_KEYS_INVALID` |
| `UnauthorizedOperation`, `AccessDenied`, `AccessDeniedException` | `AWS_PERMISSION_MISSING` (put the failed action in `details`) |
| `InstanceLimitExceeded`, `VcpuLimitExceeded` | `AWS_LIMIT_REACHED` |
| `InsufficientInstanceCapacity` | `AWS_NO_CAPACITY` |
| `OptInRequired` | `AWS_REGION_NOT_ENABLED` |
| `Unsupported` | `AWS_UNSUPPORTED` |
| anything else | `AWS_ERROR` (message = the AWS message) |

## 13. Admin API (used by the admin panel)

The admin panel uses 35 endpoints under `/api/admin`, one group per screen. All use the `veil_admin` session cookie, and every write also needs the header `X-Requested-With: veil-admin` (7.5).

### 13.1 Sign-in and sessions

**POST /api/admin/auth/login** — no session. Limiter: `adminLoginLimiter`. Body `{ "email", "password", "totpCode"? }`.

1. Lowercase the email and find the `Admin`. Not found: still run `bcrypt.compare(password, DUMMY_HASH)` (a fixed bcrypt hash, so timing is the same), then `401 LOGIN_FAILED`.
2. `lockedUntil > now`: `423 ACCOUNT_LOCKED` with `details: { lockedUntil }`.
3. Wrong password: `failedLogins + 1`. If it reaches 5, set `lockedUntil = now + 15 minutes` and `failedLogins = 0`. Respond `401 LOGIN_FAILED`.
4. If `totpEnabled`: no `totpCode` → `401 TOTP_REQUIRED` (no failure counted, the panel then shows the code field). Wrong code → count a failure as in step 3 → `401 TOTP_INVALID`.
5. Success: `failedLogins = 0`. `token = randomToken()`. Create `AdminSession` with `expiresAt = now + 12 hours`. Set cookie `veil_admin = token` with `httpOnly: true`, `secure: COOKIE_SECURE`, `sameSite: 'strict'`, `path: '/api/admin'`, `maxAge: 12 hours`.
6. Respond `200 { "admin": { "id", "email", "totpEnabled" } }`. Write audit `auth.login`.

**POST /api/admin/auth/logout** — delete the current session, clear the cookie, `200 {"ok":true}`.

**GET /api/admin/auth/me** — `200 { "id", "email", "totpEnabled", "passwordChangedAt" }`.

### 13.2 Two-factor authentication and password

otplib: use `authenticator` with `authenticator.options = { window: 1 }` (accepts the previous, current and next 30-second code).

| Endpoint | Body | Rules | Response |
| --- | --- | --- | --- |
| `POST /api/admin/auth/totp/setup` | `{}` | Already enabled: `409 TOTP_ALREADY_ENABLED`. Else `secret = authenticator.generateSecret()`, store `encrypt(secret)` in `totpSecretEnc` (still disabled) | `{ "otpauthUrl": authenticator.keyuri(email, 'Veil Admin', secret), "secret" }` |
| `POST /api/admin/auth/totp/enable` | `{ "code" }` | Verify against the stored secret. Wrong: `400 TOTP_CODE_WRONG`. Right: `totpEnabled = true` | `{ "ok": true }` |
| `POST /api/admin/auth/totp/disable` | `{ "password", "code" }` | Both must be right, else `400 TOTP_CODE_WRONG` or `401 LOGIN_FAILED`. Set `totpEnabled = false`, `totpSecretEnc = null` | `{ "ok": true }` |
| `POST /api/admin/auth/password` | `{ "currentPassword", "newPassword" }` | `newPassword` at least 12 characters. Current wrong: `401 LOGIN_FAILED`. Save bcrypt hash (cost 12), `passwordChangedAt = now`, delete all other sessions of this admin | `{ "ok": true }` |

The panel shows `otpauthUrl` as a QR code so the admin can scan it with an authenticator app.

### 13.3 AWS accounts

Access key ID: `/^AKIA[0-9A-Z]{16}$/` (long-term IAM user keys only). Secret: exactly 40 characters.

| Endpoint | Body | Response |
| --- | --- | --- |
| `GET /api/admin/aws-accounts` | — | `{ "items": [Account] }` (not paginated) |
| `POST /api/admin/aws-accounts/test` | `{ accessKeyId, secretAccessKey }` | the `testKeys` result (12.3). Nothing is saved |
| `POST /api/admin/aws-accounts` | `{ nickname (1–40 chars), accessKeyId, secretAccessKey, freeTierPlan? }` | `201` Account (12.4 Add) |
| `PUT /api/admin/aws-accounts/:id/keys` | `{ accessKeyId, secretAccessKey }` | Account (12.4 Update keys) |
| `POST /api/admin/aws-accounts/:id/test` | `{}` | `testKeys` with the stored keys; on success also sets `status = working` unless it is `disabled`, and `lastCheckedAt = now` |
| `PATCH /api/admin/aws-accounts/:id` | `{ nickname?, status?: "working" \| "disabled", freeTierPlan? }` | Account. Setting `working` on a `keys_rejected` account is refused with `400 AWS_KEYS_INVALID`: update the keys instead |
| `DELETE /api/admin/aws-accounts/:id` | — | `{ "ok": true }` (12.4 Remove) |
| `GET /api/admin/aws-accounts/:id/regions` | — | `{ "items": [{ code, displayName }] }`: regions enabled in that account (`DescribeRegions`) that exist in `Region` |
| `GET /api/admin/aws-accounts/:id/regions/:code/instance-types` | — | `{ "items": ["t3.micro", "t2.micro"] }`: free-tier x86\_64 types there |

`Account` object:

```json
{
  "id": "uuid", "nickname": "Main", "awsAccountNumber": "123456789012", "accessKeyHint": "AKIA…7Q2F",
  "status": "working", "freeTierPlan": "legacy_12_month", "lastCheckedAt": "…", "lastError": null,
  "createdAt": "…", "serverCount": 3,
  "usage": { "month": "2026-10", "computeHours": 466.2, "computeLimitHours": 750, "dataOutGb": 82.4, "dataOutLimitGb": 100 }
}
```

`serverCount` counts servers whose status is not `terminated`. `usage` comes from 13.10.

### 13.4 Servers

**GET /api/admin/servers** — query `status?` (one `ServerStatus`), `accountId?`, `regionCode?`, `limit`, `cursor`. Without `status`, `terminated` servers are excluded. Sorted by `launchedAt` desc, then `id` desc (7.8).

Response: the 7.8 list shape plus `counts: { "all", "provisioning", "active", "draining", "failed" }` (ignoring the `status` filter, so the tabs always show totals). Each item:

```json
{
  "id": "uuid", "regionCode": "eu-central-1", "regionName": "Frankfurt, Germany",
  "accountId": "uuid", "accountNickname": "Main", "instanceId": "i-07c2…", "instanceType": "t3.micro",
  "publicIp": "3.121.48.207", "status": "active", "failReason": null, "failDetail": null, "visible": true,
  "sessionCount": 58, "cpuPct": 22.0, "memPct": 41.5, "lastReportAt": "…", "launchedAt": "…",
  "activeAt": "…", "uptimeSeconds": 533000, "agentVersion": "1.0.0"
}
```

`uptimeSeconds` is `now − activeAt` for `active` and `draining` servers, otherwise `null`.

| Endpoint | Body | Rules |
| --- | --- | --- |
| `POST /api/admin/servers` | `{ awsAccountId, regionCode, instanceType? }` | 12.6. Responds `201` with the server item |
| `POST /api/admin/servers/:id/drain` | `{}` | 12.7 |
| `POST /api/admin/servers/:id/undrain` | `{}` | 12.7 |
| `POST /api/admin/servers/:id/reboot` | `{}` | 12.7 |
| `POST /api/admin/servers/:id/terminate` | `{}` | 12.7 |
| `PATCH /api/admin/servers/:id` | `{ visible: boolean }` | 12.7 |

An action from a status it does not allow returns `409 SERVER_STATE`. Each returns the updated server item.

### 13.5 Regions

**GET /api/admin/regions** — `{ "items": [{ "code", "displayName", "countryCode", "visible", "sortOrder", "activeServers", "visibleToUsers" }] }`, sorted by `sortOrder`. `activeServers` counts eligible servers (9.1 rule 1). `visibleToUsers = visible && activeServers > 0`.

**PUT /api/admin/regions** — body `{ "items": [{ "code", "displayName" (1–60 chars), "visible" }] }`. Every code must exist, else `400 VALIDATION_FAILED`. Updates all items in one transaction and returns the same shape as GET.

### 13.6 Devices

**GET /api/admin/devices** — query `status?` = `all` (default), `connected`, `offline` or `blocked`; `q?`; `limit`; `cursor`. Sorted by `firstSeenAt` desc, then `id` desc.

- `q` must be a full device UUID; it returns that device or an empty list. Any other non-empty `q`: `400 VALIDATION_FAILED`.
- `connected` = has a `Session`. `blocked` = abuse key blocked. `offline` = neither.
- Response: the 7.8 list shape plus `counts: { "all", "connected", "offline", "blocked" }`.

Item:

```json
{
  "id": "uuid", "status": "connected", "balanceSeconds": 2520, "adsToday": 3, "appVersion": "1.0.0",
  "firstSeenAt": "…", "lastSeenAt": "…",
  "session": { "regionCode": "eu-central-1", "protocol": "udp", "serverId": "uuid", "instanceId": "i-07c2…", "startedAt": "…" }
}
```

**GET /api/admin/devices/:id** — the item plus `installCount`, `blockedReason`, `blockedAt` from its abuse key.

| Endpoint | Body | Rules |
| --- | --- | --- |
| `POST /api/admin/devices/:id/adjust` | `{ deltaMinutes }`: integer, −100000 to 100000, not 0 | `newBalance = max(0, balance + deltaMinutes × 60)`. Create `WalletEntry` `admin_adjust` with the seconds actually applied and `refId = admin id` |
| `POST /api/admin/devices/:id/disconnect` | `{}` | `endSession(id, 'admin')` |
| `POST /api/admin/devices/:id/block` | `{ reason: "reward_farming" \| "abuse_report" \| "other", note?: string up to 200 }` | Set the abuse key `blocked = true`, `blockedReason = reason` (plus `: note` if given), `blockedAt = now`. End the sessions of every device sharing that abuse key (`endSession(…, 'blocked')`). Set their `pending` intents to `rejected` with reason `blocked` |
| `POST /api/admin/devices/:id/unblock` | `{}` | Set `blocked = false`, `blockedReason = null`, `blockedAt = null` |

Each returns the device detail object.

### 13.7 Rewards summary

**GET /api/admin/rewards/summary?days=14** (`days` 1 to 35, default 14). "Today" starts at 00:00 UTC.

```json
{
  "today": { "adsCredited": 1342, "minutesGranted": 40260, "devicesWatched": 388, "rejected": 57 },
  "daily": [ { "day": "2026-09-28", "credited": 612 } ],
  "rejects": { "duplicate": 41, "bad_signature": 9, "daily_limit": 7, "other": 0 },
  "topDevices": [ { "deviceId": "uuid", "adsToday": 10, "installCount": 4 } ]
}
```

- `adsCredited`, `minutesGranted` (sum of `secondsCredited` ÷ 60) and `devicesWatched` (distinct `deviceId`) come from today's `AdReward` rows with `outcome = credited`.
- `rejected` = today's `AdReward` rows with `outcome = rejected` + today's `RejectCounter` counts.
- `daily` has one entry per day for the last `days` days, oldest first, including days with 0.
- `rejects.duplicate` and `rejects.bad_signature` come from `RejectCounter`; `daily_limit` from rejected `AdReward` rows with that reason; `other` = all other rejected rows.
- `topDevices`: devices with `adsDay = today`, ordered by `adsToday` desc, at most 10, with their abuse key's `installCount`.

### 13.8 Settings

**GET /api/admin/settings** — the `Settings` row without `id`.

**PUT /api/admin/settings** — body with all of: `minutesPerAd` (1–240), `starterMinutes` (0–1440), `maxAdsPerDay` (1–100), `lowMinutesWarning` (1–120), `defaultProtocol` (`auto` `udp` `tcp`), `supportEmail` (email or `null`). Returns the saved settings.

### 13.9 Dashboard

**GET /api/admin/dashboard**:

```json
{
  "alerts": [ { "id": "server:uuid", "severity": "error", "title": "Server never registered", "text": "…", "targetType": "server", "targetId": "uuid" } ],
  "kpis": { "activeServers": 6, "activeRegions": 5, "onlineNow": 214, "newDevicesToday": 87, "adsToday": 1342, "minutesGrantedToday": 40260 },
  "usage": [ { "accountId": "uuid", "nickname": "Main", "computeHours": 466.2, "computeLimitHours": 750, "dataOutGb": 82.4, "dataOutLimitGb": 100 } ],
  "regions": [ { "code": "eu-central-1", "displayName": "Frankfurt, Germany", "servers": 2, "online": 96 } ]
}
```

Alerts are computed on each request, never stored:

| Source | Severity | id | Title |
| --- | --- | --- | --- |
| Server with `status = failed` | error | `server:<id>` | by `failReason`: "Server launch failed", "Server never registered", "Server stopped reporting", "Server instance is gone" |
| Account with `status = keys_rejected` | error | `account-keys:<id>` | "AWS keys rejected" |
| Account usage at 80% or more of a non-null limit | warning | `account-usage:<id>` | "Free compute limit at N%" or "Free data limit at N%" |

`activeServers` = servers with `status = active`. `activeRegions` = distinct regions among them. `onlineNow` = sessions with `lastHandshakeAt` in the last 180 seconds. `regions` lists every region with at least one non-terminated server, with `online` counted the same way.

### 13.10 Free-tier usage (shared helper)

For an account and the current UTC month:

- `computeHours` = for each of its servers, the hours between `max(launchedAt, monthStart)` and `min(terminatedAt ?? now, now)` when positive; summed and rounded to one decimal.
- `dataOutGb` = `AccountUsage.txBytes` for the month ÷ 1,000,000,000, rounded to one decimal (decimal GB slightly over-counts, which is the safe direction).
- Limits by `freeTierPlan`: `legacy_12_month` → 750 h and 100 GB; `free_plan_credits` → `null` hours (credits, check the AWS Billing console) and 100 GB; `paid` → both `null`.

### 13.11 Audit

Every admin write (POST, PUT, PATCH, DELETE) creates one `AdminAudit` row: `action` such as `server.terminate`, `account.create`, `device.block`, `settings.update`; `targetType`; `targetId`; and `detail` with the request body minus `password`, `currentPassword`, `newPassword`, `code`, `totpCode`, `accessKeyId` and `secretAccessKey`. There is no audit screen in the MVP; the rows are for investigating problems.

## 14. Background jobs

Eight jobs run inside the API process on timers; there is no separate worker. They keep server states honest, end dead sessions and delete old data.

### 14.1 jobs/scheduler.ts

- `startScheduler()` registers each job with `setInterval`. The first run of each job is 30 seconds after start.
- Each job has a `running` flag. If the previous run is still going, the tick is skipped.
- Each run is wrapped in `try/catch`. Errors are logged at `error` level with the job name; the scheduler keeps going.
- After each run, log one `info` line: `job <id> done` plus the job's counts (shown below). This is what the phase 10 check looks for.
- `stopScheduler()` clears all intervals (called on shutdown, 5.4).

### 14.2 The jobs

| Job | Every | What it does | Log counts |
| --- | --- | --- | --- |
| J1 provision timeout | 1 min | Servers in `provisioning` with `launchedAt` older than 10 minutes → `status = failed`, `failReason = never_registered`, `failDetail = "No registration within 10 minutes"`. Then servers `failed` with `never_registered` and `launchedAt` older than 60 minutes → terminate them (12.7) so they stop using free hours. | `timedOut`, `terminated` |
| J2 reconcile instances | 5 min | For every account with `status` `working` or `disabled`, group its non-terminated servers that have an `instanceId` by region. Per region call `DescribeInstancesCommand({ Filters: [{ Name: 'instance-id', Values: [ids] }] })` (filters return only existing instances and never fail on missing ones; send at most 200 IDs per call). For each server: instance missing or in state `terminated` or `shutting-down` → if the server is `terminating`, set `terminated` and `terminatedAt = now`; otherwise set `failed` with `instance_lost` and delete its sessions. State `stopped` or `stopping` → `failed`, `instance_lost`, `failDetail = "Instance is stopped"`, delete its sessions. State `running` and `PublicIpAddress` differs from `publicIp` → update `publicIp`. AWS key errors apply the 12.4 rule. | `checked`, `changed` |
| J3 agent silence | 1 min | Servers in `active` or `draining` with `lastReportAt` older than 5 minutes → `failed`, `agent_silent`, delete their sessions. A later report turns them back to `active` (11.6). | `silenced` |
| J4 stale sessions | 2 min | Sessions where `lastHandshakeAt` (or `startedAt` when it is null) is older than 10 minutes → `endSession(deviceId, 'stale')`. | `ended` |
| J5 expire intents | 5 min | `RewardIntent` with `status = pending` and `expiresAt < now` → `status = expired`. | `expired` |
| J6 prune rewards | 1 hour | Delete `AdReward` and `RejectCounter` rows older than 35 days, `RewardIntent` rows older than 2 days that are not `pending`, and `WalletEntry` rows older than 90 days. | `deleted` |
| J7 prune admin | 1 hour | Delete `AdminSession` rows with `expiresAt < now`, and `AdminAudit` rows older than 180 days. | `deleted` |
| J8 month rollover | 1 hour | Delete `AccountUsage` rows for months more than 3 months old, and `Server` rows with `status = terminated` and `terminatedAt` more than 60 days ago. | `deleted` |

"Older than N days" for `RejectCounter` compares its `day` string with today minus N days, formatted `YYYY-MM-DD`.

### 14.3 Why these numbers

- 10 minutes for J1: a normal boot registers in 2 to 4 minutes; `apt-get` on a slow mirror can take 6.
- 5 minutes for J3: the agent reports every 60 seconds, so 5 missed reports means it is really gone.
- 10 minutes for J4: an active tunnel renews its handshake about every 2 minutes, so 10 minutes without one means the phone is gone without disconnecting.

## 15. Deployment

The control server is one t3.micro in your Control AWS account running three Docker containers (Caddy, API, PostgreSQL) behind a free DuckDNS name with a free Let's Encrypt certificate. It is the only server you set up by hand.

### 15.1 Launch the control server (AWS console, Control account)

1. Pick one region close to most of your users, for example `eu-central-1`, and use it for the control server permanently.
2. EC2 → Launch instance. Name `veil-control`. Image: Ubuntu Server 24.04 LTS, 64-bit (x86). Type: `t3.micro` (or `t2.micro` if that is the one marked "Free tier eligible").
3. Key pair: create a new ED25519 key pair named `veil-control` and keep the `.pem` file safe. This is for you to SSH into the control server; edge servers never get a key.
4. Network: create a security group `veil-control` with three inbound rules: SSH 22 from "My IP" only, HTTP 80 from anywhere (needed for Let's Encrypt), HTTPS 443 from anywhere.
5. Storage: 20 GiB gp3 (the free tier includes 30 GiB per account).
6. Launch. Copy the public IPv4 address.
7. In DuckDNS, set your subdomain's IP to that address.

The public IP changes if the instance is stopped and started; the DuckDNS updater in 15.2 keeps the name correct.

### 15.2 Prepare the server (SSH in as `ubuntu`)

```bash
sudo apt-get update && sudo apt-get upgrade -y

# 1 GB swap so the API, Postgres and builds fit in 1 GB RAM
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# log out and SSH in again so the group change applies

# Read-only GitHub access for this server
ssh-keygen -t ed25519 -f ~/.ssh/veil_deploy -N ""
cat ~/.ssh/veil_deploy.pub   # add as a read-only Deploy key in the GitHub repo settings
printf 'Host github.com\n  IdentityFile ~/.ssh/veil_deploy\n' >> ~/.ssh/config
git clone git@github.com:[YOUR_GITHUB_USER]/veil.git ~/veil
```

**DuckDNS updater.** `deploy/duckdns.sh` in the repo contains placeholders only:

```bash
#!/bin/bash
curl -fsS "https://www.duckdns.org/update?domains=[SUBDOMAIN]&token=[DUCKDNS_TOKEN]&ip=" -o /tmp/duckdns.log
```

On the server, copy it to `/opt/veil-duckdns/duckdns.sh`, put your real subdomain and token in the copy (never in the repo), `chmod 700` it, and add this line with `crontab -e`:

```
*/5 * * * * /opt/veil-duckdns/duckdns.sh
```

### 15.3 Files

**backend/Dockerfile** (build context is the repository root):

```dockerfile
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY edge/ ./edge/
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
```

**.dockerignore** (repository root), so local `node_modules` and secrets never enter the image:

```
**/node_modules
**/dist
**/.env
.git
backups
```

**deploy/docker-compose.prod.yml:**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: veil
      POSTGRES_USER: veil
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    command: ["postgres", "-c", "shared_buffers=64MB", "-c", "max_connections=30"]
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U veil -d veil"]
      interval: 10s
      timeout: 5s
      retries: 10

  api:
    build:
      context: ..
      dockerfile: backend/Dockerfile
    restart: unless-stopped
    env_file: ../backend/.env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://veil:${POSTGRES_PASSWORD}@postgres:5432/veil?schema=public
      EDGE_FILES_DIR: /app/edge
    depends_on:
      postgres:
        condition: service_healthy
    mem_limit: 400m
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  caddy:
    image: caddy:2.8-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN: ${DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ../admin-panel/dist:/srv/admin:ro
      - caddy_data:/data
      - caddy_config:/config

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

**deploy/Caddyfile:**

```
{$DOMAIN} {
	encode gzip

	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}

	handle /api/* {
		reverse_proxy api:3000
	}

	redir /admin /admin/ 308

	handle_path /admin/* {
		root * /srv/admin
		try_files {path} /index.html
		file_server
	}

	handle {
		respond "Not found" 404
	}
}
```

Do not add a `log` directive. Caddy writes no access log unless told to, and access logs would contain client IP addresses.

### 15.4 First deploy and updates

```bash
cd ~/veil
cp backend/.env.example backend/.env
nano backend/.env    # fill every value (section 18.1); PUBLIC_BASE_URL=https://[YOURNAME].duckdns.org

cat > deploy/.env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DOMAIN=[YOURNAME].duckdns.org
EOF
chmod 600 backend/.env deploy/.env

cd deploy
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma db seed
curl https://[YOURNAME].duckdns.org/api/health
```

After your first admin sign-in, change the password (13.2), turn on 2FA, then delete `ADMIN_INITIAL_PASSWORD` from `backend/.env` and run `up -d` again.

To deploy a new version: `cd ~/veil && git pull && cd deploy && docker compose -f docker-compose.prod.yml up -d --build`. Migrations run automatically when the API container starts.

### 15.5 Backups

**deploy/backup.sh:**

```bash
#!/bin/bash
set -euo pipefail
mkdir -p /home/ubuntu/backups
cd /home/ubuntu/veil/deploy
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U veil -d veil -Fc \
  > /home/ubuntu/backups/veil-$(date -u +%Y%m%d-%H%M).dump
find /home/ubuntu/backups -name 'veil-*.dump' -mtime +7 -delete
```

`chmod 700 deploy/backup.sh`, then add with `crontab -e`: `0 2 * * * /home/ubuntu/veil/deploy/backup.sh`. Once a week, copy the newest file to your own computer with `scp`, because a backup on the same server does not survive losing the server.

Restore: `docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U veil -d veil --clean --if-exists < /path/to/file.dump`.

### 15.6 Cost guardrails (every AWS account, day one)

1. Billing and Cost Management → Budgets → Create budget → use the **Zero spend budget** template with your email. You get an email the moment anything costs money.
2. Billing preferences → turn on **Free Tier usage alerts**.
3. Never attach an Elastic IP, never create a NAT Gateway, never stop an instance you mean to remove (stopped instances still pay for disk; terminate instead).
4. Each running instance uses one public IPv4 address, which AWS bills by the hour outside free allowances. In an account on the 12-month free tier, run at most one server around the clock and check the Free Tier page in Billing weekly.
5. Watch data transfer out: 100 GB per month per account is free, and a VPN is almost all data transfer. The dashboard (13.10) shows each account's month so far.

## 16. Testing

Three layers of checks: unit tests for the pure logic that is easy to get subtly wrong, a manual end-to-end script for each phase, and two checklists before launch.

### 16.1 Unit tests (vitest, files in backend/test/)

These functions must exist as pure, exported functions so they can be tested without a database:

- `computeDebit(lastDebitAt: Date, reportTime: Date, latestHandshake: number): { active: boolean, seconds: number }` in `metering.service.ts` (the 9.5 rules 2 and 3.1).
- `peersResponse(peersVersion: number, ifNoneMatch: string | undefined): 'not-modified' | 'send'` in `agent.service.ts` (11.6).
- `randomTunnelIp()` in `ipAllocator.ts` (9.2).
- `verifySsv(originalUrl: string, keys: Map<string, string>): { valid: boolean, message?: string }` in `ssvVerifier.ts` (10.4 steps 1 to 6), plus `setKeysForTest(map)` to inject keys.

| File | Cases that must pass |
| --- | --- |
| `crypto.test.ts` | encrypt then decrypt returns the input; changing one character of the blob makes decrypt throw; `hashToken` gives the same output twice and different outputs for different inputs |
| `errors.test.ts` | `statusFor` returns the 18.2 status for `AUTH_REQUIRED` (401), `BLOCKED` (403), `BALANCE_EMPTY` (402), `RATE_LIMITED` (429) |
| `ipAllocator.test.ts` | 10,000 calls never return `10.66.0.0`, `10.66.0.1` or `10.66.255.255`, and every result starts with `10.66.` |
| `metering.test.ts` | handshake `0` → inactive; handshake 100 s before report → active; 200 s before → inactive; 300 s since last debit → `seconds = 120`; 45 s → `seconds = 45` |
| `agentPeers.test.ts` | header `"7"` with version 7 → `not-modified`; header `"6"` with version 7 → `send`; missing header → `send` |
| `ssv.test.ts` | see below |

`ssv.test.ts`: generate a key pair with `crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })`. Build a query string in AdMob's order ending with `&signature=…&key_id=1`, where the signature is `crypto.sign('sha256', Buffer.from(message), { key: privateKey, dsaEncoding: 'der' }).toString('base64url')`. Cases: valid → `true`; change `reward_amount` after signing → `false`; no `signature` parameter → `false`; `key_id=2` (not in the map) → `false`; a `custom_data` value containing `%2B` and `%3D` → still `true` (proves the raw string is verified, not a re-encoded one).

### 16.2 End-to-end script

Set `BASE=http://localhost:3000/api` for local tests or `BASE=https://[YOURNAME].duckdns.org/api` after phase 5.

**Step A — device register and balance (phase 3):**

```bash
AK=$(printf 'test-android-id:veil-abuse-v1' | sha256sum | cut -d' ' -f1)
curl -s -X POST $BASE/v1/devices/register -H 'Content-Type: application/json' \
  -d "{\"abuseKey\":\"$AK\",\"platform\":\"android\",\"appVersion\":\"1.0.0\"}"
# copy deviceToken from the output
TOKEN=<deviceToken>
curl -s $BASE/v1/me -H "Authorization: Bearer $TOKEN"     # balanceSeconds: 3600
```

Run the register call a second time with the same `AK`: the new device must show `balanceSeconds: 0` (8.2 rule 6).

**Step B — UDP tunnel with the official WireGuard app (phase 7):**

1. In the WireGuard app tap + → Create from scratch → generate a key pair. Copy the public key.
2. `curl -s -X POST $BASE/v1/connect -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"regionCode":"eu-central-1","protocol":"udp","publicKey":"<public key>"}'`
3. In the app: Addresses = `wireguard.address`, DNS servers = `1.1.1.1, 1.0.0.1`, MTU = `1420`. Add peer: public key = `wireguard.peer.publicKey`, endpoint = `wireguard.peer.endpoint`, allowed IPs = `0.0.0.0/0, ::/0`, persistent keepalive = `25`.
4. Turn the tunnel on. Open `https://1.1.1.1/cdn-cgi/trace` in the phone browser. The `ip=` line must show the server's public IP.
5. After 3 minutes, `GET /v1/me` must show a balance 120 to 240 seconds lower.

**Step C — TCP mode (phase 7).** Needs a Linux or macOS machine with `wireguard-tools`; if you have neither, run it on the control server.

```bash
wg genkey | tee test.key | wg pubkey > test.pub
curl -s -X POST $BASE/v1/connect -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"regionCode\":\"eu-central-1\",\"protocol\":\"tcp\",\"publicKey\":\"$(cat test.pub)\"}"
python3 edge/tools/tcp_client_test.py --host <tcp.host> --cert-sha256 <tcp.certSha256> &
sudo tee /etc/wireguard/veiltest.conf <<EOF
[Interface]
PrivateKey = $(cat test.key)
Address = <wireguard.address>
MTU = 1280

[Peer]
PublicKey = <wireguard.peer.publicKey>
Endpoint = 127.0.0.1:51821
AllowedIPs = 1.1.1.1/32
PersistentKeepalive = 25
EOF
sudo wg-quick up veiltest
curl -s https://1.1.1.1/cdn-cgi/trace | grep ip=     # must show the server's IP
sudo wg-quick down veiltest
```

`AllowedIPs` is limited to `1.1.1.1/32` on purpose, so the test client's own TLS connection is not routed into the tunnel it carries.

### 16.3 Security checklist (phase 11)

- [ ] The `veil-edge` security group in every edge account has exactly two inbound rules: UDP 51820 and TCP 443.
- [ ] `nc -vz -w 5 <edge ip> 22` times out.
- [ ] With the tunnel on, `curl -m 5 http://169.254.169.254/latest/meta-data/` from the phone or test machine fails.
- [ ] With the tunnel on, a DNS leak test site shows only Cloudflare resolvers, and `https://1.1.1.1/cdn-cgi/trace` shows the server's IP.
- [ ] With Android Always-on VPN and "Block connections without VPN" on, terminating the server leaves the phone with no internet.
- [ ] The 11th register call within an hour from one IP returns `429 RATE_LIMITED`.
- [ ] Five wrong admin passwords lock sign-in for 15 minutes; 2FA is enabled on the admin account.
- [ ] Browser dev tools show the `veil_admin` cookie as HttpOnly, Secure, SameSite=Strict.
- [ ] An admin POST without `X-Requested-With: veil-admin` returns `403 CSRF_FAILED`.
- [ ] `docker compose -f docker-compose.prod.yml logs api` contains no device IDs, no client IPs, no tokens and no query strings.
- [ ] `git ls-files | grep env` lists only `backend/.env.example`.
- [ ] Testing root access keys in the admin panel is refused with `AWS_ROOT_KEYS`.
- [ ] A zero-spend budget exists in every AWS account.
- [ ] One backup has been restored into a scratch database successfully.

### 16.4 Load check (phase 11, local)

Install k6 (free). Create `backend/test/load/makeTokens.ts`, which uses Prisma to create 50 devices directly (abuse keys `loadtest-1` to `loadtest-50`, 3600 seconds each) and writes their 50 plain tokens as a JSON array to `backend/test/load/tokens.json`. Run it against your local database only, then:

```js
// backend/test/load/me.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const tokens = JSON.parse(open('./tokens.json'));
export const options = {
  vus: 50,
  duration: '2m',
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300'] },
};

export default function () {
  const h = { headers: { Authorization: `Bearer ${tokens[(__VU - 1) % tokens.length]}` } };
  check(http.get(`${__ENV.BASE}/api/v1/me`, h), { 'me 200': (r) => r.status === 200 });
  check(http.get(`${__ENV.BASE}/api/v1/regions`, h), { 'regions 200': (r) => r.status === 200 });
  sleep(1);
}
```

`k6 run -e BASE=http://localhost:3000 backend/test/load/me.js`. Afterwards delete the 50 devices and their abuse keys. Never commit `tokens.json`.

### 16.5 Launch checklist (phase 12)

- [ ] Your phone is removed from AdMob test devices, and the app uses the real rewarded ad unit ID.
- [ ] At least two regions have an active, visible server.
- [ ] A privacy policy is published. It states that no browsing or connection history is kept, that an app-scoped device identifier is used only for fraud prevention (8.2), and that AdMob shows ads.
- [ ] The Google Play Data safety form declares the device identifier (fraud prevention) and advertising, and the VPN declaration in Play Console is completed.
- [ ] Zero-spend budgets and Free Tier alerts are on in every account.
- [ ] The backup cron has produced at least two files.
- [ ] A fresh install on a second phone completes: register, connect UDP, connect TCP, watch an ad, run out of minutes.

## 17. Troubleshooting

Most failures in this system are a missing network rule, a wrong secret or a server that never finished booting, not application logic. Check in this order: is it running, can it reach what it needs, are its keys current, is the data really in the database.

| Symptom | Check | Fix |
| --- | --- | --- |
| API exits at start listing a variable name | `backend/.env` | Fill that variable as 7.1 and 18.1 describe |
| `prisma migrate` cannot reach the database | `docker compose -f deploy/docker-compose.dev.yml ps` | Start Postgres; make sure nothing else uses port 5432 |
| HTTPS does not work after deploy | `docker compose -f docker-compose.prod.yml logs caddy` | DuckDNS must point at the server's current IP; inbound 80 and 443 must be open in `veil-control` |
| Server stays `provisioning` | EC2 console → instance → Actions → Monitor and troubleshoot → Get system log; look for `veil-bootstrap` errors | `sha256sum: FAILED` → the edge files changed after the API started: restart the API, then terminate and recreate the server. `curl` errors → the API is not reachable over HTTPS from the internet |
| Agent register returns 401 | Server row in Prisma Studio | The bootstrap token was used or the instance ID differs. Terminate and create a new server |
| Server turns `failed` with `agent_silent` | Admin panel server detail | Reboot it from the panel; if it fails again, terminate and recreate |
| WireGuard handshake never completes (UDP) | The server's `peers_version` and `applied_version` columns are equal; the `veil-edge` group allows UDP 51820; the phone's clock is automatic | Wrong keys: connect again with a new key pair. Versions differ for more than a minute: the agent is stuck, reboot the server |
| Connected, but no websites load | Bootstrap log shows `fw.sh up` ran; the server reports `netTxBytes` growing | If some sites hang but small ones load, MTU is too high for that network: use TCP mode (MTU 1280) |
| TCP mode refuses to connect | `tcp.certSha256` in the connect response matches the server | A recreated server has a new certificate; reconnect to get the new hash |
| AdMob callbacks never arrive | The SSV URL is saved on the ad unit; `https://…/api/admob/ssv` answers from the internet; your phone is a registered test device | Do not use Google's sample ad unit IDs (10.6 step 3) |
| Callbacks arrive but nothing is credited | `ad_rewards.reject_reason` and `reject_counters` | `bad_signature`: something rewrote the URL, or the key cache cannot reach `ADMOB_KEYS_URL`. `wrong_ad_unit`: `ADMOB_AD_UNIT_ID` does not match the app. `bad_intent`: the app did not pass `customData` = nonce |
| Creating a server fails with `AWS_PERMISSION_MISSING` | `details` names the action | Re-paste the 12.1 policy exactly |
| Creating a server fails with `AWS_KEYS_INVALID` | IAM → Users → `veil-orchestrator` → Security credentials | Key deleted or deactivated: create a new key and use "Update keys" |
| Creating a server fails with `AWS_LIMIT_REACHED` or `AWS_NO_CAPACITY` | — | Try another region, or wait and retry |
| Control server becomes very slow | `free -m`, `docker stats` | Make sure the swap file exists (15.2) and `mem_limit` is set |
| `429 RATE_LIMITED` while testing | Which limiter (7.7) | Wait for the window, or restart the API (limits are in memory) |

## 18. Reference

The three lookup tables every step depends on: environment variables, error codes, and the full endpoint list.

### 18.1 backend/.env.example

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://veil:veil_dev_password@localhost:5432/veil?schema=public
PUBLIC_BASE_URL=http://localhost:3000
MASTER_KEY=
TOKEN_PEPPER=
ABUSE_PEPPER=
ADMOB_AD_UNIT_ID=ca-app-pub-0000000000000000/0000000000
ADMOB_KEYS_URL=https://www.gstatic.com/admob/reward/verifier-keys.json
EDGE_FILES_DIR=../edge
COOKIE_SECURE=false
JOBS_ENABLED=true
LOG_LEVEL=info
ADMIN_EMAIL=
ADMIN_INITIAL_PASSWORD=
```

In production: `NODE_ENV=production`, `PUBLIC_BASE_URL=https://[YOURNAME].duckdns.org`, `COOKIE_SECURE=true`, your real ad unit ID, and new random values for the three secrets. `DATABASE_URL` and `EDGE_FILES_DIR` are overridden by the compose file. Edge servers cannot reach a `localhost` API, so phases 6 and later are tested against production.

### 18.2 Error codes

Every error response is `{"error":{"code":"…","message":"…","details":…}}` with this status.

| Code | Status | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Body, query or path parameter failed its zod schema |
| `INVALID_PUBLIC_KEY` | 400 | Not a 32-byte base64 WireGuard key |
| `INSTANCE_TYPE_NOT_FREE` | 400 | Requested type is not free-tier in that region |
| `TOTP_CODE_WRONG` | 400 | Wrong code while setting up or disabling 2FA |
| `AWS_KEYS_INVALID` | 400 | AWS rejected the access keys |
| `AWS_PERMISSION_MISSING` | 400 | The IAM policy lacks an action |
| `AWS_ROOT_KEYS` | 400 | Root-user keys were supplied |
| `AWS_REGION_NOT_ENABLED` | 400 | Region is not enabled in that AWS account |
| `AWS_UNSUPPORTED` | 400 | AWS does not support the request there |
| `AUTH_REQUIRED` | 401 | No or expired credentials |
| `AUTH_INVALID` | 401 | Credentials not recognised |
| `LOGIN_FAILED` | 401 | Wrong email or password |
| `TOTP_REQUIRED` | 401 | 2FA is on; send `totpCode` |
| `TOTP_INVALID` | 401 | Wrong 2FA code at sign-in |
| `BALANCE_EMPTY` | 402 | No minutes left |
| `BLOCKED` | 403 | Device is blocked |
| `CSRF_FAILED` | 403 | Admin write without `X-Requested-With: veil-admin` |
| `SSV_BAD_SIGNATURE` | 403 | AdMob callback signature invalid |
| `NOT_FOUND` | 404 | No such route or record |
| `REGION_UNAVAILABLE` | 404 | Region missing or hidden |
| `PUBLIC_KEY_IN_USE` | 409 | Another session on that server uses the key |
| `SERVER_STATE` | 409 | Action not allowed in the server's current status |
| `AWS_ACCOUNT_EXISTS` | 409 | That AWS account is already added |
| `AWS_ACCOUNT_MISMATCH` | 409 | New keys belong to a different AWS account |
| `AWS_ACCOUNT_UNAVAILABLE` | 409 | Account is disabled or its keys are rejected |
| `ACCOUNT_HAS_SERVERS` | 409 | Terminate the account's servers first |
| `NO_FREE_TIER_TYPE` | 409 | No free-tier x86\_64 type in that region |
| `TOTP_ALREADY_ENABLED` | 409 | 2FA is already on |
| `DAILY_LIMIT_REACHED` | 409 | Device reached today's ad limit |
| `AWS_LIMIT_REACHED` | 409 | AWS instance or vCPU limit reached |
| `ACCOUNT_LOCKED` | 423 | Too many failed sign-ins; see `details.lockedUntil` |
| `RATE_LIMITED` | 429 | A limiter from 7.7 was hit |
| `INTERNAL` | 500 | Unexpected error (logged) |
| `AWS_ERROR` | 502 | Any other AWS failure |
| `NO_SERVER_AVAILABLE` | 503 | No eligible server with room in that region |
| `AWS_NO_CAPACITY` | 503 | AWS has no capacity for that type right now |

### 18.3 Endpoint index

| Method and path | Auth | Section |
| --- | --- | --- |
| `GET /api/health` | none | 5.5 |
| `POST /api/v1/devices/register` | none | 8.2 |
| `GET /api/v1/me` | Device | 8.3 |
| `GET /api/v1/config` | Device | 8.4 |
| `GET /api/v1/regions` | Device | 8.5 |
| `POST /api/v1/connect` | Device | 8.6, 9.3 |
| `POST /api/v1/disconnect` | Device | 8.7, 9.4 |
| `POST /api/v1/rewards/intents` | Device | 10.2 |
| `GET /api/v1/rewards/intents/:intentId` | Device | 10.3 |
| `GET /api/admob/ssv` | AdMob signature | 10.4 |
| `GET /api/agent/v1/files/:name` | none | 11.6 |
| `POST /api/agent/v1/register` | Bootstrap token | 11.6 |
| `GET /api/agent/v1/peers` | Agent | 11.6 |
| `POST /api/agent/v1/report` | Agent | 11.6 |
| `POST /api/admin/auth/login` | none | 13.1 |
| `POST /api/admin/auth/logout` | Admin | 13.1 |
| `GET /api/admin/auth/me` | Admin | 13.1 |
| `POST /api/admin/auth/totp/setup` | Admin | 13.2 |
| `POST /api/admin/auth/totp/enable` | Admin | 13.2 |
| `POST /api/admin/auth/totp/disable` | Admin | 13.2 |
| `POST /api/admin/auth/password` | Admin | 13.2 |
| `GET /api/admin/aws-accounts` | Admin | 13.3 |
| `POST /api/admin/aws-accounts/test` | Admin | 13.3 |
| `POST /api/admin/aws-accounts` | Admin | 13.3 |
| `PUT /api/admin/aws-accounts/:id/keys` | Admin | 13.3 |
| `POST /api/admin/aws-accounts/:id/test` | Admin | 13.3 |
| `PATCH /api/admin/aws-accounts/:id` | Admin | 13.3 |
| `DELETE /api/admin/aws-accounts/:id` | Admin | 13.3 |
| `GET /api/admin/aws-accounts/:id/regions` | Admin | 13.3 |
| `GET /api/admin/aws-accounts/:id/regions/:code/instance-types` | Admin | 13.3 |
| `GET /api/admin/servers` | Admin | 13.4 |
| `POST /api/admin/servers` | Admin | 13.4, 12.6 |
| `POST /api/admin/servers/:id/drain` | Admin | 13.4, 12.7 |
| `POST /api/admin/servers/:id/undrain` | Admin | 13.4, 12.7 |
| `POST /api/admin/servers/:id/reboot` | Admin | 13.4, 12.7 |
| `POST /api/admin/servers/:id/terminate` | Admin | 13.4, 12.7 |
| `PATCH /api/admin/servers/:id` | Admin | 13.4 |
| `GET /api/admin/regions` | Admin | 13.5 |
| `PUT /api/admin/regions` | Admin | 13.5 |
| `GET /api/admin/devices` | Admin | 13.6 |
| `GET /api/admin/devices/:id` | Admin | 13.6 |
| `POST /api/admin/devices/:id/adjust` | Admin | 13.6 |
| `POST /api/admin/devices/:id/disconnect` | Admin | 13.6 |
| `POST /api/admin/devices/:id/block` | Admin | 13.6 |
| `POST /api/admin/devices/:id/unblock` | Admin | 13.6 |
| `GET /api/admin/rewards/summary` | Admin | 13.7 |
| `GET /api/admin/settings` | Admin | 13.8 |
| `PUT /api/admin/settings` | Admin | 13.8 |
| `GET /api/admin/dashboard` | Admin | 13.9 |
