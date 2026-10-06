# Universal QR Code Generator & File Sharing

> **No database required.** No Docker required for local development.

![Java](https://img.shields.io/badge/Java-21-orange?logo=openjdk)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.x-brightgreen?logo=springboot)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)

---

## Three Delivery Modes (one shared codebase)

Universal QR Sharing ships as **three coexisting products** that all reuse the
**same** React UI, the **same** shared API client/contracts, and the **same**
Spring Boot backend core. Only platform-specific concerns (QR scanner, API base
URL) have platform-specific implementations.

```
                 UNIVERSAL QR SHARING
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
         WEB          WINDOWS        ANDROID
       Browser       EXE (embedded    APK
                      WebView)       (Capacitor)
          │              │              │
          └──────────────┼──────────────┘
                  Shared React UI
                  Shared API contract
                  Spring Boot core + local storage
```

| Mode | How to run | Primary UI | Backend |
| --- | --- | --- | --- |
| **Web** | `mvn spring-boot:run` + `npm run dev` (dev) or the fat jar (prod) | Browser | Local Spring Boot |
| **Windows** | Install `release/UniversalQRSharing-Setup.exe` → launch from Start Menu | Embedded JavaFX **WebView** window (no Chrome/Edge) | Bundled Spring Boot (self-contained) |
| **Android** | Install `release/UniversalQRSharing.apk` | Capacitor WebView | **Client** of a LAN host's Spring Boot |

A person **receiving** a QR share never needs the app installed — they scan with
a normal phone camera and open the LAN share URL in any browser. The host (Web,
Windows, or Android) and the remote scanner are independent concerns.

Every mode supports **both directions** — Send/Share **and** Scan/Receive:

| Capability | Web | Windows EXE | Android APK |
| --- | --- | --- | --- |
| Generate file/text/room QR | ✅ | ✅ | ✅ |
| **Scan QR** (camera) | `BarcodeDetector` where available | **native webcam** (webcam-capture + ZXing) | native **ML Kit** |
| Routes `/share/<token>` → file page | ✅ | ✅ | ✅ |
| Routes `/room/<token>` → room join | ✅ | ✅ | ✅ |

Scanning uses one **shared QR route resolver** (`resolveQrRoute`): it accepts
**only** the app's own `/share/<token>` and `/room/<token>` URLs and rejects any
other QR with "Unsupported QR code" — the scanner is never a generic URL
launcher. The Windows desktop opens a **native webcam window** (the JavaFX
WebView has no `getUserMedia`), decodes with the bundled ZXing, and bridges the
result into the same React routing.

Final release artifacts:

```
release/
├── UniversalQRSharing-Setup.exe   # Windows installer (embedded WebView)
├── UniversalQRSharing.apk          # Android client
└── SHA256SUMS.txt                  # checksums for both
```

### Rebuilding a deleted release artifact

If `release/UniversalQRSharing-Setup.exe` or `release/UniversalQRSharing.apk`
is ever lost, regenerate it with one command (run from the repo root in
PowerShell). Each script rebuilds from source, republishes into `release/`, and
refreshes `release/SHA256SUMS.txt`.

```powershell
# Windows installer  ->  release\UniversalQRSharing-Setup.exe
#   needs: Node+npm, Maven, JDK 21+, WiX v3.14 (auto-detected)
.\windows\make-release-exe.ps1
# first run on a machine (installs npm deps):  omit -SkipNpmInstall
.\windows\make-release-exe.ps1 -SkipNpmInstall      # faster re-runs

# Android APK  ->  release\UniversalQRSharing.apk
#   needs: Node+npm, a JDK 17, Android SDK (API 34/35 + build-tools;34.0.0)
#   JDK 17 and the SDK are auto-detected (repo .tools\android-sdk); override with
#   -JdkPath / -AndroidSdk or JAVA_HOME_17 / ANDROID_HOME.
.\windows\make-release-apk.ps1

# Only recompute checksums for whatever artifacts currently exist:
.\windows\write-checksums.ps1
```

What each wrapper does:

| Command | Steps | Output |
| --- | --- | --- |
| `make-release-exe.ps1` | `build-jar.ps1` (React build + fat jar) → `build-installer.ps1` (jpackage + WiX) → copy → checksums | `release\UniversalQRSharing-Setup.exe` |
| `make-release-apk.ps1` | `npm run build` → `cap sync android` → `gradlew assembleDebug` → copy → checksums | `release\UniversalQRSharing.apk` |
| `write-checksums.ps1` | hash the present artifacts | `release\SHA256SUMS.txt` |

> For a **signed release** APK (Play Store / distribution) instead of the debug
> APK, run `.\windows\make-release-apk.ps1 -Release` after configuring signing —
> see [android/BUILD-ANDROID.md](android/BUILD-ANDROID.md). The lower-level
> scripts (`build-jar.ps1`, `build-app-image.ps1`, `build-installer.ps1`) remain
> available if you want each step individually.

---

## Local Sharing Rooms (multi-device)

Alongside one-off **Quick Share**, the app can host a **Local Sharing Room**: a
multi-device room where everyone on the same Wi-Fi joins from a plain browser
and can both upload and download files. All transfers relay through the host
(Device A) — there is **no** peer-to-peer/WebRTC and **no** internet dependency.

```
                         DEVICE A
                  Universal QR Sharing (Web / Windows EXE / Android)
                       = ROOM SERVER + STORAGE
                           │
                     Same LAN / Wi-Fi / hotspot
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
        DEVICE B       DEVICE C       DEVICE D
        Browser        Browser        Browser   (no app required)
            │              │              │
            └──────────────┼──────────────┘
                           ▼
         every transfer routes THROUGH Device A:
            B ──upload──► A ──download──► C
            C ──upload──► A ──download──► B
```

How it works:

1. **Device A** runs Universal QR Sharing (web, Windows EXE, or Android) and
   chooses **Create Room** (name + expiration).
2. Device A shows a **Room QR** encoding a LAN URL like
   `http://192.168.1.25:8787/room/<secure-room-token>` (never localhost).
3. **Other devices scan the Room QR** with a normal phone camera and open the
   URL in **any browser** — no app, no account, no internet.
4. Each visitor enters a name and **joins**; they receive a secure session token.
5. **Any participant can upload**; the file streams to Device A and appears in
   the room's shared-file list for **everyone** to download.
6. **Any participant can download** any room file (streaming + HTTP Range, so
   large videos seek and resume).
7. **Device A must stay running** — it is the room server and storage hub. If it
   stops, the room is unavailable; when it restarts, an unexpired room (and its
   files) reloads from disk and persisted sessions still authorize.
8. The host can **Close Room** at any time, which removes the room's files and
   disconnects participants. Rooms also auto-expire via the existing cleanup job.

Reuse, not duplication: rooms reuse the **same** streaming upload/download
(bounded memory, any size, any extension), the **same** secure token generation,
the **same** QR service, the **same** LAN-IP detection, and the **same** local
JSON storage model — the direct Quick Share flow is unchanged.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/rooms` | Create a room (returns room token, LAN URL, QR) |
| `GET` | `/api/rooms/{roomToken}` | Public room info (join screen) |
| `POST` | `/api/rooms/{roomToken}/join` | Join; returns a secure session token |
| `POST` | `/api/rooms/{roomToken}/heartbeat` | Refresh presence (`X-Room-Session`) |
| `GET` | `/api/rooms/{roomToken}/participants` | List participants + online count |
| `POST` | `/api/rooms/{roomToken}/files` | Upload a file (streaming, `X-Room-Session`) |
| `GET` | `/api/rooms/{roomToken}/files` | List room files (`X-Room-Session`) |
| `GET` | `/api/rooms/{roomToken}/files/{fileToken}` | Download a room file (Range) |
| `DELETE` | `/api/rooms/{roomToken}/files/{fileToken}` | Remove a room file |
| `POST` | `/api/rooms/{roomToken}/close` | Close the room and purge its files |

Room data lives under the same runtime-aware data root as everything else
(`%LOCALAPPDATA%\UniversalQRSharing-Data\rooms\` on Windows); file blobs stay in
`storage/files/` with random storage keys (never the original filename, never a
path). Participant session tokens and room tokens are cryptographically random.
Cross-room access is rejected, and expired/closed rooms reject all access.

> **Network note.** The room works on normal Wi-Fi and on a Device-A hotspot
> *where the OS allows client-to-client traffic*. Some phone hotspots and
> "guest"/AP-isolation Wi-Fi block device-to-device connections; if a browser
> cannot reach Device A, that isolation is the cause (the app does not and will
> not disable your firewall).

## Quick Start (Local Development)

### 1. Start the backend

```powershell
cd backend
mvn spring-boot:run
```

The backend starts at http://localhost:8787  
Files are stored in `./storage/files/` and `./storage/metadata/`

### 2. Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend starts at http://localhost:5173

### 3. Open

http://localhost:5173

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `FILE_STORAGE_PATH` | `./storage/files` | Where uploaded files are stored on disk |
| `METADATA_STORAGE_PATH` | `./storage/metadata` | Where metadata JSON files are stored |
| `APP_BASE_URL` | `http://localhost:8787` | Base URL used in share links and QR codes |
| `MAX_FILE_SIZE_MB` | `25` | Maximum upload file size in megabytes |
| `DEFAULT_EXPIRATION_MINUTES` | `30` | Default file expiry time in minutes |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allowed origins (comma-separated) |
| `CLEANUP_INTERVAL_MS` | `60000` | How often (ms) the background cleanup job runs |

---

## Optional: Docker Deployment

A `docker-compose.yml` is provided for containerised deployment. Docker is **not** required for local development.

```bash
docker compose up --build
```

---

---

## Overview

A full-stack web application for generating QR codes in two distinct modes:

### Mode 1 — Text / Value QR

Enter any text, number, URL, JSON, email, or arbitrary string. The QR code is generated entirely on the frontend and embeds the raw value directly. No backend round-trip is needed. Scanning the code reveals the original value.

```
Input:  https://example.com
QR:     encodes "https://example.com"
Scan:   browser opens https://example.com

Input:  123456789
QR:     encodes "123456789"
Scan:   displays 123456789
```

### Mode 2 — File Share QR

Upload any file (PDF, image, document, video, etc.). The backend stores the file in temporary storage, generates a cryptographically secure access token, and returns a short-lived share URL. The QR code encodes that URL — **not the file contents**. Any device that scans the code can open the link in a plain browser and view or download the file. No app installation required on the receiving device.

```
Upload:  my-document.pdf
         ↓
         Backend stores file as UUID-named blob
         ↓
         Secure token generated (raw token in URL, only hash stored in DB)
         ↓
         Share URL: https://your-domain.com/share/9xK3mP7qL2vN8sQa
         ↓
QR:      encodes the share URL
         ↓
Scan:    browser fetches /api/files/share/{token}
         ↓
         Backend validates token → streams file with correct MIME type
```

Files expire after a configurable duration (default 30 minutes). Expired files are automatically cleaned up by a scheduled background job.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser / Mobile                        │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │              React 18 + TypeScript + Vite               │  │
│   │                  Tailwind CSS (mobile-first)             │  │
│   │                                                          │  │
│   │  ┌──────────────────┐   ┌───────────────────────────┐  │  │
│   │  │  Text/Value Mode │   │      File Share Mode       │  │  │
│   │  │  (client-side QR)│   │  (upload → URL → QR code) │  │  │
│   │  └──────────────────┘   └───────────────────────────┘  │  │
│   └────────────────────────┬────────────────────────────────┘  │
└────────────────────────────│────────────────────────────────────┘
                             │  HTTP / REST  (proxied /api → :8787)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Spring Boot 3 (port 8787)                     │
│                  No database — no Docker required               │
│                                                                 │
│   ┌──────────┐  ┌──────────────────────┐                       │
│   │controller│→ │    FileShareService  │                       │
│   └──────────┘  └──────────┬───────────┘                       │
│                             │                                   │
│                    ┌────────┴────────┐                          │
│                    ▼                 ▼                          │
│          FileStorageService   MetadataStorageService            │
│                    │                 │                          │
│                    ▼                 ▼                          │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │          Local Disk  ./storage/                          │ │
│   │                                                          │ │
│   │  files/                                                  │ │
│   │    550e8400-e29b-41d4-a716-446655440000  ← file blob     │ │
│   │    8f7c3a21-bc44-4f1e-9d3a-123456789abc  ← file blob     │ │
│   │                                                          │ │
│   │  metadata/                                               │ │
│   │    550e8400-....json  ← {token, fileName, expiry, ...}   │ │
│   │    8f7c3a21-....json  ← {token, fileName, expiry, ...}   │ │
│   └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Docker Deployment (Optional)

> Docker is not required. See [Quick Start](#quick-start-local-development) above for the simpler local path.

```bash
git clone https://github.com/your-org/QR-CODE.git
cd QR-CODE

# (Optional) override base URL for LAN / production use
cp .env.example .env

docker compose up --build
```

| Service     | URL                                    |
|-------------|----------------------------------------|
| Frontend    | http://localhost:3000                  |
| Backend API | http://localhost:8787                  |
| Swagger UI  | http://localhost:8787/swagger-ui.html  |

```bash
# Stop
docker compose down

# Stop and wipe volumes (uploaded files)
docker compose down -v
```

---

## Local Development

### Prerequisites

| Tool    | Version |
|---------|---------|
| Java    | 21+     |
| Maven   | 3.9+    |
| Node.js | 18+     |

No database installation required.

### Backend

```bash
cd backend
mvn spring-boot:run
# Listening on http://localhost:8787
```

The backend reads environment variables (see table above). You can export them in your shell or set them in a `.env` file loaded by your IDE.

### Frontend

```bash
cd frontend
npm install
npm run dev
# Listening on http://localhost:5173
# /api requests are proxied to http://localhost:8787
```

---

## Environment Variables

All variables are optional — the defaults work for local development. Set them in `.env` (for Docker Compose) or export them in your shell.

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_BASE_URL` | `http://localhost:8787` | Public base URL used when building share links and QR codes |
| `FILE_STORAGE_PATH` | `./storage/files` | Directory where uploaded files are stored on disk |
| `METADATA_STORAGE_PATH` | `./storage/metadata` | Directory where metadata JSON files are stored |
| `DEFAULT_EXPIRATION_MINUTES` | `30` | Default file expiration time in minutes |
| `MAX_FILE_SIZE_MB` | `25` | Maximum accepted upload size in megabytes |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS-allowed origins |
| `CLEANUP_INTERVAL_MS` | `60000` | How often (ms) the background cleanup job runs |

---

## API Reference

### QR Code Generation

| Method | Path             | Description                                                      |
|--------|------------------|------------------------------------------------------------------|
| `POST` | `/api/qr/value`  | Generate a QR code image from a text value, URL, number, or JSON |

**Request body** (`application/json`):

```json
{
  "value": "https://example.com",
  "size": 300
}
```

**Response**: PNG image (`image/png`).

---

### File Sharing

| Method   | Path                                    | Description                                          |
|----------|-----------------------------------------|------------------------------------------------------|
| `POST`   | `/api/files?expirationMinutes=30`       | Upload a file; returns metadata + share URL          |
| `GET`    | `/api/files/{id}`                       | Get file metadata by database ID                     |
| `DELETE` | `/api/files/{id}`                       | Delete a file immediately                            |
| `GET`    | `/api/files/share/{token}`              | Stream the file (used by the scanned QR link)        |
| `GET`    | `/api/files/share/{token}/metadata`     | Get file metadata by access token (for the share page)|

**Upload response example**:

```json
{
  "id": "a1b2c3d4-...",
  "fileName": "my-document.pdf",
  "fileType": "application/pdf",
  "fileSize": 204800,
  "shareUrl": "http://localhost:8787/share/9xK3mP7qL2vN8sQa",
  "expiresAt": "2024-01-15T14:30:00Z",
  "downloadCount": 0
}
```

**Error responses**:

- `404 Not Found` — token does not exist, has expired, or the file has been deleted.
- `400 Bad Request` — missing file, invalid expiration value, or file exceeds size limit.

---

## Security Notes

- **No predictable IDs** — share URLs use a cryptographically random token (`SecureRandom`), not sequential IDs (`/share/1`, `/share/2`).
- **No original filenames as paths** — physical files are stored using a UUID as the filename. The original filename is kept only in the metadata JSON.
- **Controlled file access** — `FILE_STORAGE_PATH` is never exposed as a public static directory. All file reads go through `GET /api/files/share/{token}`, which validates the token, checks expiration, and sets the correct `Content-Type` and `Content-Disposition` headers.
- **Expiry enforcement** — expiration is stored in the metadata JSON file on disk and survives application restarts.
- **No database attack surface** — there is no database to SQL-inject. Metadata is read from isolated per-file JSON documents.

---

## Extending to S3 (or any object store)

The backend uses a `FileStorageService` interface to decouple file I/O from business logic. The included `LocalFileStorageService` writes to disk. To switch to S3:

1. Add the AWS SDK dependency to `backend/pom.xml`.
2. Create `S3FileStorageService` implementing `FileStorageService`.
3. Implement `store(MultipartFile, String uuid)` → upload to your bucket.
4. Implement `retrieve(String uuid)` → return an `InputStream` from S3.
5. Implement `delete(String uuid)` → call `s3Client.deleteObject(...)`.
6. Annotate your new class with `@Service` and `@Primary` (or remove the `@Service` from `LocalFileStorageService`).

No other code changes are required.

---

## LAN Mode

To share files with other devices on the same Wi-Fi network without deploying to a server:

1. Find your machine's LAN IP address (e.g. `192.168.1.42`).
2. Set `APP_BASE_URL` before starting:

```bash
# .env file or shell export
APP_BASE_URL=http://192.168.1.42:8787
ALLOWED_ORIGINS=http://192.168.1.42:3000
```

3. Start with Docker Compose:

```bash
docker compose up --build
```

QR codes will now embed `http://192.168.1.42:8787/share/{token}` as the share URL. Any phone on the same network that scans the code can open it directly in its browser.

> Make sure your firewall allows inbound TCP on ports 8787 and 3000 from your local subnet.

---

## Windows Desktop App (embedded WebView, self-contained)

The app can be packaged for Windows into a **self-contained desktop application**
that bundles its own Java runtime **and** a JavaFX WebView. The installed app
needs **no** separately installed Java, Maven, Node, npm, Docker, Python, Chrome,
or Edge, and it does **not** depend on a dev server (`npm run dev` /
`mvn spring-boot:run`).

The Windows app is a **real native window**, not a browser launch. On start it
opens an embedded JavaFX WebView that renders the **same** React production UI
served locally by the bundled Spring Boot backend — the identical components,
pages, API client, QR UI, share UI, diagnostics and error handling used by the
web app. Nothing is rewritten into Swing/JavaFX controls.

```
UniversalQRSharing.exe
   -> start local Spring Boot backend (bundled)
   -> detect runtime port (prefers 8787, scans 8787-8887 if busy)
   -> wait for /actuator/health
   -> open embedded WebView window
   -> load the existing React production UI
   -> ready
```

If the backend fails to start, the app does **not** silently exit — it shows a
native desktop error/diagnostic window.

```powershell
# 1. Build the fat jar (frontend bundled into the Spring Boot static resources)
.\windows\build-jar.ps1

# 2. Build the self-contained app-image (bundled JRE + JavaFX via jlink)
.\windows\build-app-image.ps1
#    -> release\windows\UniversalQRSharing\UniversalQRSharing.exe
```

The desktop host is selected at runtime by `-DQR_DESKTOP=true`, which the build
scripts pass via jpackage `--java-options`. The plain fat jar (no flag) still
runs as a **headless web server** — so the web and desktop modes share one jar
and one codebase without interfering with each other.

Launching the app initializes runtime config, creates its data directories,
selects an available port (preferring 8787), detects the active LAN interface,
starts the backend, serves the bundled SPA, and exposes
`GET /api/diagnostics` (version, port, interface, LAN IP, storage path/status,
active shares, cleanup status).

**Persistent user data** lives under `%LOCALAPPDATA%\UniversalQRSharing-Data`
(`storage/files`, `storage/temp`, `storage/metadata`, `logs`, `config`) —
**never** inside `Program Files` or the app directory — so upgrades preserve it.
Application **binaries** install separately under
`%LOCALAPPDATA%\UniversalQRSharing`, so uninstalling the app does not delete user
data.

### Real `.exe` installer

```powershell
.\windows\build-installer.ps1
#    -> release\windows\UniversalQRSharing-1.0.0.exe
#    (also published as release\UniversalQRSharing-Setup.exe)
```

| Artifact | Status |
| --- | --- |
| Self-contained app-image (embedded WebView) | **BUILT & VERIFIED** — EXE launches a native window; health UP; `/api/diagnostics` reports dynamic port + LAN IP; upload→share→download SHA-256 match; data root under `%LOCALAPPDATA%\UniversalQRSharing-Data`. |
| `.exe` installer | **BUILT & VERIFIED** — produced via jpackage + WiX v3.14; silent `/qn` install places the app under `%LOCALAPPDATA%\UniversalQRSharing`; installed app launches standalone and serves health UP. |

> `build-installer.ps1` auto-detects WiX v3.14 at its default install location
> (`C:\Program Files (x86)\WiX Toolset v3.14\bin`) and prepends it to `PATH`.
> No Chrome/Edge is required for the primary Windows UI.

See [docs/packaging.md](docs/packaging.md) for the full build and
[docs/troubleshooting.md](docs/troubleshooting.md) for firewall, port-conflict,
and QR-shows-localhost fixes.

---

## Android App (Capacitor)

The Android app is **not a second application**. It wraps the existing React
frontend with [Capacitor](https://capacitorjs.com/) and reuses the same UI,
the same shared axios client, and the same business logic. Android-specific
additions are a platform-aware API base URL (native points at the configured
LAN host), a native QR scanner (`@capacitor-mlkit/barcode-scanning`), and
Android permissions + cleartext config for http LAN sharing. The Android device
is a **client** of the desktop backend over the LAN; it runs no local backend.

```powershell
cd frontend
npm run build
npx cap sync android
cd android
.\gradlew assembleDebug        # requires JDK 17 + Android SDK
```

| Step | Status in this environment |
| --- | --- |
| Web build / lint / type-check | **VERIFIED** (`npm run build` exits 0 with Capacitor + scanner code) |
| `npx cap add android` / `cap sync` | **VERIFIED** (`android platform added!`, `Sync finished`) |
| APK Gradle build | **BUILT & VERIFIED** — `gradlew assembleDebug` → `BUILD SUCCESSFUL`, producing `app-debug.apk` (published as `release/UniversalQRSharing.apk`, 26.1 MB). `aapt2 dump badging` confirms package `com.universalqr.sharing`, perms INTERNET/CAMERA/ACCESS_NETWORK_STATE, the bundled shared React build, and the ML Kit scanner natives for all ABIs. |

> **Toolchain note.** This environment has only JDK 17 and JDK 25. Capacitor 7's
> `@capacitor/android` pins Java source/target to 21, while the AGP-8.7.2-pinned
> Gradle 8.11.1 daemon only runs on JDK ≤ 23 — so JDK 25 can't drive the daemon
> and plain JDK 17 can't emit source 21. `frontend/android/build.gradle` adds a
> small, reproducible `subprojects { afterEvaluate { … VERSION_17 } }` block that
> runs **after** Capacitor sets its level and pins the Android sub-modules back to
> Java 17, letting JDK 17 build the APK. No `node_modules` edits and no extra JDK
> install are required. Remove the block when a JDK 21–23 is available.

See [docs/android.md](docs/android.md) and
[android/BUILD-ANDROID.md](android/BUILD-ANDROID.md) for the exact APK build and
keystore signing steps.

---

## Project Structure

```
QR-CODE/
├── backend/                  # Spring Boot application
│   ├── src/main/java/
│   │   └── com/qrshare/
│   │       ├── controller/   # REST endpoints
│   │       ├── service/      # Business logic
│   │       ├── dto/          # Request / response objects
│   │       ├── config/       # CORS, app config, ObjectMapper
│   │       ├── exception/    # Global error handling
│   │       ├── storage/      # Plain Java POJOs (no ORM) +
│   │       │                 # FileStorageService + LocalImpl
│   │       │                 # MetadataStorageService + LocalImpl
│   │       └── util/         # Token generation, MIME helpers
│   └── src/main/resources/
│       └── application.yml
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Route-level pages
│   │   ├── hooks/            # Custom React hooks
│   │   ├── api/              # Axios API client
│   │   └── types/            # TypeScript interfaces
│   └── vite.config.ts        # Dev proxy: /api → :8787
├── storage/                  # Runtime data (git-ignored)
│   ├── files/                # Uploaded file blobs (UUID-named)
│   └── metadata/             # One JSON file per upload
├── docker-compose.yml
├── .env.example
├── FINAL-REPORT.md
└── README.md
```

---

## License

MIT
