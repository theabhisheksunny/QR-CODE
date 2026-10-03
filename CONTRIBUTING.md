# Contributing

Thanks for working on Universal QR Code Generator & File Sharing. This guide gets a new
developer from a fresh clone to a running app and passing tests without needing to ask
questions.

## Prerequisites

| Tool    | Version | Notes                              |
|---------|---------|------------------------------------|
| Java    | 21+     | Backend targets Java 21            |
| Maven   | 3.9+    | Backend build and test runner      |
| Node.js | 18+     | Frontend build and dev server      |

No database is required. Docker is optional (see the README for the containerised path).

## Project layout

- `backend/` — Spring Boot 3 app. Binds to `0.0.0.0:8787`.
- `frontend/` — React 18 + Vite app. Dev server runs on `5173`.
- `e2e/` — Playwright end-to-end tests. `e2e/demo/` holds a standalone live-demo script.
- `test-files/` — binary and text fixtures used by the e2e tests.

> The backend port is **8787** (not 8080). Keep this in mind when adding config or tests.

## Running in development

Dev mode runs the backend and the Vite dev server separately with hot reload. Vite proxies
`/api` requests to the backend.

```powershell
./start-dev.ps1
```

This opens the backend in a new PowerShell window (`mvn spring-boot:run`) and starts the
frontend dev server in the current window.

- Frontend: http://localhost:5173
- Backend: http://localhost:8787
- API docs: http://localhost:8787/swagger-ui/index.html

To run the pieces manually:

```powershell
# Backend
cd backend
mvn spring-boot:run

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Running in LAN mode

LAN mode builds the frontend, bundles it into the backend's static resources, and serves
everything from the backend bound to `0.0.0.0:8787` so other devices on the same network
can reach it.

```powershell
./start-lan.ps1
```

- Open locally at http://localhost:8787
- LAN devices connect at http://&lt;your-LAN-IP&gt;:8787

Set `APP_BASE_URL` to your LAN IP (e.g. `http://192.168.1.42:8787`) so generated QR codes
embed a URL other devices can reach. See the README Configuration table for all variables.

## Running the tests

### Backend (JUnit 5 + Mockito)

```powershell
cd backend
mvn test
```

### Frontend build and lint

```powershell
cd frontend
npm run build   # TypeScript compile + Vite build
npm run lint    # ESLint, 0 warnings allowed
```

### End-to-end (Playwright)

The e2e tests exercise a running stack. Start the app first (dev or LAN mode), then:

```powershell
cd e2e
npx playwright test
```

Tests read their target URLs from environment variables with sensible defaults:

- `API_URL` — backend base URL (default `http://localhost:8787`)
- `BASE_URL` — frontend base URL (default `http://localhost:5173`)

To type-check the e2e suite without a running stack:

```powershell
cd e2e
npx tsc --noEmit
```

## Code conventions

### Backend (Java / Spring Boot)

- Use Lombok `@RequiredArgsConstructor` for constructor injection.
- Log with SLF4J via `@Slf4j`. Do not use `System.out.println`.
- Bind configuration with `@ConfigurationProperties` (see `AppProperties`).
- Keep storage behind an interface with a `Local*` implementation (see the `storage`
  package). This is the extension point for alternative backends.

### Frontend (React / TypeScript)

- Functional components with hooks.
- Tailwind CSS for styling.
- `react-hot-toast` for notifications, `lucide-react` for icons.
- Use the shared axios client; it honours a localStorage-based base URL override for LAN mode.

## Extending the storage backend

File and metadata persistence is decoupled through interfaces in the backend `storage`
package (`FileStorageService`, `MetadataStorageService`), each with a local disk
implementation. To add a new backend (for example S3):

1. Create a new class implementing `FileStorageService`.
2. Implement `store`, `retrieve`, and `delete`.
3. Register it as the active bean (`@Service` + `@Primary`, or remove `@Service` from the
   local implementation).

No controller or service changes are required — business logic depends only on the interface.

## Before you open a pull request

- `cd backend && mvn test` passes.
- `cd frontend && npm run build` exits 0.
- `cd frontend && npm run lint` exits 0 with no warnings.
- `cd e2e && npx tsc --noEmit` compiles cleanly.
- No new dependencies without a clear justification.
