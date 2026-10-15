# Veil Android app

React Native / Expo frontend prototype based on the screens in
`../docs/front end/VPN App  MVP Screens.pdf`.

## Run locally

Install Node.js, then from this directory run:

```powershell
npm install
npm start
```

Open the project with an Android emulator or Expo Go. `npm run typecheck`
checks the TypeScript source.

## Current scope

The prototype includes onboarding, VPN connection states, location search and
selection, rewards, settings, the time-expired screen, and connection-help
states. Connection, timer, protocol, and reward interactions use in-memory demo
state only. There is no API client, real VPN tunnel, rewarded-ad SDK, or
persistent storage yet.

## Source layout

- `App.tsx` — demo state and screen flow.
- `src/components/` — shared buttons, headers, location rows, and connection
  indicator.
- `src/features/` — onboarding, connection, locations, rewards, settings, and
  connection-error screens.
- `src/theme/` and `src/types/` — shared colors and UI model types.
- `android/`, `assets/`, `src/services/`, `src/navigation/`, `src/state/`,
  `src/hooks/`, and `src/utils/` — reserved for native integration and future
  app work.
