# Implementation Plan: Local-Network-First LAN QR Sharing

## Summary

Redesign the Spring Boot + React/Vite application so Device A hosts everything, generates QR
codes containing its real LAN IP, and Device B accesses files directly over Wi-Fi / hotspot —
zero internet, zero cloud, zero PostgreSQL.

---

## Key Conventions Discovered

- **Build commands**: backend `mvn package -f backend/pom.xml`, frontend `npm run build` (inside `frontend/`)
- **Test commands**: backend `mvn test -f backend/pom.xml`, e2e `npx playwright test` (inside `e2e/`)
- **Backend**: Spring Boot 3.2, Java 21, Lombok, no DB (local JSON files), port 8080 today → 8787 after this work
- **Frontend**: Vite proxy `/api` → `http://localhost:8080` today
- **SPA routes** in `App.tsx`: `/`, `/text`, `/file`, `/share/:token`, `/history`, `/settings`
- **Download button** in `FileCard.tsx` and `SharePage.tsx` uses `/api/files/share/<token>` (API route, relative)
- **`getShareMetadata`** in `files.ts` calls `/api/files/share/<token>/metadata`
- **`buildShareUrl`** in `FileShareService` currently returns `appProperties.getBaseUrl() + "/api/files/share/" + rawToken`
- **`ShareController.GET /share/{token}`** currently does a 302 redirect to `/api/files/share/{token}` — this conflicts with the SPA; it must be removed
- **Existing integration tests** extract the `rawToken` by calling `shareUrl.substring(shareUrl.lastIndexOf('/') + 1)` — the token is always the last path segment
- **CORS**: currently uses `allowedOrigins(...)` with credentials=false; LAN devices on different origins need `allowedOriginPatterns("*")`
- **Windows PowerShell**: scripts must use semicolons between commands, not `&&`

---

## Gotchas

1. **`FileShareServiceTest`** mocks `appProperties.getBaseUrl()`. After injecting `NetworkService`, the mock must stub `networkService.getShareBaseUrl(...)` instead. The test's assertion `assertThat(response.getShareUrl()).isNotBlank()` still passes as long as `networkService` mock returns any non-blank string.
2. **`ShareControllerIntegrationTest`** asserts `shareUrl` matches `/api/files/share/` and extracts the token as the last segment. The new `shareUrl` will be `http://<LAN-IP>:8787/share/<token>` — the last segment is still the token, but the pattern assertion `data.shareUrl.match(/\/api\/files\/share\//)` in the e2e helper will break. The existing integration test in `ShareControllerIntegrationTest.java` extracts via `shareUrl.substring(shareUrl.lastIndexOf('/') + 1)` so that remains valid. Update the assertion in `ShareControllerIntegrationTest` to accept the new format.
3. **SPA static serving**: Spring Boot serves static content from `classpath:/static/`. The `SpaController` forwards unmapped routes to `/index.html`. The build script must copy `frontend/dist` to `backend/src/main/resources/static` before `mvn package`. In dev mode the Vite proxy is used instead.
4. **`SecurityConfig`** uses `anyRequest().authenticated()` for paths that don't match the permit list. Adding `"/"` and `"/**"` to `permitAll` handles static assets. Alternatively, add all static extensions. The simplest safe approach: extend the `requestMatchers` list to include `"/"`, `"/index.html"`, `"/assets/**"`, `"/vite.svg"`.
5. **`NetworkService.getLocalIpAddress()`** is called at request time. On Windows, this may return a 169.254.x.x (APIPA/link-local) address if the machine has no active LAN connection. The service must explicitly skip 169.254.x.x ranges in addition to loopback. Last fallback is `127.0.0.1`.
6. **`AppProperties`** needs a `serverPort` field. Spring reads `server.port` separately from `app.*`, so bind the port from the environment using `@Value("${server.port:8787}")` directly in `NetworkService` — injecting `AppProperties.serverPort` requires adding the field AND the YAML key `app.server-port`, which would be redundant. Use `@Value` in `NetworkService` instead, keeping `AppProperties` clean.
7. **`application-test.yml`**: tests run with `@ActiveProfiles("test")`. After the refactor `NetworkService` must also be available in tests. The test profile needs no extra IP config — `NetworkService` will fall back to `127.0.0.1` in environments with no active LAN, which is fine for unit/integration tests.
8. **e2e `helpers.ts`** has `API_URL = process.env.API_URL || 'http://localhost:8080'`. The new port is 8787; update the default. The `playwright.config.ts` `baseURL` currently points at `localhost:5173` (Vite dev server), but the LAN e2e tests target `http://localhost:8787` directly (static served by Spring Boot).

---

## Implementation Plan

- [ ] 1. **Update `application.yml`** — bind to all interfaces on port 8787, open CORS origins.

  Change `server.port` from `8080` to `${SERVER_PORT:8787}`.
  Add `server.address: 0.0.0.0` immediately below `server.port`.
  Change `app.allowed-origins` default from `http://localhost:5173` to `*`.
  Keep `app.base-url` as-is (it becomes a fallback / legacy field; `NetworkService` supersedes it).

  Files: `backend/src/main/resources/application.yml`

  Verify: `cd backend ; mvn compile -q` — no compilation errors.

---

- [ ] 2. **Create `NetworkInterfaceInfo.java`** — data record for a usable network interface.

  Create `com/qrshare/service/NetworkInterfaceInfo.java` as a Lombok `@Data @AllArgsConstructor @NoArgsConstructor` class (NOT a Java record — Lombok works better with Spring serialization):
  ```
  String name;         // e.g. "eth0", "Wi-Fi"
  String displayName;  // e.g. "Wi-Fi"
  String ipAddress;    // e.g. "192.168.1.25"
  boolean preferred;   // true if this is the auto-selected interface
  ```

  Files: `backend/src/main/java/com/qrshare/service/NetworkInterfaceInfo.java`

  Verify: `cd backend ; mvn compile -q` — compiles cleanly.

---

- [ ] 3. **Create `NetworkService.java`** — detects LAN IP, enumerates interfaces, builds share base URL.

  Create `com/qrshare/service/NetworkService.java` as a `@Service`. Inject `@Value("${server.port:8787}") int serverPort`.

  Maintain an `AtomicReference<String> ipOverride = new AtomicReference<>(null)`.

  **`getLocalIpAddress()`**: if `ipOverride.get() != null`, return it. Otherwise enumerate
  `NetworkInterface.getNetworkInterfaces()`, skip interfaces that are loopback, down, virtual
  (name starts with `vmnet`, `vboxnet`, `docker`, `br-`, `virbr`), or have no IPv4 address.
  Score each candidate: 10 points for `192.168.x.x`, 8 for `10.x.x.x`, 6 for `172.16-31.x.x`,
  −5 for `169.254.x.x` (APIPA — must be excluded, not just scored low). Return the highest-scoring
  IPv4 address, or any non-loopback IPv4 if no scored address found, or `127.0.0.1` as last resort.

  **`getAllInterfaces()`**: returns `List<NetworkInterfaceInfo>` of all usable interfaces (same
  filtering rules), with `preferred=true` on the one that would be returned by `getLocalIpAddress()`.

  **`getShareBaseUrl()`** (no args, uses `serverPort`): returns `"http://" + getLocalIpAddress() + ":" + serverPort`.

  **`setIpOverride(String ip)`**: sets `ipOverride`. Accepts `null` to clear.

  Files: `backend/src/main/java/com/qrshare/service/NetworkService.java`

  Verify: `cd backend ; mvn compile -q` — compiles cleanly.

---

- [ ] 4. **Create `NetworkController.java`** — REST endpoints for network info and interface selection.

  Create `com/qrshare/controller/NetworkController.java` as `@RestController @RequestMapping("/api/network")`. Inject `NetworkService`.

  ```
  GET  /api/network/info        → { localIp, port, shareBaseUrl, allInterfaces }
  GET  /api/network/interfaces  → List<NetworkInterfaceInfo>
  POST /api/network/select      → body: { "ipAddress": "..." }
                                  calls networkService.setIpOverride(body.ipAddress)
                                  returns updated network info (same shape as /info)
  ```

  Define an inner record or DTO `NetworkInfoResponse` with `String localIp, int port, String shareBaseUrl, List<NetworkInterfaceInfo> allInterfaces`.
  Define an inner record `SelectRequest` with `String ipAddress`.

  Files: `backend/src/main/java/com/qrshare/controller/NetworkController.java`

  Verify: `cd backend ; mvn compile -q` — compiles cleanly.

---

- [ ] 5. **Modify `FileShareService.java`** — use `NetworkService` to build share URLs.

  Add `private final NetworkService networkService;` field (Lombok `@RequiredArgsConstructor` picks it up automatically).

  Change `buildShareUrl(String rawToken)` from:
  ```java
  return appProperties.getBaseUrl() + "/api/files/share/" + rawToken;
  ```
  to:
  ```java
  return networkService.getShareBaseUrl() + "/share/" + rawToken;
  ```

  The share URL now points at the SPA route `/share/<token>` (not the API endpoint). The API
  endpoint `/api/files/share/<token>` is still used by the frontend's download button via a
  relative path — this is correct and unaffected.

  Files: `backend/src/main/java/com/qrshare/service/FileShareService.java`

  Verify: `cd backend ; mvn compile -q` — compiles cleanly.

---

- [ ] 6. **Remove the 302 redirect from `ShareController.java`** — delete the conflicting `/share/{token}` endpoint.

  Delete (or comment out) the `redirectToFileEndpoint` method and its `@GetMapping("/share/{token}")` annotation entirely. The `SpaController` (step 7) handles this path now.

  The `streamFile` method at `GET /api/files/share/{token}` is KEPT unchanged.

  Files: `backend/src/main/java/com/qrshare/controller/ShareController.java`

  Verify: `cd backend ; mvn compile -q` — compiles cleanly.

---

- [ ] 7. **Create `SpaController.java`** — forward SPA routes to `index.html`.

  Create `com/qrshare/controller/SpaController.java` as `@Controller` (not `@RestController`).

  Map the following paths explicitly with `@GetMapping` returning `"forward:/index.html"`:
  ```
  "/"
  "/text"
  "/file"
  "/history"
  "/settings"
  "/share/{token}"
  ```

  Use a single method with `@GetMapping({"/", "/text", "/file", "/history", "/settings"})` for the fixed routes, and a second method `@GetMapping("/share/{token}")` with a `@PathVariable String token` (unused) for share routes.

  Do NOT use a catch-all `/**` mapping — it would conflict with Spring's default static resource handler and the API controllers. The explicit list avoids ambiguity.

  Files: `backend/src/main/java/com/qrshare/controller/SpaController.java`

  Verify: `cd backend ; mvn compile -q` — compiles cleanly.

---

- [ ] 8. **Update `CorsConfig.java`** — allow all origins for LAN devices.

  Change the `addCorsMappings` method to use `allowedOriginPatterns("*")` instead of `allowedOrigins(origins)`.
  `allowedOriginPatterns("*")` is required when LAN devices (e.g. `http://192.168.1.42:8787`) are
  not known at config time. When `allowCredentials` is false (current setting), `allowedOrigins("*")`
  would also work, but `allowedOriginPatterns("*")` is safer and forward-compatible.

  Remove the `String[] origins = appProperties.getAllowedOrigins().split(",");` line and replace
  the whole chain with:
  ```java
  registry.addMapping("/api/**")
      .allowedOriginPatterns("*")
      .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
      .allowedHeaders("*")
      .allowCredentials(false);
  ```

  The `appProperties` injection can be kept or removed (keep it to avoid changing the constructor
  signature if other code uses it).

  Files: `backend/src/main/java/com/qrshare/config/CorsConfig.java`

  Verify: `cd backend ; mvn compile -q` — compiles cleanly.

---

- [ ] 9. **Update `SecurityConfig.java`** — permit static asset paths.

  Add to the `requestMatchers(...).permitAll()` list:
  ```
  "/"
  "/index.html"
  "/assets/**"
  "/vite.svg"
  "/favicon.ico"
  ```

  This allows Device B's browser to load the React app's static bundle without authentication.
  `"/api/**"` and `"/share/**"` are already permitted.

  Files: `backend/src/main/java/com/qrshare/config/SecurityConfig.java`

  Verify: `cd backend ; mvn compile -q` — compiles cleanly.

---

- [ ] 10. **Update `application-test.yml`** — update test profile to match new defaults.

  Change `app.base-url` from `http://localhost:8080` to `http://localhost:8787`.
  Change `app.allowed-origins` from `http://localhost:5173` to `*`.
  Do NOT add a `server.port` override in the test profile — tests use `RANDOM_PORT`.

  Files: `backend/src/test/resources/application-test.yml`

  Verify: `cd backend ; mvn compile -q` — compiles cleanly.

---

- [ ] 11. **Update `FileShareServiceTest.java`** — adapt unit test for new `NetworkService` dependency.

  Add `@Mock private NetworkService networkService;` field alongside existing mocks.
  In `testUploadFile_success()`, add:
  ```java
  when(networkService.getShareBaseUrl()).thenReturn("http://192.168.1.100:8787");
  ```
  Remove or keep the `when(appProperties.getBaseUrl()).thenReturn(...)` stub — `buildShareUrl` no
  longer calls `appProperties.getBaseUrl()`, so removing it avoids a Mockito "unnecessary stubbing"
  warning (the class uses `@MockitoSettings(strictness = Strictness.LENIENT)` so it won't fail, but
  clean it up anyway).
  Update the assertion from `assertThat(response.getShareUrl()).isNotBlank()` to:
  ```java
  assertThat(response.getShareUrl()).contains("/share/");
  assertThat(response.getShareUrl()).doesNotContain("/api/files/share/");
  ```

  Files: `backend/src/test/java/com/qrshare/service/FileShareServiceTest.java`

  Verify: `cd backend ; mvn test -pl . -Dtest=FileShareServiceTest` — all tests pass.

---

- [ ] 12. **Update `ShareControllerIntegrationTest.java`** — fix the shareUrl format assertion.

  The integration test in `testStreamFile_afterUpload_returnsCorrectContentType` asserts:
  ```java
  assertThat(shareUrl).isNotBlank();
  ```
  and extracts `rawToken = shareUrl.substring(shareUrl.lastIndexOf('/') + 1)`.

  Both of these still hold with the new `http://192.168.x.x:8787/share/<token>` format. However,
  if there is a hardcoded assertion like `assertThat(shareUrl).contains("/api/files/share/")`,
  remove that check and replace it with `assertThat(shareUrl).contains("/share/")`.

  Also update `application-test.yml` reference: the test profile still uses `base-url: http://localhost:8787` —  the `NetworkService` in tests will return `127.0.0.1` (no LAN), so `shareUrl` will be
  `http://127.0.0.1:8787/share/<token>`. The token extraction `shareUrl.lastIndexOf('/')` still works.

  Files: `backend/src/test/java/com/qrshare/controller/ShareControllerIntegrationTest.java`

  Verify: `cd backend ; mvn test -pl . -Dtest=ShareControllerIntegrationTest` — all tests pass.

---

- [ ] 13. **Run full backend test suite** — confirm no regressions.

  Run all backend tests after the backend changes above are complete.

  Files: (none — verification only)

  Verify: `cd backend ; mvn test` — all tests green. Any new failures must be fixed before proceeding.

---

- [ ] 14. **Update `vite.config.ts`** — point dev proxy at port 8787.

  Change the proxy target from `http://localhost:8080` to `http://localhost:8787`.

  Files: `frontend/vite.config.ts`

  Verify: `cd frontend ; npm run build` — TypeScript compiles, Vite builds without error.

---

- [ ] 15. **Update `types/index.ts`** — add network types.

  Append two new interfaces at the bottom of the file:
  ```typescript
  export interface NetworkInterfaceInfo {
    name: string;
    displayName: string;
    ipAddress: string;
    preferred: boolean;
  }

  export interface NetworkInfo {
    localIp: string;
    port: number;
    shareBaseUrl: string;
    allInterfaces: NetworkInterfaceInfo[];
  }
  ```

  Note: the Java field is `preferred` (boolean), not `isPreferred` — Jackson serializes boolean
  getters named `isX` as `x` by default, so the JSON key will be `preferred`. Use `preferred`
  in the TypeScript interface.

  Files: `frontend/src/types/index.ts`

  Verify: `cd frontend ; npm run build` — TypeScript compiles without error.

---

- [ ] 16. **Create `src/api/network.ts`** — network API client functions.

  Create `frontend/src/api/network.ts`:
  ```typescript
  import client from './client';
  import { NetworkInfo, NetworkInterfaceInfo } from '../types';

  export const getNetworkInfo = async (): Promise<NetworkInfo> => {
    const response = await client.get<NetworkInfo>('/api/network/info');
    return response.data;
  };

  export const getNetworkInterfaces = async (): Promise<NetworkInterfaceInfo[]> => {
    const response = await client.get<NetworkInterfaceInfo[]>('/api/network/interfaces');
    return response.data;
  };

  export const selectNetworkInterface = async (ipAddress: string): Promise<NetworkInfo> => {
    const response = await client.post<NetworkInfo>('/api/network/select', { ipAddress });
    return response.data;
  };
  ```

  Files: `frontend/src/api/network.ts`

  Verify: `cd frontend ; npm run build` — compiles without error.

---

- [ ] 17. **Create `src/components/NetworkStatusBar.tsx`** — shows live LAN IP with copy button.

  Create `frontend/src/components/NetworkStatusBar.tsx`. On mount, call `getNetworkInfo()`.
  Display: `🌐 Sharing on LAN: http://192.168.1.25:8787` with a copy-to-clipboard button
  (using `navigator.clipboard.writeText`). Show a loading spinner during fetch; show a subtle
  warning text `(no LAN detected)` if `localIp === '127.0.0.1'`. On error, show nothing
  (fail silently — this is an enhancement, not core functionality).

  Use Tailwind classes consistent with the rest of the app (look at `FileCard.tsx` for patterns:
  `bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-3`).
  Use `lucide-react`'s `Wifi`, `Copy`, `Check` icons.

  Files: `frontend/src/components/NetworkStatusBar.tsx`

  Verify: `cd frontend ; npm run build` — compiles without error.

---

- [ ] 18. **Update `HomePage.tsx`** — render `<NetworkStatusBar />` below the heading.

  Import `NetworkStatusBar` from `../components/NetworkStatusBar` and render it between the
  `<div className="text-center">` heading block and the grid of action cards.

  Files: `frontend/src/pages/HomePage.tsx`

  Verify: `cd frontend ; npm run build` — compiles without error.

---

- [ ] 19. **Update `SettingsPage.tsx`** — add Network section with interface selector.

  Add a new card section (above or below the existing API Base URL card) titled "Network".
  The section should:
  1. On mount, call `getNetworkInfo()` and store the result in state.
  2. Display current LAN IP and port as a read-only info row.
  3. If `allInterfaces.length > 1`, render radio buttons for each interface (show `displayName`
     and `ipAddress`). On radio change, call `selectNetworkInterface(ipAddress)` and update state.
     Show `toast.success('Interface updated')` on success.
  4. Show a loading skeleton and a subtle error state.

  Also update the existing API Base URL input placeholder from `http://localhost:8080` to
  `http://localhost:8787`.

  Files: `frontend/src/pages/SettingsPage.tsx`

  Verify: `cd frontend ; npm run build` — compiles without error.

---

- [ ] 20. **Run full frontend build** — confirm no TypeScript or Vite errors.

  This is a consolidation verification step after all frontend changes.

  Files: (none — verification only)

  Verify: `cd frontend ; npm run build` — exits 0 with no errors or warnings.

---

- [ ] 21. **Create `start-lan.ps1`** — production LAN startup script.

  Create `d:\PROJECT-FINAL\Kiro\QR-CODE\start-lan.ps1`:

  ```powershell
  # start-lan.ps1 — Build frontend, bundle into backend, start backend on LAN
  Set-StrictMode -Version Latest
  $ErrorActionPreference = 'Stop'

  $Root = $PSScriptRoot

  Write-Host "=== Building frontend ===" -ForegroundColor Cyan
  Set-Location "$Root\frontend"
  npm install
  npm run build

  Write-Host "=== Copying dist to backend static ===" -ForegroundColor Cyan
  $StaticDir = "$Root\backend\src\main\resources\static"
  if (Test-Path $StaticDir) { Remove-Item $StaticDir -Recurse -Force }
  Copy-Item "$Root\frontend\dist" $StaticDir -Recurse

  Write-Host "=== Building backend ===" -ForegroundColor Cyan
  Set-Location "$Root\backend"
  mvn package -DskipTests -q

  Write-Host "=== Starting backend on 0.0.0.0:8787 ===" -ForegroundColor Green
  $Jar = Get-ChildItem "$Root\backend\target\*.jar" | Where-Object { $_.Name -notmatch "sources" } | Select-Object -First 1
  Write-Host "Open http://localhost:8787 in your browser" -ForegroundColor Green
  java -jar $Jar.FullName
  ```

  Files: `start-lan.ps1`

  Verify: Script is valid PowerShell syntax — `pwsh -NoLogo -NonInteractive -Command "& { . 'd:\PROJECT-FINAL\Kiro\QR-CODE\start-lan.ps1' }" -WhatIf` or simply `Get-Content start-lan.ps1` and review. Full end-to-end run verified in step 23.

---

- [ ] 22. **Create `start-dev.ps1`** — development mode script (two terminals).

  Create `d:\PROJECT-FINAL\Kiro\QR-CODE\start-dev.ps1`:

  ```powershell
  # start-dev.ps1 — Start backend and frontend dev server in separate windows
  $Root = $PSScriptRoot

  Write-Host "Starting backend (port 8787) ..." -ForegroundColor Cyan
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\backend' ; mvn spring-boot:run"

  Write-Host "Starting frontend dev server (port 5173) ..." -ForegroundColor Cyan
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\frontend' ; npm run dev"

  Write-Host "Backend:  http://localhost:8787" -ForegroundColor Green
  Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
  Write-Host "API docs: http://localhost:8787/swagger-ui/index.html" -ForegroundColor Green
  ```

  Files: `start-dev.ps1`

  Verify: Script exists and contains valid PowerShell — `Test-Path 'd:\PROJECT-FINAL\Kiro\QR-CODE\start-dev.ps1'` returns True.

---

- [ ] 23. **Create `e2e/tests/lan-mode.spec.ts`** — Playwright tests for LAN mode.

  Create `d:\PROJECT-FINAL\Kiro\QR-CODE\e2e\tests\lan-mode.spec.ts`. Target the backend
  directly at `http://localhost:8787` (static + API, no Vite proxy).

  Update `e2e/tests/helpers.ts` to change the `API_URL` default from `http://localhost:8080`
  to `http://localhost:8787`.

  **Test cases** (all use `apiGet`, `apiPost`, `uploadFileViaApi`, and direct Playwright
  page navigation — follow patterns in existing tests like `03-file-upload.spec.ts`):

  ```
  LAN-01: GET /api/network/info returns non-localhost IP (or 127.0.0.1 if no LAN)
          Assert: status 200, body has localIp, port === 8787, shareBaseUrl starts with "http://"

  LAN-02: Upload file → shareUrl contains "/share/" (not "/api/files/share/") and a non-blank token
          Upload test-files/test-small.txt via uploadFileViaApi
          Assert: shareUrl matches /\/share\/[A-Za-z0-9]+$/
          Assert: shareUrl does NOT match /\/api\/files\/share\//

  LAN-03: Upload PDF → shareUrl → navigate to SPA share page → metadata visible + download works
          Upload test-files/test-pdf.pdf (or test-small.txt if PDF not present)
          Extract token from shareUrl (last segment)
          Navigate page to http://localhost:8787/share/<token>
          Assert: page shows filename
          Assert: GET /api/files/share/<token>/metadata returns 200 with correct fileName

  LAN-04: 3 uploads → unique tokens → cross-file isolation
          Upload 3 different files; extract tokens A, B, C
          GET /api/files/share/A/metadata → originalFileName must NOT equal file B or C name
          GET /api/files/share/B/metadata → originalFileName must NOT equal file A or C name
          GET /api/files/share/C/metadata → must return its own filename
          Assert all three tokens are distinct strings

  LAN-05: Delete → second access returns 404
          Upload a file, extract its UUID id and token
          DELETE /api/files/<id> → status 204
          GET /api/files/share/<token>/metadata → status 404

  LAN-06: GET http://localhost:8787/ returns HTML with <title>
          Use Playwright page.goto('http://localhost:8787/')
          Assert: response status 200
          Assert: page title or body contains expected app name text (e.g. "QR")

  LAN-07: Navigate to /share/<token> → React SPA served (not 302 redirect)
          Upload a file, get token
          page.goto('http://localhost:8787/share/<token>')
          Assert: page.url() remains http://localhost:8787/share/<token> (no redirect to /api/)
          Assert: page contains filename text (SPA rendered correctly)
  ```

  The test file must import from `./helpers` and use `API_URL` constant (now `http://localhost:8787`).
  Add `import * as path from 'path'` and `import * as fs from 'fs'` as needed, mirroring existing tests.

  Files:
  - `e2e/tests/lan-mode.spec.ts` (create)
  - `e2e/tests/helpers.ts` (update `API_URL` default to `http://localhost:8787`)

  Verify: With backend running on 8787 with static frontend bundled:
  `cd e2e ; npx playwright test tests/lan-mode.spec.ts --reporter=list` — all 7 tests pass.

---

- [ ] 24. **Create `LAN-REPORT.md`** — document the LAN architecture and usage.

  Create `d:\PROJECT-FINAL\Kiro\QR-CODE\LAN-REPORT.md` covering:
  - Architecture overview (Device A as server, Device B as consumer)
  - How to run (start-lan.ps1 for production, start-dev.ps1 for development)
  - How the QR URL is built (NetworkService IP detection → `/share/<token>`)
  - How Device B accesses the file (SPA route → SharePage → `/api/files/share/<token>`)
  - Network interface selection (Settings → Network section → POST /api/network/select)
  - File storage path configuration (FILE_STORAGE_PATH env var)
  - Known limitations (same LAN required, no HTTPS, LAN IP changes when switching networks)

  Files: `LAN-REPORT.md`

  Verify: File exists and is readable — `Test-Path 'd:\PROJECT-FINAL\Kiro\QR-CODE\LAN-REPORT.md'` returns True.

---

## Dependency Order Summary

Steps are ordered so each one compiles on top of the previous:

```
1  → YAML config (no deps)
2  → NetworkInterfaceInfo record (no deps)
3  → NetworkService (needs 2)
4  → NetworkController (needs 3)
5  → FileShareService update (needs 3)
6  → ShareController cleanup (needs 5's new URL shape rationale)
7  → SpaController (needs 6 removed, no code dep)
8  → CorsConfig (no code deps)
9  → SecurityConfig (no code deps)
10 → application-test.yml (no code deps)
11 → FileShareServiceTest (needs 3, 5)
12 → ShareControllerIntegrationTest (needs 5, 6)
13 → Full backend test run (needs 1-12)
14 → vite.config.ts (no backend deps)
15 → types/index.ts (no deps)
16 → api/network.ts (needs 15)
17 → NetworkStatusBar.tsx (needs 16)
18 → HomePage.tsx (needs 17)
19 → SettingsPage.tsx (needs 16)
20 → Full frontend build (needs 14-19)
21 → start-lan.ps1 (needs 20 logically)
22 → start-dev.ps1 (no code deps)
23 → e2e/tests/lan-mode.spec.ts (needs full stack running; update helpers.ts first)
24 → LAN-REPORT.md (needs all above for accurate documentation)
```

Steps 1–13 (backend) and 14–20 (frontend) can be worked in parallel by two engineers, but steps
21–24 depend on both branches being complete.
