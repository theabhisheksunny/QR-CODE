# Android App (Capacitor)

The Android app is **not a second application**. It wraps the existing React
frontend with [Capacitor](https://capacitorjs.com/) and reuses the same UI,
the same shared axios client, and the same business logic. The only
Android-specific additions are:

- a **platform-aware API base URL** (native points at a configured LAN host),
- a **native QR scanner** (`@capacitor-mlkit/barcode-scanning`),
- **Android permissions + cleartext** config for http LAN sharing.

## Architecture

```
Existing React frontend (frontend/src)
        │  (same components, same api/client.ts, same api/files.ts)
        ▼
   Capacitor (frontend/capacitor.config.ts)
        ▼
   Android project (frontend/android/ — generated, git-ignored)
        ▼
          APK
```

The Android device is a **client**. It has no local backend. It talks to
"Device A" (the Windows/desktop machine running the Spring Boot backend) over
the LAN.

### Platform-aware API base URL

`frontend/src/api/client.ts` selects the base URL by platform:

- **Native (Android):** uses the host configured in **Settings → API Base URL**,
  stored under the existing `qrshare_api_base_url` localStorage key
  (e.g. `http://172.20.10.2:8787`). If no host is configured yet, requests fail
  fast with a clear message instead of hitting the app's own `file://` origin.
- **Web (dev + packaged desktop):** keeps a relative base (`''`) so requests go
  through the Vite dev proxy or the same origin that serves the SPA.

A stored override always wins when present, so the web build can also target a
remote backend if desired. The platform only changes the default. No business
logic is duplicated — `api/files.ts`, `api/network.ts`, and the pages are
unchanged in behavior.

### QR scanner

- `frontend/src/services/scanner.ts` exposes `scan(): Promise<string>`.
  - Native: uses the ML Kit barcode scanner (on-device, no network).
  - Web: throws `ScannerNotSupportedError` with a clear message.
- `frontend/src/components/ScanQrButton.tsx` renders **only** on native
  (`Capacitor.isNativePlatform()`), so the web build is untouched.
- `parseScan()` classifies the scanned string:
  - **share URL** `http://<ip>:<port>/share/<token>` → stores the host as the
    API base and opens the in-app share view (`/share/:token`).
  - **plain URL** → opens the system browser.
  - **JSON / number / text** → routed to the Text QR page, pre-filled.

## Permissions & cleartext

The app requests **only**:

- `CAMERA` — QR scanning.
- `INTERNET` — reach the LAN backend (added by Capacitor by default).
- `ACCESS_NETWORK_STATE` — detect connectivity before sharing (optional).

No broad storage permissions: file selection uses the Storage Access Framework
(document picker), which needs no `READ/WRITE_EXTERNAL_STORAGE`.

`android:usesCleartextTraffic="true"` is **required** and is a deliberate,
scoped decision: LAN sharing uses plain `http://` because there is no TLS on a
local network. It is further scoped by `network_security_config.xml`, which
restricts cleartext intent to private IP ranges / a pinned Device-A IP.

Templates to apply to the generated project live in `android/templates/`:

- `android/templates/AndroidManifest.additions.xml`
- `android/templates/network_security_config.xml`

## Build status in this environment

| Step | Command | Result here |
| --- | --- | --- |
| Install deps | `npm install` | ✅ success |
| Web build | `npm run build` | ✅ exit 0 |
| Type check | `npx tsc --noEmit` | ✅ 0 errors |
| Lint | `npm run lint` | ✅ 0 warnings |
| Init Capacitor | `npx cap init …` | ✅ `capacitor.config.ts` created |
| Add Android project | `npx cap add android` | ✅ `android platform added!` |
| Sync | `npx cap sync android` | ✅ `Sync finished` |
| **Build APK** | `./gradlew assembleDebug` | ❌ **BLOCKED** (see below) |

### Why the APK build is BLOCKED here

`npx cap add android` and `npx cap sync android` **succeeded** — the native
Gradle project is generated under `frontend/android/`. The APK build itself is
blocked by two environment gaps:

1. **No Android SDK.** `ANDROID_HOME` / `ANDROID_SDK_ROOT` are empty, and there
   is no `adb` on PATH. The Gradle build cannot resolve the Android platform
   without an installed SDK and a `local.properties` pointing at it. Per the
   task constraints, the multi-GB SDK is **not** downloaded here.

2. **JDK too new for Gradle.** The installed JDK is OpenJDK 25. The Capacitor
   Gradle wrapper (8.11.1) fails to parse version-69 class files:

   ```
   BUG! exception in phase 'semantic analysis' in source unit '_BuildScript_'
   Unsupported class file major version 69
   ```

   The Android Gradle Plugin requires JDK 17 (or a Gradle release that supports
   the installed JDK). See `android/BUILD-ANDROID.md` for the exact remediation.

No APK was produced, and no build/test result is reported as "passed" for the
APK — it was not executed successfully. Everything else above was actually run.

See [android/BUILD-ANDROID.md](../android/BUILD-ANDROID.md) for the exact,
reproducible APK build and signing steps on a correctly provisioned machine.
