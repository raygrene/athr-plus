# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Athr+ is an independent Android companion app and home-screen widget for Ather electric scooters (package `io.ather.pro`, minSdk 26, targetSdk 34). It's built with Kotlin 2.0, Jetpack Compose and Material 3, OkHttp + Gson, Room, WorkManager and a Rust JNI library. Maps use Leaflet inside a WebView.

## Commands

Toolchain: JDK 17 or 21, Android SDK API 34, Build-Tools 34.0.0, NDK **26.1.10909125**, Rust with the Android targets (`rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`). The SDK path comes from `android/local.properties` (`sdk.dir=...`) or `ANDROID_HOME`.

Run Gradle from the repo root with `-p android`:

```sh
./android/gradlew -p android assembleDebug --console=plain     # debug APK (also builds Rust via preBuild)
./android/gradlew -p android test                               # JVM unit tests (android/app/src/test)
./android/gradlew -p android testDebugUnitTest --tests 'io.ather.pro.domain.charging.ChargeLimitControllerTest'   # one test class
./android/gradlew -p android lintRelease
```

Other checks (all offline, none contact the scooter or Ather):

```sh
python3 scripts/test-ather-lab.py     # unittest suite for the desktop API lab, secret guard and charge-limit scripts
python3 scripts/test-migration.py     # runs the Room migration SQL from AtherDatabase.kt against test/resources/local/schema-v1.sql
node scripts/test-map.mjs             # headless-Chromium gesture tests for assets/map.js (CHROMIUM env overrides /usr/bin/chromium)
cargo test --manifest-path rust/ather-math/Cargo.toml
```

Release builds (`assembleRelease`) fail on purpose unless the four `ATHR_SIGNING_*` env vars point to the **original** signing key. After the build, `scripts/prepare-release.py <apk>` checks the certificate and identity, scans for secrets, and writes the APK, SHA-256 and `update.json` to `android/app/build/release-upload/`. See `docs/APP-UPDATES.md`.

## Architecture

The source lives under `android/app/src/main/java/io/ather/pro/` and uses layers: `data/` → `domain/` ← `presentation/` (ViewModels) ← `ui/` (Compose), plus `service/` and `widget/`.

- **Wiring.** `AtherApplication` holds an `AppContainer` (session store, auth API, `AtherRepository` singleton, `MonitoringController`), which code reaches through `context.appContainer`. Activities never own the scooter connection. `onCreate` also schedules the update worker, refreshes widgets and sets `TelemetryComputation.engine = RustTelemetryMath`.
- **Data flow.** `AtherApiClient` (behind the `AtherCloudApi` interface) talks to the Ather cloud: a WebSocket for shadow-change deltas and REST for shadow snapshots, rides, and remote-charging commands. Remote charging is an HTTP device-shadow mutation, not a socket send. `AtherRepository` (the largest stateful class) merges partial telemetry deltas into the `ScooterDashboard` model, persists to Room (`data/local`) and drives refreshes. Telemetry payloads come in several shapes (enveloped, nested, flattened-dotted, partial deltas); the fixtures in `src/test/resources/telemetry_fixtures` cover each one.
- **Monitoring.** `MonitoringController` decides whether the foreground `ScooterMonitorService` runs (app visible, "always on", or an active charge limiter) and schedules `ChargingCheckWorker`. While connected, the app requests a snapshot on a fixed 5-second interval, and incoming packets don't reset that timer.
- **Charge limiter** (`domain/charging`). This is the most subtle logic in the app. `ChargeLimitController`, `ChargingEvidence`, `EstimatedChargeCutoff`, `RemoteChargingDispatcher` and `ChargeLimitStore` (persisted per scooter, with a command latch) handle it. The limiter sends Pause once when the *measured* target is reached or when the estimated deadline (anchored to the battery report timestamp) arrives. Cached or repeated reports must never count as new measurements. Active charging status or heartbeat overrides a contradictory `chargerConnected=Off`. HTTP acceptance does not confirm the scooter stopped. Read `docs/NATIVE-COMPUTATION.md` before changing this code, because it records the intended rules and observed API quirks (for example, `time2FullCharge` is in seconds).
- **Native math.** `rust/ather-math` exposes JNI functions named `Java_io_ather_pro_data_computation_RustTelemetryMath_*` (history indices, range scaling, charge estimate, charge-time estimate) and passes only primitive arrays and scalars. The domain declares the interface and `data/computation/RustTelemetryMath.kt` owns the JNI. If you rename the Kotlin class or package, you must rename the Rust symbols too. The Gradle `buildRust` task (a dependency of `preBuild`) runs `scripts/build-android-rust.sh`, which builds four ABIs into `build/generated/rustJniLibs`. Credentials never go to Rust.
- **Widget.** In `widget/`, `DashboardWidgetSnapshot` produces pure snapshot data, which `WidgetRenderer` turns into RemoteViews. `WidgetAppearanceReceiver` and `onConfigurationChanged` refresh widgets when the theme changes.
- **Maps.** `ui/MapSection.kt` and `ui/chargingmap` host WebViews that load `assets/map.html`, `map.js` and `charger_map.html` with bundled Leaflet. `ChargerMapJsBridge.java` is the JS bridge. `.gitattributes` keeps `assets/**` byte-exact, so don't reformat those files.
- **App updates.** `data/update` checks public GitHub Releases (`karmugilen/athr-plus`, stable releases marked Latest only) and verifies a downloaded APK's package, version, signing certificate, size and checksum (`ApkVerifier`) before installing. Each release needs a higher `versionCode`, overridable with `-PathrVersionCode` and `-PathrVersionName`. The defaults live in `android/app/build.gradle.kts`.
- **Auth.** OTP phone login (`data/auth`, with libphonenumber country codes and +91 as the default). Sessions are stored in Keystore-backed `EncryptedSharedPreferences` (`SecureSessionStore`), falling back to private prefs.

`scripts/ather-lab.py` and `scripts/charge-limit.py` are a desktop Python "API lab" that mirrors the app's request formats (`docs/LOCAL-API-LAB.md`). Its session files live in `~/.local/share/atherpro-lab/`, outside the repo.

## Conventions and guardrails

- Never commit session files, tokens, keystores, APKs or `local.properties`. `python3 scripts/secret-guard.py install` adds pre-commit and pre-push hooks that scan for JWTs, bearer tokens and private file names. Run `python3 scripts/secret-guard.py staged` or `python3 scripts/secret-guard.py tree` to scan by hand.
- Releases must be signed with the original key to stay upgrade-compatible. Never generate a new signing key in CI.
- Room schema changes need a migration in `AtherDatabase.kt`, and `scripts/test-migration.py` must still pass.
- User-facing text and docs avoid overclaiming: show estimates as approximate, show unconfirmed stops as unconfirmed, and never fill history gaps with invented data.
