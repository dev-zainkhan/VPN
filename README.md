# Veil VPN

Initial workspace scaffold for the Veil VPN Android mobile app and server-side
services. The screen and backend specifications are in `docs/`.

## Project areas

- `client side/android mobile/` — Android-focused mobile app structure.
- `server side/backend/` — TypeScript control-plane API and database project.
- `server side/admin-panel/` — browser-based server admin console UI prototype.
- `server side/edge/` — Python VPN edge agent and TCP gateway.
- `server side/deploy/` — local and production deployment files.

The Android mobile folder now contains a React Native/Expo UI prototype for
onboarding, connection, locations, rewards, settings, and connection-help
states. Its connection and reward behaviors use local demo state only; backend
and native VPN/ad integrations remain future work. The server structure follows
the backend build specification and remains a scaffold.

## References

- `docs/front end/VPN App  MVP Screens.pdf`
- `docs/front end/VPN App  MVP Screens admin panel.pdf`
- `docs/backend/Veil VPN  Backend Build Specification (MVP).md`
