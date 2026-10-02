README.md written to d:\PROJECT-FINAL\Kiro\QR-CODE\README.md

Sections included:
1. Project title with badges (Java, Spring Boot, React, TypeScript, Vite, Tailwind, PostgreSQL, Docker)
2. Project overview — Text/Value QR mode (client-side, embeds raw value) and File Share QR mode (upload → UUID storage → secure token → share URL → QR)
3. ASCII architecture diagram: Browser → React/Vite → Spring Boot → PostgreSQL + local disk storage
4. Quick start: docker compose up --build; URLs for frontend (:3000), backend API (:8080), Swagger UI
5. Local development instructions for backend (mvn spring-boot:run, requires PostgreSQL) and frontend (npm install && npm run dev, proxies /api to :8080)
6. Environment variables table: APP_BASE_URL, FILE_STORAGE_PATH, DEFAULT_EXPIRATION_MINUTES, MAX_FILE_SIZE_MB, DATABASE_URL, DATABASE_USERNAME, DATABASE_PASSWORD, ALLOWED_ORIGINS, CLEANUP_INTERVAL_MS
7. API documentation: POST /api/qr/value, POST /api/files, GET /api/files/{id}, DELETE /api/files/{id}, GET /api/files/share/{token}, GET /api/files/share/{token}/metadata
8. Security notes: token hashing (SHA-256, raw token never in DB), no predictable IDs, no original filenames as paths, controlled file access through backend endpoint
9. Extending to S3: replace LocalFileStorageService with S3-backed implementation of FileStorageService interface
10. LAN mode: set APP_BASE_URL and ALLOWED_ORIGINS to LAN IP so QR codes work on local network
