# Add a VPN server on any provider (Contabo, Hetzner, …)

Veil can run its VPN servers anywhere, not only on AWS. You rent a VPS, paste one command,
and the server sets itself up and appears as **Active** in the admin panel. The app and the
backend do not change when you add, remove or switch providers.

## What the VPS needs

- Ubuntu 22.04 or 24.04, or Debian 12 (fresh install).
- A public IPv4 address (every normal VPS has one).
- Nothing else on UDP port 51820 and TCP port 443.
- At least 1 GB RAM. Bandwidth is what matters for a VPN: pick a plan with many TB of traffic.
- The Veil API must be reachable from the internet (the production server). A VPS cannot reach
  an API that runs only on a laptop.

## Steps

1. Admin panel → **Servers** → **Create server** → **Any provider**.
2. Type the provider name (for example `Contabo`) and choose the location shown in the app
   (the region closest to where the VPS really is, for example Singapore).
3. Click **Get install command** and copy the command. It works once and contains a secret key.
4. Log in to the VPS as root (the IP address and password are in the provider's panel), for example
   with `ssh root@<VPS IP>`, paste the command and press Enter.
5. After 1–3 minutes it prints `Veil server is set up`, and the server turns **Active**.

Lost the command before running it? Servers → the server's menu → **Show install command**
gives a new one (the old one stops working).

## Removing a server

Servers → menu → **Remove server**. Veil stops sending users to it and disconnects them.
Then delete the VPS in the provider's panel yourself, or it keeps costing money.

## How it was tested

A plain Ubuntu 22.04 VM with instance metadata blocked (so it had no help from AWS, like a VPS
elsewhere): the install command set it up, it registered in under a minute with its correct public
IP, and a phone connected through it and showed that server's IP.
