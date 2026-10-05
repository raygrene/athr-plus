# Athr+ web

A SvelteKit website that shows the same scooter information as the Athr+ Android app. It is an independent project and is not affiliated with Ather Energy.

| Page | What it shows |
| --- | --- |
| Home | Battery %, range, charging state, range per ride mode, battery history, odometer, fuel savings, reported battery state of health (SoH), connectivity and charger details, tyre pressures, anti-theft and other feature flags |
| Charging | Estimated energy, cost, range and time to reach a target %, plus pause and resume charging |
| Map | The scooter's last reported GPS location, accuracy, speed, heading and altitude |
| Rides | The last 100 rides from Ather, with distance, Wh/km, derived energy and cost |
| Health | Ather's vehicle-health scorecard: components, wear and tear, and resale estimate |
| Chargers | Your Ather wallet, and nearby public and Ather Grid chargers |
| Settings | Scooter details, a battery-size override, the electricity tariff and sign-out |

`docs/ATHER-API-ENDPOINTS.md` lists every endpoint the site calls.

## How it works

The browser cannot call Ather directly, because Cerberus's CORS policy blocks it and a browser WebSocket cannot send an `Authorization` header. So the SvelteKit server does all of the Ather calls:

- **Sign-in.** The site uses the same OTP flow as the app. The token is stored in an AES-256-GCM-encrypted, `httpOnly`, `SameSite=Strict` cookie. Browser JavaScript never sees it, and nothing is written to the server's disk.
- **Live data.** The server keeps one Cerberus WebSocket per signed-in scooter and shares it across every open tab (`src/lib/server/live.ts`). It reconnects every 5 seconds for a fresh snapshot, as the app does. It sends the merged state to the browser over Server-Sent Events (`/api/live`). The socket closes 30 seconds after the last tab closes.
- **Parsing.** `src/lib/telemetry.ts` is a port of the app's parser and merge rules. It is tested against the Android test fixtures.
- **Browser storage.** Battery history and preferences are kept in `localStorage` in your browser.

Differences from the Android app:

- **No automatic charge limiter.** The site has no background charge limiter, so it never pauses charging on its own. Pause and resume are manual.
- **Battery health.** SoH is shown only when the scooter reports it. The site does not estimate SoH from trips.
- **Battery history.** History builds up only while the site is open. It records only readings that carry the scooter's own timestamp.
- **No notifications or widget.**

## Run it

You need Node 20 or later. The site needs a long-running Node server, because it keeps WebSockets open, so serverless hosts won't work.

```sh
cd web
npm install
cp env.example .env                # set SESSION_SECRET, e.g. openssl rand -base64 32
npm run dev                        # http://localhost:5173
```

Production:

```sh
npm run build
SESSION_SECRET=… ORIGIN=https://your.host PORT=3000 node build
```

Checks:

```sh
npm run check   # svelte-check / TypeScript
npm test        # vitest: parser, estimates and response parsers
```

## Security notes

- **Who can use it.** Anyone who can reach the site can sign in with their own Ather account. Each session sees only its own scooter. Don't expose a personal instance publicly without putting access control in front of it, such as a VPN, Tailscale or basic auth at a reverse proxy.
- **Serve it over HTTPS.** In production the cookie is `Secure`, so it is only sent over HTTPS.
- **Charging commands.** `POST /api/charging` accepts JSON only. Because of that and the `SameSite=Strict` cookie, a cross-site form can't trigger it.
- **Signing out.** Signing out deletes the cookie. It does not revoke the token on Ather's server.
