# Universal QR Sharing — Windows + Android Packaging Report

Honest build-and-verify report. Results are strictly separated into **VERIFIED**
(commands actually executed in this environment with their real outcomes),
**BUILT-BUT-NOT-REAL-DEVICE/REAL-INSTALL-VERIFIED**, **BLOCKED** (with the exact
missing tool), and **NOT CLAIMED** (never executed, never faked).

- Host: Windows 11, OpenJDK 25.0.4.1 (Eclipse Temurin), `jpackage` + `jlink`
  present. Maven 3.9.15, Node 24.x, npm 11.x.
- Detected LAN: interface `Intel(R) Wi-Fi 7 BE201 320MHz`, LAN IP `172.20.10.2`.
- No `SERVER_PORT`-forced value for the gate run; default selection chose 8787.

> **Rule honored throughout:** nothing is reported as "passed"/"verified" unless
> the command was actually executed here. Where a result could not be executed,
> it is BLOCKED or NOT CLAIMED, with the precise reason.

---

## ✅ VERIFIED (actually executed here)

### Quality gate (FEAT-004)

| Gate | Command | Result |
| --- | --- | --- |
| Backend tests | `cd backend; mvn clean test` | **BUILD SUCCESS** — `Tests run: 27, Failures: 0, Errors: 0, Skipped: 0` |
| Frontend build | `cd frontend; npm run build` | exit 0 (Vite build, `dist/` emitted) |
| Frontend lint | `npm run lint` (`eslint … --max-warnings 0`) | exit 0, 0 warnings |
| Frontend types | `npx tsc --noEmit` | exit 0, 0 errors |
| Fat jar | `mvn clean package -DskipTests` | BUILD SUCCESS, `backend/target/qr-share-0.0.1-SNAPSHOT.jar` |
| E2E (Playwright) | background stack on :8787; `npx playwright test` (JSON reporter) | **37 passed, 0 failed, 0 skipped, 0 flaky** |

E2E ran against the production-style stack (fat jar serving the bundled SPA at
`:8787`), with `BASE_URL=API_URL=http://localhost:8787`. The JSON report was
parsed for the pass count, then deleted; the background backend was stopped and
confirmed down. The pass count is the **actual** parsed number (37), not an
assumed figure.

### Backend runtime hardening (FEAT-001)

- `RuntimePaths` resolved dataRoot = `C:\Users\sunny\AppData\Local\UniversalQRSharing`
  (`%LOCALAPPDATA%\UniversalQRSharing`); subdirs `storage/files`, `storage/temp`,
  `storage/metadata`, `logs`, `config` created.
- Dynamic port selection single source of truth in `main()` before Spring starts
  (`SERVER_PORT` → probe 8787 → scan 8787..8887 → publish `server.port` +
  `app.server-port`). `SERVER_PORT=8899` run reported `port=8899` in both
  `/api/network/info` and `/api/diagnostics`.
- `ShareUrlService` owns LAN IP + port + token → `http://<lan-ip>:<port>/share/<token>`;
  never loopback when a real LAN IP exists.
- `GET /api/diagnostics` returns version/port/interface/lanIp/dataRoot/filesDir/
  storageWritable/freeDiskSpace/activeShareCount/cleanupLastRunEpoch/javaVersion/
  osName, no secrets.
- Atomic uploads (`.part` → `Files.move` ATOMIC_MOVE) + `@PostConstruct` stale-part
  sweep.
- Live: health UP; `/api/network/info` localIp `172.20.10.2` (not 127.0.0.1);
  upload shareUrl used the LAN IP + port; blob under `%LOCALAPPDATA%`; download
  SHA-256 matched source; DELETE → 204 → share GET → 404.

### Windows app-image (FEAT-002)

- `windows/build-jar.ps1` → fat jar; `Main-Class` confirmed from
  `META-INF/MANIFEST.MF` = `org.springframework.boot.loader.launch.JarLauncher`.
- `windows/build-app-image.ps1` → `jpackage --type app-image` →
  `release\windows\UniversalQRSharing\UniversalQRSharing.exe` with a bundled
  `runtime\` (jlink) and `app\qr-share-0.0.1-SNAPSHOT.jar`. Self-contained: no
  system Java/Maven/Node needed to launch.
- Packaging bug found **and fixed** (not faked): first app-image returned HTTP
  500 on upload — `UnsupportedCharsetException: EUC_JP` →
  `NoClassDefFoundError com.google.zxing.common.StringUtils` because the derived
  jlink runtime omitted `jdk.charsets`. Fix: explicit `--add-modules` (incl.
  `jdk.charsets`, `jdk.localedata`, `jdk.zipfs`). Runtime-completeness only;
  nothing user-visible changed.
- Live verification of the **rebuilt** packaged exe (background, `SERVER_PORT=8788`):
  health UP; network info localIp `172.20.10.2`, port 8788; diagnostics dataRoot
  under `%LOCALAPPDATA%`, storageWritable true; upload → QR generated → download
  SHA-256 MATCH → DELETE 204 → 404. Persistent data under
  `%LOCALAPPDATA%\UniversalQRSharing`, confirmed **not** inside the app-image dir.

### Android via Capacitor (FEAT-003)

- `npm run build`, `npx tsc --noEmit`, `npm run lint` all exit 0 with Capacitor +
  scanner code present.
- `npx cap add android` → `android platform added!` (exit 0); `npx cap sync android`
  → `Sync finished` (exit 0). Native project generated under `frontend/android/`.
- Platform-aware `api/client.ts`, `services/scanner.ts`, native-only
  `ScanQrButton.tsx` wired into `HomePage.tsx`; permission + cleartext templates
  under `android/templates/`.

### Release layout (FEAT-004)

- `release/checksums.txt` written with SHA256 (via `Get-FileHash`) over the
  app-image launcher exe, bundled app jar, and `.cfg`.
- `release/` is git-ignored (verified via `git check-ignore`; `git status` does
  not list release artifacts).

---

## 🟡 BUILT — NOT REAL-DEVICE / REAL-INSTALL VERIFIED

- **Windows app-image data-safety on a real reinstall/upgrade.** `RuntimePaths`
  resolves user data under `%LOCALAPPDATA%` independent of the binary path, and
  the running app was confirmed to keep data outside the app dir. A full
  install → upgrade → re-launch cycle via a real installer was **not** performed
  (no installer; see BLOCKED).
- **Android client code.** The Capacitor project builds, type-checks, lints, and
  syncs, and the scanner/share-routing logic is implemented. It was **not** run
  on a real device or emulator (no APK; see BLOCKED), so on-device scanning and
  LAN round-trips are not device-verified.

---

## ⛔ BLOCKED (exact missing tool named)

- **Real Windows `.exe` installer — BLOCKED: WiX Toolset absent.**
  `jpackage --type exe` requires WiX v3 (`candle.exe`+`light.exe`) or WiX v4/v5
  (`wix.exe`) on `PATH`. Tool probes here: `winget` FOUND; `choco`, `dotnet`,
  `wix`, `candle`, `light`, `makensis` (NSIS) all NOT FOUND. Running
  `jpackage --type exe` produced exactly: *"Can not find WiX tools … none was
  found"* then *"Error: Invalid or unsupported type: [exe]"*. WiX was **not**
  installed (installing third-party tooling was out of scope). `windows/build-installer.ps1`
  is ready to run on a WiX-equipped machine and fails fast with an honest message
  otherwise.
- **Android APK Gradle build — BLOCKED: Android SDK absent + JDK too new.**
  `ANDROID_HOME`/`ANDROID_SDK_ROOT` empty, no `adb`; the multi-GB SDK was not
  downloaded (out of scope). Additionally the installed JDK 25 is rejected by the
  Capacitor Gradle wrapper 8.11.1: `./gradlew assembleDebug` → *"Unsupported class
  file major version 69"*. Fix path (documented, not executed here): JDK 17 +
  installed Android SDK. No APK was produced.

---

## 🚫 NOT CLAIMED (never executed; not faked)

- Real-device Android install and QR scan.
- Hotspot / Wi-Fi **AP-isolation** behavior (depends on specific access-point
  hardware; cannot be verified in this environment).
- 100-concurrent-user / sustained load test.
- Windows **reboot persistence** of the installed service/app.
- **Upgrade-preserves-data** on a real reinstall via the `.exe` installer
  (installer is BLOCKED).
- MSI packaging, code-signing of the exe/installer, antivirus/SmartScreen
  reputation.

---

## 22-Point Final Report Structure

1. **Objective** — Package the Universal QR local-network sharing app for Windows
   (jpackage) and Android (Capacitor) with hardened, dynamic runtime behavior,
   using an honest VERIFIED/BLOCKED strategy.
2. **Environment** — Windows 11, JDK 25 (Temurin), Maven 3.9.15, Node 24 / npm 11,
   `jpackage`+`jlink` present; WiX/NSIS absent; Android SDK/`adb` absent.
3. **Dynamic application-data directory** — `RuntimePaths` resolves
   `UNIVERSAL_QR_HOME` > `%LOCALAPPDATA%\UniversalQRSharing` > macOS/Linux
   equivalents. VERIFIED.
4. **Storage / temp / metadata / logs / config** — all created under the data
   root at startup. VERIFIED.
5. **Dynamic port selection** — single source of truth in `main()`: prefer 8787,
   probe, scan 8787..8887, publish `server.port`+`app.server-port`. VERIFIED
   (incl. `SERVER_PORT=8899`).
6. **LAN IP / interface detection** — `NetworkService` + `ShareUrlService` pick
   the active interface; `localIp=172.20.10.2`. VERIFIED.
7. **Health endpoint** — `/actuator/health` returns UP. VERIFIED.
8. **Diagnostics endpoint** — `/api/diagnostics` returns version/port/interface/
   lanIp/storage/shares/cleanup/java/os, no secrets. VERIFIED.
9. **Graceful startup / shutdown + crash recovery** — stale `.part` sweep on
   startup; atomic move on upload. VERIFIED (startup/sweep + atomic upload path).
10. **Cleanup scheduler** — `CleanupService` tracks `lastRunEpoch`, surfaced in
    diagnostics. VERIFIED (present + reported).
11. **Atomic file operations** — write `.part` → `Files.move` ATOMIC_MOVE;
    metadata persisted only after a successful store. VERIFIED.
12. **No hardcoded IPs/paths/localhost** in production runtime/QR — enforced by
    `RuntimePaths`/`ShareUrlService`; dev/test relative paths retained. VERIFIED.
13. **Dynamic share URL** — QR encodes `http://<lan-ip>:<port>/share/<token>` via
    `ShareUrlService`. VERIFIED.
14. **Fat jar with bundled SPA** — frontend built into Spring Boot static;
    `mvn clean package`. VERIFIED (`java -jar` serves the SPA).
15. **Windows app-image** — `jpackage --type app-image` with bundled jlink
    runtime; launches with no system Java/Node. BUILT & VERIFIED (live upload/
    download/SHA-256/delete).
16. **jlink module completeness** — explicit `--add-modules` incl. `jdk.charsets`
    (fixes ZXing EUC_JP). VERIFIED (QR generation works post-fix).
17. **Windows `.exe` installer** — `windows/build-installer.ps1` ready; **BLOCKED**
    (WiX absent, exact jpackage error captured).
18. **Installer data safety** — binaries may live in Program Files; user data
    stays under `%LOCALAPPDATA%`; upgrades preserve it; uninstall never silently
    purges. VERIFIED (data outside app dir) / documented for the installer path.
19. **Firewall advice** — `windows/add-firewall-rule.ps1`: narrow inbound TCP,
    Private profile only, requires elevation, never disables the firewall.
    VERIFIED (script present & consistent; not applied automatically).
20. **Android via Capacitor** — existing React UI reused; platform-aware client;
    native QR scanner; permissions + cleartext templates. `cap add`/`sync`
    VERIFIED; **APK BLOCKED** (SDK absent + JDK 25 vs Gradle).
21. **Quality gate** — backend 27/0/0; frontend build+lint+tsc exit 0; e2e 37
    passed. VERIFIED (actual numbers).
22. **Honesty & release** — strictly separated VERIFIED/BUILT-NOT-VERIFIED/
    BLOCKED/NOT-CLAIMED; `release/` git-ignored with SHA256 checksums; docs +
    scripts consistent; final commit recorded; push result reported honestly.

---

## Shipped artifacts in this environment

- `release\windows\UniversalQRSharing\UniversalQRSharing.exe` — self-contained
  app-image (VERIFIED).
- `release\checksums.txt` — SHA256 of the app-image artifacts.
- Build scripts: `windows\build-jar.ps1`, `windows\build-app-image.ps1`,
  `windows\build-installer.ps1` (installer ready, WiX-gated),
  `windows\add-firewall-rule.ps1`.
- Docs: `README.md` (Windows + Android sections), `docs\packaging.md`,
  `docs\troubleshooting.md`, `docs\android.md`, `android\BUILD-ANDROID.md`.
- **Not** produced here (BLOCKED): `UniversalQRSetup.exe` installer, Android APK.
