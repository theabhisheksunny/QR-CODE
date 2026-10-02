# QR Code Generator & Temporary File Sharing

![Java](https://img.shields.io/badge/Java-21-orange?logo=openjdk)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.x-brightgreen?logo=springboot)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)

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
                             │  HTTP / REST  (proxied /api → :8080)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Spring Boot 3 (port 8080)                     │
│                                                                 │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│   │controller│→ │ service  │→ │repository│→ │  PostgreSQL │  │
│   └──────────┘  └────┬─────┘  └──────────┘  │  (port 5432)│  │
│                       │                       └─────────────┘  │
│                       │ FileStorageService                      │
│                       ▼                                         │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │          Local Disk  /data/temp-files/                   │ │
│   │          (Docker volume: file_storage)                   │ │
│   │                                                          │ │
│   │  550e8400-e29b-41d4-a716-446655440000   ← physical file  │ │
│   │  8f7c3a21-bc44-4f1e-9d3a-123456789abc   ← physical file  │ │
│   └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start (Docker Compose)

> Requires Docker Desktop with Compose v2.

```bash
git clone https://github.com/your-org/QR-CODE.git
cd QR-CODE

# (Optional) override base URL — needed for LAN / production use
cp .env.example .env

docker compose up --build
```

| Service     | URL                                    |
|-------------|----------------------------------------|
| Frontend    | http://localhost:3000                  |
| Backend API | http://localhost:8080                  |
| Swagger UI  | http://localhost:8080/swagger-ui.html  |

To stop and remove containers:

```bash
docker compose down
```

To also wipe persisted volumes (database + uploaded files):

```bash
docker compose down -v
```

---

## Local Development

### Prerequisites

| Tool        | Version   |
|-------------|-----------|
| Java        | 21+       |
| Maven       | 3.9+      |
| Node.js     | 18+       |
| PostgreSQL  | 15 or 16  |

### Backend

Create the database first:

```sql
CREATE DATABASE qrshare;
CREATE USER qrshare WITH PASSWORD 'qrshare';
GRANT ALL PRIVILEGES ON DATABASE qrshare TO qrshare;
```

Then run:

```bash
cd backend
mvn spring-boot:run
# Listening on http://localhost:8080
```

The backend reads environment variables (see table below). You can export them in your shell or set them in a `.env` file loaded by your IDE.

### Frontend

```bash
cd frontend
npm install
npm run dev
# Listening on http://localhost:5173
# /api requests are proxied to http://localhost:8080
```

---

## Environment Variables

All variables are optional — the defaults work for local development. Set them in `.env` (for Docker Compose) or export them in your shell (for local runs).

| Variable                    | Default                                      | Description                                                                 |
|-----------------------------|----------------------------------------------|-----------------------------------------------------------------------------|
| `APP_BASE_URL`              | `http://localhost:8080`                      | Public base URL used when building share links embedded in QR codes         |
| `FILE_STORAGE_PATH`         | `./temp-files`                               | Directory where uploaded files are stored on disk                           |
| `DEFAULT_EXPIRATION_MINUTES`| `30`                                         | Default file expiration time in minutes when the user does not pick one     |
| `MAX_FILE_SIZE_MB`          | `25`                                         | Maximum accepted upload size in megabytes                                   |
| `DATABASE_URL`              | `jdbc:postgresql://localhost:5432/qrshare`   | JDBC connection URL for PostgreSQL                                          |
| `DATABASE_USERNAME`         | `qrshare`                                    | PostgreSQL username                                                         |
| `DATABASE_PASSWORD`         | `qrshare`                                    | PostgreSQL password                                                         |
| `ALLOWED_ORIGINS`           | `http://localhost:5173`                      | Comma-separated origins allowed by CORS (use frontend URL in production)    |
| `CLEANUP_INTERVAL_MS`       | `60000`                                      | How often (milliseconds) the scheduled cleanup job runs to delete expired files |

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
  "shareUrl": "http://localhost:8080/api/files/share/9xK3mP7qL2vN8sQa",
  "expiresAt": "2024-01-15T14:30:00Z",
  "downloadCount": 0
}
```

**Error responses**:

- `404 Not Found` — token does not exist, has expired, or the file has been deleted.
- `400 Bad Request` — missing file, invalid expiration value, or file exceeds size limit.

---

## Security Notes

- **Token hashing** — the raw access token is never stored in the database. Only a SHA-256 hash is persisted. The raw token lives only in the share URL and is never logged.
- **No predictable IDs** — share URLs use a cryptographically random token (`SecureRandom`), not sequential database IDs (`/share/1`, `/share/2`).
- **No original filenames as paths** — physical files are stored using a UUID as the filename. The original filename is only kept in the database as metadata.
- **Controlled file access** — `FILE_STORAGE_PATH` is never exposed as a public static directory. All file reads go through `GET /api/files/share/{token}`, which validates the token, checks expiration, and sets the correct `Content-Type` and `Content-Disposition` headers.
- **Expiry enforcement** — expiration is stored in PostgreSQL, not in memory, so it survives application restarts.

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
APP_BASE_URL=http://192.168.1.42:8080
ALLOWED_ORIGINS=http://192.168.1.42:3000
```

3. Start with Docker Compose:

```bash
docker compose up --build
```

QR codes will now embed `http://192.168.1.42:8080/api/files/share/{token}` as the share URL. Any phone on the same network that scans the code can open it directly in its browser.

> Make sure your firewall allows inbound TCP on ports 8080 and 3000 from your local subnet.

---

## Project Structure

```
QR-CODE/
├── backend/                  # Spring Boot application
│   ├── src/main/java/
│   │   └── com/qrshare/
│   │       ├── controller/   # REST endpoints
│   │       ├── service/      # Business logic
│   │       ├── repository/   # Spring Data JPA
│   │       ├── model/        # JPA entities
│   │       ├── dto/          # Request / response objects
│   │       ├── config/       # CORS, security, app config
│   │       ├── exception/    # Global error handling
│   │       ├── storage/      # FileStorageService + LocalImpl
│   │       └── util/         # Token generation, MIME helpers
│   └── src/main/resources/
│       ├── application.yml
│       └── db/migration/     # Flyway SQL migrations
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Route-level pages
│   │   ├── hooks/            # Custom React hooks
│   │   ├── api/              # Axios API client
│   │   └── types/            # TypeScript interfaces
│   └── vite.config.ts        # Dev proxy: /api → :8080
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## License

MIT
