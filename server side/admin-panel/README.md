# Veil Admin panel

React and TypeScript frontend prototype for the Veil VPN server administration
screens in `../../docs/front end/VPN App  MVP Screens admin panel.pdf`.

## Run locally

```powershell
npm install
npm run dev
```

Vite prints the local URL when the development server starts. The app opens on
a demo sign-in screen; enter any non-empty email and password to preview the
console.

## Screens

- Sign-in and authenticator-code form
- Fleet dashboard and actionable alert cards
- AWS account list and add-account drawer
- Server list, status filters, account/region filters, launch flow, and server
  actions
- Region display names and visibility
- Searchable device list and detail drawer with minute adjustment,
  disconnect, and block controls
- Reward activity and daily chart
- Reward, protocol, support, password, and two-factor settings

All records and actions use in-memory demo data. No credentials are transmitted,
and this panel is not connected to the API or production infrastructure yet.
Restarting the page restores the original sample data.
