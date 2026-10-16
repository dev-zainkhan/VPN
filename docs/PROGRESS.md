# Progress

What is built, what is tested, and what comes next. Phase numbers follow
section 3 of `docs/backend/Veil VPN  Backend Build Specification (MVP).md`.
Newest changes at the top of the log.

## Status by phase

| Phase | What | Status | Tested how |
| --- | --- | --- | --- |
| 0 | Accounts and tools | Partly: repo and tools on dev laptop; AWS, domain, AdMob accounts still to create | — |
| 1 | Backend skeleton | Done | `npm run typecheck`, `/api/health` |
| 2 | Database (schema, migration, seed) | Done | Migration and seed on PostgreSQL 16; 17 regions, 1 settings, 1 admin; seed twice makes no duplicates |
| 3 | Device API (register, me, config, regions, reinstall protection) | Done | End-to-end calls against a live API |
| 4 | Admin auth, 2FA, AWS accounts | Done, tested with the real AWS account | Unit tests; live API: login, lockout after 5 tries, 2FA on/off, password change, logout, CSRF header, rate limit, AWS account edit/disable/delete, fake keys rejected by real AWS |
| 5 | Deploy control server | Deferred by decision (2026-10-15): everything is finished and tested locally first, then deployed once straight to production | — |
| 6 | Edge servers | Done, tested live on AWS | Edge files: `py_compile`; TCP gateway: local TLS round trip (1–1500 byte packets, wrong certificate refused, oversized frame closes); agent API: simulated agent; real EC2 in Mumbai: create → security group (UDP 51820, TCP 443, no SSH), IMDSv2, no SSH key, tags → terminate → J2 marks terminated |
| 7 | Connections and minutes | Done, tested live on AWS (laptop WireGuard; Android app still to build) | 36 unit tests; simulated agent + phones: connect UDP/TCP, key in use, minutes debited from handshakes, idle not charged, cut off at 0, disconnect, data-out counting |
| 8 | Rewards (AdMob SSV) | Code done; real AdMob callback waits for production | 8 SSV unit tests (real ECDSA signatures); live API with a stand-in key server: credit, replay, tampered signature, unknown key, wrong ad unit, stale, unknown device, other phone's nonce, daily limit, blocked phone, no IDs in the log (21 checks) |
| 9 | Remaining admin API | Done | Live API (42 checks with phase 10): regions list/rename/hide, devices list with cursor/total/counts, search by full ID, detail, adjust minutes (floor at 0, wallet), block (all installs of the phone, pending intents rejected), unblock, disconnect, settings, rewards summary, dashboard alerts/KPIs/usage/regions, audit rows |
| 10 | Remaining jobs | Done | Each job J1–J8 run directly against test data; API with jobs on logs `job J1 done` … `job J8 done` 30 s after start |
| 11 | Hardening | Not started | — |
| 12 | Launch | Not started | — |
| — | Admin panel UI | Connected to the real API | In the browser against the local API: sign-in (wrong password message, success, session kept on reload, sign-out), dashboard, AWS accounts, servers (create form lists regions and free types from AWS), regions, devices (+15 min applied), rewards, settings saved, mobile layout; production build |
| — | Android app | Real WireGuard VPN working on a phone; rewarded ads (AdMob) not yet | Built in GitHub Actions (release `android-test`); on an Infinix X6725 (Android 15): register (60 starter minutes), regions, VPN permission, connect over UDP to a real edge server in Mumbai, phone IP became the server's IP, minutes debited while connected |

## Decisions and open questions

- [ ] **One AWS account or several?** The spec uses one AWS account per edge
      server group to get several free tiers. AWS's Free Tier terms make you
      ineligible for the offers if you open extra accounts to receive more
      benefits. Recommended: one account. The code works with one or more.
- [x] **Free-tier plan of the AWS account:** AWS Free Plan with credits ($117.82 left on 2026-10-15; the plan ends 2027-02-17 or when credits run out). Account "Main" set to `free_plan_credits`. Before 2027-02-17: upgrade to a paid plan or the account (and every VPN server in it) stops.
- [ ] Own domain instead of DuckDNS for production (Play listing, privacy policy, `app-ads.txt`).
- [ ] Check that the name "Veil" and package `com.veil.vpn` are free on Google Play.

## Changes from the spec

| Change | Why |
| --- | --- |
| `npm run dev` loads `.env` (`tsx --env-file=.env`) | The spec has no way to load `.env` in development |
| `vitest.config.ts` sets dummy environment values | `core/config.ts` exits without them, so tests could not run |
| A body that is not valid JSON returns `400 VALIDATION_FAILED` | Otherwise it fell through to `500 INTERNAL` |
| Request log keeps the full route on errors (`/api/v1/me`, not `/me`) | Express resets the mount path when an error leaves a router |
| AWS SDK pinned to `3.1152.0` | Spec: pin the version npm installed |
| Renaming an AWS account to a nickname already in use returns `400 VALIDATION_FAILED` (`details.field = nickname`) | The spec gives no code for this |
| Free-tier instance types for a region first check that the region is enabled in the account (`AWS_REGION_NOT_ENABLED`) | A call into a region that is not enabled fails like bad keys and would wrongly mark the account `keys_rejected` |
| Login, logout and 2FA setup are also written to the audit log | Spec 13.11: every admin write is audited |
| Job J2 sends `TerminateInstances` again for a server stuck in `terminating` whose instance still runs | Otherwise a failed terminate call leaves the server running forever, because terminate is refused from `terminating` |
| The API serves edge files with Linux line endings even from a Windows checkout; `.gitattributes` keeps `*.sh`, `*.py`, `*.tpl` as LF | A CRLF `fw.sh` or boot script fails on Ubuntu |
| `metering.applyReport` updates idle sessions with one `updateMany` | Same result as one update per session, fewer queries per report |
| A rejected AdMob callback only marks the intent `rejected` when it was still `pending` | Otherwise a second callback could turn an already credited intent into `rejected` |
| The credit path claims the intent (`pending` → `credited`) before adding minutes | Two callbacks with different transaction IDs for one intent can never both credit |
| A signed callback without `transaction_id` is answered `ok` and ignored | `AdReward.transactionId` is required; Google always sends it |
| Admin devices tab `connected` / `offline` excludes blocked devices | The four tab counts then never overlap |
| `GET /api/admin/servers` also returns `total` | Spec 7.8: every list has `total` |
| Servers can be added by hand on any provider (`managed = false`, no AWS account): `POST /api/admin/servers/manual`, `POST /api/admin/servers/:id/install-command`, `GET /api/agent/v1/install/:id?token=` | AWS bandwidth is too expensive for a free VPN; cheap VPS providers include many TB |
| The boot script also installs `python3`, opens the VPN ports in `ufw` when it is on, and prints its progress | Needed on VPS images outside AWS; the person running the command sees what happens |
| Agent 1.1.0 registers without instance metadata (no instance ID; public IPv4 from the interface or an IP echo service) | Servers outside AWS |
| Rewards summary `rejects` counts today only | The spec does not say which period; it matches the `today` card |

## Log

### 2026-10-16
- VPN servers on any provider: admin panel → Create server → Any provider gives a one-time install command for any Ubuntu/Debian VPS (guide: `docs/ADD-SERVER.md`). The agent finds its public IP without AWS metadata. Tested on an Ubuntu 22.04 VM with metadata blocked: registered in under a minute, phone connected through it. Plus 10 API edge-case checks.
- Android app built in the cloud (GitHub Actions) and installed over USB; first real phone connection through a Veil edge server: IP changed to the Mumbai server, minutes debited.
- Fixed a start-up crash: `@expo/vector-icons` pulled `expo-font` 57 (needs a newer Expo core than SDK 54); pinned `expo-font` ~14.0.12.
- The test app's server address can now be changed on the "Can't reach Veil" screen (the laptop's Wi-Fi address changes).

### 2026-10-15
- Admin panel connected to the API: demo data removed (`src/data.ts` → `src/format.ts`), new `src/api.ts`, Vite proxies `/api` to the backend.
- Phases 6 and 7 code done: edge files (from spec 11.2–11.5), agent API (files, register, peers with ETag, report), EC2 provisioning (security group, Ubuntu image, launch, drain/undrain/hide/reboot/terminate), admin servers API, jobs J1–J4, connect/disconnect, tunnel IPs, server picker, metering.
- Tested: 36 unit tests; local simulation of an edge agent and two phones (31 checks); TCP gateway TLS round trip; one real t3.micro created in Mumbai through the API and terminated (cost about $0.01 of credits).
- Phases 9 and 10 done: admin devices, regions, settings, rewards summary, dashboard; jobs J5–J8. All 8 jobs log on schedule.
- Phase 8 done: reward intents, intent polling, AdMob SSV callback with key cache. 44 unit tests.
- Decision: no control server on AWS for now. Finish and test locally, then deploy straight to production.
- **Live AWS test (2026-10-15)** with the API still on the dev laptop: a temporary relay EC2 (SSH reverse tunnel, API port open only inside the VPC) let a real edge server reach it.
  - Edge server created through the admin API in Mumbai: booted, checked file hashes, registered and turned `active` in 65 s; reported every minute.
  - WireGuard for Windows on the laptop with the `connect` config: public IP changed to the server's IP. UDP about 25 Mbit/s, TCP-over-TLS 443 about 20 Mbit/s (home line 36 Mbit/s).
  - Minutes: device A charged only while the tunnel was up (3600 → 3240). Device B with 100 s balance: traffic stopped about 90 s after the tunnel came up, session ended, balance 0.
  - All 8 jobs ran; J2 marked terminated servers. Log had no device IDs, keys, tunnel IPs or home IP.
  - Everything terminated afterwards (2 edge + relay). Left in AWS on purpose: security groups `veil-edge` (needed) and `veil-test-relay` (the IAM user cannot delete security groups; free, delete in the EC2 console if wanted).
  - Lesson for the app: connections opened before the tunnel keep using the old route; check the IP with a new connection.
- **Waits for the production deploy:** a real server can only become `active` once the API is reachable from the internet (control server + domain). Then: phone test with the WireGuard app, 2-minute cutoff test, TCP test.
- Phase 4 done: admin sign-in with lockout and 2FA, password change, audit log, AWS accounts (add, test, update keys, disable, delete, regions, instance types), AWS error mapping. 14 unit tests pass.
- IAM user `veil-orchestrator` created in the real AWS account with `deploy/aws/create-veil-iam-user.sh` (CloudShell). Keys file kept only on the dev laptop (`veil-keys.json`, ignored by git).
- Live AWS test passed: key check, add account, duplicate refused, recheck, 17 enabled regions, free-tier types (`t3.micro`, `t3.small`, `t8i.micro`, `t8i.small`, `c7i-flex.large`, `m7i-flex.large`), key update. No keys in the API log.
- Moved `client side/android_mobile` to `android-app/` and `server side/admin-panel` to `admin-panel/`, matching the spec layout.
- Backend phases 1–3 built and tested (branch `backend-phase-1-3`, not yet committed or pushed).
- Added `docs/SETUP.md` (setup on another laptop with Docker) and this file.
