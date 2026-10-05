# Ather cloud endpoints used by Athr+

This is every scooter-related endpoint the Android app calls, taken from the source. Ather publishes no API contract. Field names and units come from the app's parsers and from observed responses, so they may change without notice.

All endpoints are on `https://cerberus.ather.io`. The same requests are implemented for the website in `web/src/lib/server/ather.ts` and `web/src/lib/server/live.ts`.

## Common headers

Authenticated requests send `Authorization: Bearer <token>`. The app also sends headers that identify it as the Ather app:

| Header | Value |
| --- | --- |
| `Source` | `ATHER_APP/13.2.0` |
| `X-Platform` | `Android` |
| `X-Platform-Version` | `14` |
| `Accept` | `application/json` |
| `Accept-Charset` | `UTF-8` |
| `Content-Type` | `application/json` (for POST requests) |
| `User-Agent` | `ktor-client` |
| `X-Request-Source` | `ATHER_APP` (only on rides, vehicle health, locations and wallet) |

A 401 or 403 response means the token has expired. There is no refresh endpoint, so the user signs in with OTP again.

## Sign-in and scooter discovery

Source: `data/auth/AtherAuthApi.kt`

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/v2/generate-login-otp` | Sends an SMS OTP. Body: `{"email":"","contact_no":"<10 digits>","country_code":"IN"}` |
| POST | `/auth/v2/verify-login-otp` | Exchanges the OTP for a token. Body: `{"email":"","contact_no":"…","userOtp":"…","is_mobile_login":"true","country_code":"IN"}`. The token is at `token`, `token.token`/`token.access_token` or `data.token`/`data.access_token` |
| GET | `/api/v1/me` | Account profile. Scooters are at `vehicles[]`, `data.vehicles[]` or `scooters[]`, but this list is often empty |
| GET | `/api/v2/auth/user/scooters/firebase-dbs` | Fallback scooter list at `shardDetails[]` (`scooter_uuid`, `scooter`) |

## Scooter state

Source: `data/api/AtherApiClient.kt`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/devices/shadows/scooters/properties?uuid=<uuid>&state=reported` | Static properties under `data`: `bike_id` (needed for rides), `model_type`, `model` (`xhr`/`xlr`), `generation`, `bike_type`, `platform`, `colour`, `registration`, `display_name` |
| WSS | `/api/v1/ws/devices/shadows/onchange?uuid=<uuid>` | Live telemetry (see below) |
| POST | `/api/v1/devices/shadows/scooters?uuid=<uuid>` | Pause or resume charging (see below) |
| GET | `/api/v1/rides?scooterid=<bike_id>&limit=100&page=1` | Ride history at `trips[]` or `data.trips[]`. Each ride has `ride_id`, `ride_start_time`/`ride_end_time` (epoch ms), `distance_m` and `efficiency_wh_km`. It has no state of charge (SoC) |

### Telemetry WebSocket

The WebSocket handshake carries the bearer token and the app headers. The app also sends `X-Device-Info: Google Pixel 8 Pro` and `User-Agent: Ather/13.2.0 android/14 (Google Pixel 8 Pro)`. After the socket opens, the client sends this subscription:

```json
{"paths":["telemetry.bike","telemetry.charging","telemetry.tpms","scooters.remote_charging","scooters.properties","scooters.bike","app.ather_stack_features"]}
```

The first frame is a full snapshot. Later frames are partial deltas, so the client merges them into its current state. Frames come in several shapes: `state.reported` and `state.delta` envelopes, nested objects, and flattened keys such as `"telemetry.bike.range"`. The fixtures in `android/app/src/test/resources/telemetry_fixtures` show each shape. The app opens a new connection every 5 seconds to get a fresh snapshot.

Fields the app reads:

| Path | Fields |
| --- | --- |
| `telemetry.bike` | `battery_soc`, `range`, `odo`, `vehicle_state`, `mode`, `savings`, `last_synced_time` (epoch ms), `software_version` and its variants, `gsm_signal`/`csq`, `mode_range{mode: km}`, `predicted_mode_range{mode: km}`, `gps_location{lat, lng, ALT_M, Accuracy, heading, speed}`, `soh_percent` |
| `telemetry.charging` | `chargingStatus`, `chargingHeartBeat` (`On`/`Off`), `chargerConnected`, `time2FullCharge` and `time2EightyCharge` (seconds), `chargerType` |
| `telemetry.tpms` | `front_pressure`, `rear_pressure`, `front_temperature`, `rear_temperature` and their variants |
| `scooters.remote_charging` | `action` (`start`/`stop`), `state`, `error` |
| `app.ather_stack_features` | Feature flags such as `anti_theft` and `vacation_mode` |

### Remote charging

Remote charging is a desired-shadow mutation over HTTP. It never goes through the socket. The app sends exactly this body:

```json
{"state":{"desired":{"remote_charging":{"state":1,"action":"stop","error":"0","timestamp":<epoch ms>}}},"request_id":"ma_<uuid>"}
```

A 2xx response only means Ather accepted the request. The change is confirmed when the scooter's charging telemetry shows it.

## Vehicle health scorecard

Source: `data/analytics/VehicleHealthReportClient.kt`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/vehicle-health/report?uuid=<uuid>` | Ather's "True Health" scorecard under `data`: `vehicle`, `health.overall`, `health.components[]`, `health.wear_and_tear_components[]`, `resale_estimation` and `meta`. It returns 404 when no scorecard exists. The scorecard is not the battery's state of health (SoH) |

## Public chargers and wallet

Source: `data/chargingmap/ChargingMapApi.kt`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v2/locations?lat=&lng=&radius=<km, 1–50>&limit=<1–200>&type=public[&parking_type=]` | Nearby Ather Grid and public chargers: name, address, coordinates, open hours, dock (`dbs_*`) availability, connectors and tariff lines |
| GET | `/api/v1/wallet` | Wallet `balance`, `wallet_status`, `credits` and `transactions[]` |

## Not Ather endpoints

- `api.github.com/repos/karmugilen/athr-plus/releases/latest` checks for app updates.
- OpenStreetMap tiles are used for maps, and Google Maps links are used for directions.
