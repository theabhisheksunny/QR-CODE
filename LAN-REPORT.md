# LAN-REPORT: Local-Network-First Universal QR Share

## Architecture Overview

Device A runs this application and acts as the server. Device B (and any other device on the same network) accesses files directly from Device A — no internet, no cloud, no third-party server required.

```
                  DEVICE A (your machine)
        ┌──────────────────────────────────┐
        │  Browser UI (React SPA)          │
        │       ↓                          │
        │  Spring Boot Backend (port 8787) │
        │       ↓                          │
        │  ./storage/files/ (local disk)   │
        │       ↓                          │
        │  QR Generator (ZXing)            │
        └────────────┬─────────────────────┘
                     │
              Local Network (Wi-Fi / LAN / Hotspot)
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
      Device B    Device C    Device D
  (scan QR →   (scan QR →   (scan QR →
   open file)   open file)   open file)
```

## How to Run

### Production (LAN Mode)
```powershell
.\start-lan.ps1
```
This script:
1. Builds the React frontend with `npm run build`
2. Copies `frontend/dist/` into `backend/src/main/resources/static/`
3. Starts the Spring Boot server with `mvn spring-boot:run`

The server binds to `0.0.0.0:8787` — accessible from all network interfaces.

### Development (Hot Reload)
```powershell
.\start-dev.ps1
```
Opens two windows: backend on `localhost:8787`, Vite dev server on `localhost:5173`.
The Vite proxy forwards `/api` requests to `localhost:8787`.

## How the QR URL Is Built

The `NetworkService` enumerates all active network interfaces at runtime.
It scores each IPv4 address and picks the best LAN IP:

| Range           | Score |
|-----------------|-------|
| 192.168.x.x     | 10    |
| 10.x.x.x        | 8     |
| 172.16-31.x.x   | 6     |
| Other non-APIPA | 1     |
| 169.254.x.x     | skip  |

The share URL embedded in the QR code is:
```
http://<LAN-IP>:8787/share/<token>
```
Example:
```
http://192.168.1.25:8787/share/A8K29
```

The token is the last path segment and is generated using a secure random token generator (TokenUtil).

## Detected LAN IP

[detected at runtime — check `GET /api/network/info` after starting the server]

Example check:
```powershell
Invoke-RestMethod "http://localhost:8787/api/network/info"
```

Expected response:
```json
{
  "localIp": "192.168.1.25",
  "port": 8787,
  "shareBaseUrl": "http://192.168.1.25:8787",
  "allInterfaces": [
    { "name": "Wi-Fi", "displayName": "Wi-Fi", "ipAddress": "192.168.1.25", "preferred": true }
  ]
}
```

## How Device B Accesses a File

1. Device A uploads a file via the web UI
2. The backend stores the file at `./storage/files/<uuid>` and creates metadata
3. A share URL is generated: `http://192.168.1.25:8787/share/<token>`
4. A QR code encoding this URL is returned to the UI
5. Device B's camera scans the QR — browser opens the URL
6. The React SPA loads from Device A at `/share/<token>` (SPA route)
7. The SPA calls `GET /api/files/share/<token>/metadata` for file info
8. Device B clicks Download → browser fetches `GET /api/files/share/<token>` — streamed directly from Device A

No internet request is made at any point.

## Network Interface Selection

Visit **Settings → Network** in the UI to:
- View the currently detected LAN IP
- See all available network interfaces
- Select a different interface (e.g., switch from Wi-Fi to Ethernet or hotspot)

This calls `POST /api/network/select` with the chosen IP and persists the choice for the current server session.

## File Storage Configuration

Set the storage root with an environment variable:
```powershell
$env:FILE_STORAGE_PATH = "D:\UniversalQR\files"
$env:METADATA_STORAGE_PATH = "D:\UniversalQR\metadata"
mvn spring-boot:run
```

Linux/macOS:
```bash
FILE_STORAGE_PATH=/opt/universal-qr/files \
METADATA_STORAGE_PATH=/opt/universal-qr/metadata \
mvn spring-boot:run
```

Default (relative to working directory):
```
./storage/files/
./storage/metadata/
```

## Security Notes

- Share tokens are cryptographically random (32-char URL-safe base64)
- Tokens expire after the configured duration (default: 30 minutes)
- Files are deleted on expiry or when the user clicks Delete
- The application has no authentication — intended for trusted local networks only
- For public/internet sharing, put behind a reverse proxy with TLS

## Known Limitations

- Both devices must be on the same LAN, Wi-Fi network, or hotspot
- No HTTPS — traffic is in plaintext on the local network
- The LAN IP changes if Device A switches networks; new QR needed after reconnecting
- No mDNS — `universalqr.local` discovery is not implemented
- The IP override (Settings → Network) resets when the backend restarts
- File transfers are limited to `MAX_FILE_SIZE_MB` (default: 25 MB)
