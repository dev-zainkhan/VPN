# Setup on a new laptop (Windows)

Follow these steps in order. Each step ends with a check; do not move on until it passes.

## 1. Install the tools (once)

1. **Git:** download from https://git-scm.com/download/win and install with the default options.
   Check: open a new PowerShell window and run `git --version`.
2. **Node.js 22 LTS or newer:** download the Windows installer from https://nodejs.org and install it.
   Check: `node -v` prints `v22.` or higher.
3. **Docker Desktop:** download from https://www.docker.com/products/docker-desktop and install it.
   During setup keep "Use WSL 2" ticked. Restart the laptop if it asks.
   Open Docker Desktop once and wait until it says "Engine running".
   Check: `docker --version` and `docker compose version` both print a version.

## 2. Get the code

```powershell
cd C:\
git clone https://github.com/dev-zainkhan/VPN.git veil
cd veil
git checkout backend-phase-1-3
```

Check: `dir` shows `backend`, `admin-panel`, `android-app`, `deploy`, `docs`, `edge`.

## 3. Start the database (Docker)

```powershell
docker compose -f deploy/docker-compose.dev.yml up -d
```

Check: `docker ps` shows a container with image `postgres:16-alpine` and status `Up`.
The database keeps its data in a Docker volume, so it survives restarts.
To stop it: `docker compose -f deploy/docker-compose.dev.yml down` (add `-v` only if you want to delete all data).

## 4. Configure the backend

```powershell
cd backend
copy .env.example .env
```

Create three secrets (run this line three times, copy each output):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Open `backend\.env` in Notepad and set:

| Line | Value |
| --- | --- |
| `MASTER_KEY=` | first secret |
| `TOKEN_PEPPER=` | second secret |
| `ABUSE_PEPPER=` | third secret |
| `ADMOB_AD_UNIT_ID=` | `ca-app-pub-3940256099942544/5224354917` (Google's test rewarded ad) |
| `ADMIN_EMAIL=` | your email |
| `ADMIN_INITIAL_PASSWORD=` | a password of at least 12 characters |

Never commit `.env`; it is already in `.gitignore`.

## 5. Install, create the tables, seed

```powershell
npm install
npm approve-scripts @prisma/client @prisma/engines esbuild prisma
npm rebuild
npx prisma migrate dev
npx prisma db seed
```

(`npm approve-scripts` is only needed on npm 11 or newer; on older npm skip it and `npm rebuild`.)

Check: `npx prisma studio` opens a browser tab; table `regions` has 17 rows, `settings` 1 row, `admins` 1 row.

## 6. Run the tests and the API

```powershell
npm test
npm run typecheck
npm run dev
```

Check: in another PowerShell window, `curl.exe http://localhost:3000/api/health` returns `{"ok":true}`.

## 7. Try the device API

In a second PowerShell window:

```powershell
$body = '{"abuseKey":"' + ('a' * 64) + '","platform":"android","appVersion":"1.0.0"}'
$r = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/devices/register -ContentType 'application/json' -Body $body
$r
Invoke-RestMethod -Uri http://localhost:3000/api/v1/me -Headers @{ Authorization = "Bearer $($r.deviceToken)" }
```

Check: the first call shows `balanceSeconds : 3600`; `me` shows the same balance.
Run the register call again: the second device gets `balanceSeconds : 0` (one starter gift per phone).

## 8. Try the admin sign-in

```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = @{ email = 'YOUR_ADMIN_EMAIL'; password = 'YOUR_ADMIN_PASSWORD' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/admin/auth/login -ContentType 'application/json' -Body $login -WebSession $s
Invoke-RestMethod -Uri http://localhost:3000/api/admin/auth/me -WebSession $s
Invoke-RestMethod -Uri http://localhost:3000/api/admin/aws-accounts -WebSession $s
```

Use the `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` from your `.env`.
Check: login shows your email; `me` shows it again; `aws-accounts` shows `items : {}` (empty list).
This only works with `COOKIE_SECURE=false` in `.env` (plain `http://` on your laptop). On the real server it stays `true`.
Five wrong passwords lock the admin for 15 minutes; ten login tries in 15 minutes from one PC are refused with `RATE_LIMITED`.

## 9. Open the admin panel

Keep the backend (`npm run dev` in `backend`) running. In a new PowerShell window:

```powershell
cd C:\veil\admin-panel
npm install
npm run dev
```

Open http://127.0.0.1:5173 and sign in with the same email and password as in step 8.
Check: the dashboard opens; the AWS accounts, Servers, Regions, Devices, Rewards and Settings pages all load.

## If something fails

| Problem | Fix |
| --- | --- |
| `docker` not found | Open Docker Desktop and wait for "Engine running", then open a new PowerShell window |
| Port 5432 already in use | Another PostgreSQL is running; stop it in Services, or change the port in both the compose file and `DATABASE_URL` |
| `invalid or missing environment variable: X` | Fix that line in `backend\.env` |
| `P1001: Can't reach database server` | The database container is not running: repeat step 3 |
| Prisma or esbuild errors after `npm install` | Run the `npm approve-scripts` and `npm rebuild` lines from step 5 |
