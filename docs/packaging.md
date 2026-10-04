# Windows Packaging (jpackage)

This document describes how Universal QR Sharing is packaged for Windows into a
self-contained application that needs **no separately installed** Java, Maven,
Node, npm, Docker, or Python to run.

The packaging scripts live under [`windows/`](../windows) and are the single
source of truth for the build. All commands are PowerShell.

## Overview

```
frontend (React/Vite)                backend (Spring Boot 3.2)
       │  npm run build                        │
       ▼                                        │
   frontend/dist  ──copied──▶ backend/src/main/resources/static
                                                │  mvn clean package
                                                ▼
                      backend/target/qr-share-0.0.1-SNAPSHOT.jar  (fat jar, SPA bundled)
                                                │  jpackage --type app-image (+ jlink runtime)
                                                ▼
             release/windows/UniversalQRSharing/UniversalQRSharing.exe  (self-contained)
                                                │  jpackage --type exe  (needs WiX)
                                                ▼
             release/windows/UniversalQRSharing-1.0.0.exe  (installer — BLOCKED without WiX)
```

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| JDK (with `jpackage` + `jlink`) | 21+ | fat jar, app-image, installer |
| Maven | 3.9+ | fat jar |
| Node.js + npm | 18+ | frontend bundle |
| WiX Toolset | v3.14 (`candle`/`light`) or v4/v5 (`wix.exe`) | **installer only** (`--type exe`) |

`jpackage` and `jlink` ship with the JDK. WiX is **only** required for the real
`.exe` installer, not for the app-image.

## Step 1 — Build the fat jar (SPA bundled)

```powershell
.\windows\build-jar.ps1
```

This runs `npm install` + `npm run build` in `frontend/`, copies
`frontend/dist/*` into `backend/src/main/resources/static/` (preserving
`static/.gitkeep`), then runs `mvn clean package -DskipTests` to produce
`backend/target/qr-share-0.0.1-SNAPSHOT.jar`.

Pass `-SkipNpmInstall` to skip the npm install step on repeat builds.

The jar's `Main-Class` is the Spring Boot 3.2 launcher
`org.springframework.boot.loader.launch.JarLauncher` (confirmed via
`META-INF/MANIFEST.MF`); `Start-Class` is `com.qrshare.QrShareApplication`.
`jpackage` uses the launcher as its `--main-class`.

## Step 2 — Build the self-contained app-image

```powershell
.\windows\build-app-image.ps1          # jar must already exist
# or build the jar first and chain:
.\windows\build-app-image.ps1 -BuildJar
```

This runs `jpackage --type app-image`, staging only the fat jar as the input
(so no stray `target/` artifacts are bundled), and produces:

```
release\windows\UniversalQRSharing\
    UniversalQRSharing.exe     ← launcher
    app\qr-share-0.0.1-SNAPSHOT.jar
    app\UniversalQRSharing.cfg
    runtime\                    ← bundled JRE (jlink)
```

The result is fully self-contained — launching `UniversalQRSharing.exe` starts
the bundled runtime, the backend, and serves the bundled SPA. No dev server
(`npm run dev` / `mvn spring-boot:run`) is required.

### Required `--add-modules`

`jpackage` auto-derives a minimal `jlink` runtime from the app's bytecode. That
analysis **misses modules referenced only at class-init / reflectively**, so the
scripts pass an explicit module set:

```
java.base, java.desktop, java.instrument, java.management, java.naming,
java.net.http, java.prefs, java.rmi, java.scripting, java.security.jgss,
java.sql, jdk.crypto.ec, jdk.unsupported, jdk.charsets, jdk.localedata,
jdk.zipfs
```

`jdk.charsets` is critical: ZXing (QR generation) references `EUC_JP` during
class initialization, and without `jdk.charsets` the packaged app threw
`UnsupportedCharsetException: EUC_JP` → `NoClassDefFoundError` on the first QR
request. This was found and fixed during FEAT-002 (a runtime-completeness fix;
nothing user-visible changed).

## Step 3 — Build the real `.exe` installer (requires WiX)

```powershell
.\windows\build-installer.ps1          # fails fast with a clear message if WiX is absent
```

This runs `jpackage --type exe` with `--win-menu --win-shortcut
--win-dir-chooser --win-menu-group "Universal QR Sharing"` and produces
`release\windows\UniversalQRSharing-1.0.0.exe`.

`jpackage --type exe`/`msi` shells out to the WiX Toolset. To build the
installer:

1. Install WiX v3.14 (`candle.exe` + `light.exe`) **or** WiX v4/v5 (`wix.exe`)
   from <https://wixtoolset.org> and put it on `PATH`. Verify with
   `wix --version` (v4/v5) or `candle.exe -?` (v3).
2. Build the fat jar first (Step 1).
3. Run `windows\build-installer.ps1`.

When WiX is absent the script fails fast with an explanatory message and does
**not** fabricate an installer. The verified app-image (Step 2) is the shipped
artifact in that case. See [troubleshooting.md](troubleshooting.md) and the
PACKAGING-REPORT for the exact blocked status.

## Data safety (install / upgrade / uninstall)

Enforced by `RuntimePaths` (FEAT-001) at runtime, independent of where the
binaries are installed:

- **Binaries** may live under `Program Files` (installer default).
- **Persistent user data** (shares, metadata, config, logs) always lives under
  `%LOCALAPPDATA%\UniversalQRSharing`, **never** inside `Program Files` or the
  install directory. Verified: no `storage` directory is created inside the
  app-image dir.
- **Upgrades** preserve that data because `RuntimePaths` resolves the data root
  from the environment, not from the binary path. An in-place reinstall keeps
  all existing shares/config.
- **Uninstall** removes only the installed binaries. Purging
  `%LOCALAPPDATA%\UniversalQRSharing` must stay a deliberate, separately
  documented manual step — the uninstaller never silently destroys user data.

## Release layout & checksums

Packaging output goes under `release/` (git-ignored). After a build, generate
checksums:

```powershell
Get-FileHash -Algorithm SHA256 release\windows\UniversalQRSharing\UniversalQRSharing.exe
```

`release/checksums.txt` records SHA256 for the launcher exe, the bundled app
jar, and the `.cfg` (and the installer `.exe` when WiX produced one).

## Firewall

See [`windows/add-firewall-rule.ps1`](../windows/add-firewall-rule.ps1) and
[troubleshooting.md](troubleshooting.md#lan-devices-cannot-reach-the-share-url-firewall).
The app only **detects/advises**; it never auto-modifies the firewall. The
helper adds a narrow inbound TCP rule on the chosen port, Private profile only,
and requires elevation.
