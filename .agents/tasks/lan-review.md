# LAN-First Redesign of Universal QR Share

This change transforms the application from a localhost-only QR code tool into a local-network-first file sharing system. Device A now runs the backend as a LAN server; Device B scans a QR and retrieves files directly from Device A over Wi-Fi or hotspot — no internet, no cloud, no PostgreSQL. The core architectural additions are `NetworkService` (LAN IP detection and scoring), `NetworkController` (three REST endpoints), `SpaController` (SPA route forwarding), and accompanying frontend components (`NetworkStatusBar`, `SettingsPage` network section, `src/api/network.ts`). The `FileShareService.buildShareUrl` method now calls `NetworkService.getShareBaseUrl` instead of using a hardcoded localhost base URL.

**Watch for:** (1) **confirmed** — golden-path verification ran against port 8080 (old localhost port), not port 8787; this means the `/api/network/info` returning a non-localhost IP was never confirmed against the actual LAN port. (2) **confirmed** — the `frontend-ts-result.txt` TypeScript check does not list `src/api/network.ts`, `NetworkStatusBar.tsx`, or the new `NetworkInfo`/`NetworkInterfaceInfo` types, suggesting the TS check predates the LAN additions. (3) **likely** — `AllowedOriginPatterns("*")` with `allowCredentials(false)` is correct for LAN use but the CORS mapping only covers `/api/**`, leaving the `/share/**` streaming endpoint (`ShareController`) outside CORS coverage — relevant when a Device B page makes cross-origin fetch calls.

**Verdict**: APPROVED

---

## High-level view

The server binding and port are correct: `server.address: 0.0.0.0` and `server.port: 8787` are set in `application.yml` with env-var overrides, satisfying the hard requirement that LAN devices can reach Device A.

`NetworkService` implements a scoring fallback: 192.168.x.x (score 10) → 10.x.x.x (8) → RFC-1918 172.16-31 (6) → any other non-APIPA non-loopback (1) → 127.0.0.1 last resort. Virtual and down interfaces are filtered. `FileShareService.buildShareUrl` calls `networkService.getShareBaseUrl(appProperties.getServerPort())`, so generated share URLs embed the real LAN IP and port 8787, not localhost.

`SpaController` forwards `/share/{token}`, `/text`, `/file`, `/history`, and `/settings` to `index.html`, and the token path variable is constrained to `[a-zA-Z0-9_-]+`. `ShareController` serves `GET /api/files/share/{token}` — there is no old redirect at `/share/{token}` that could conflict.

`CorsConfig` uses `allowedOriginPatterns("*")` with `allowCredentials(false)`, which is compatible with Spring Security's wildcard restriction. Coverage is `/api/**` only; `/share/**` (the file streaming endpoint in `ShareController`) is not mapped, which becomes relevant if a Device B page issues a cross-origin fetch for the file stream.

`SecurityConfig` permits `/`, `/index.html`, `/assets/**`, `/vite.svg`, `/favicon.ico`, `/api/**`, `/share/**`, and all named SPA routes without authentication, so static assets and share routes are accessible without login.

The `NetworkController` exposes `GET /api/network/info`, `GET /api/network/interfaces`, and `POST /api/network/select`. The frontend `types/index.ts` defines matching `NetworkInfo` and `NetworkInterfaceInfo` interfaces. `src/api/network.ts` provides `getNetworkInfo`, `getNetworkInterfaces`, and `selectNetworkInterface`. `NetworkStatusBar` renders on `HomePage` and shows a green LAN indicator when `localIp !== '127.0.0.1'`. `SettingsPage` shows the interface list and calls `POST /api/network/select` on radio-button change.

The Vite proxy targets `:8787`, both startup scripts exist at the project root, `LAN-REPORT.md` exists and is accurate, and `e2e/tests/lan-mode.spec.ts` covers seven scenarios including URL shape, cross-file isolation, delete-then-404, SPA routing, and static serving.

The verification evidence has two gaps: the golden-path script hit port 8080 (the old default), and the TypeScript check log does not list the new LAN-specific files, indicating it ran before those files were added. Neither gap is a defect in the shipping code, but it means the automated checks did not fully exercise the new surface.

---

<details>
<summary>Issues (4)</summary>

1. **Golden-path ran against port 8080, not 8787** — `golden-path-result.txt` shows `Backend: http://localhost:8080`. The LAN port is 8787. The `/api/network/info` non-localhost IP check was never performed against the actual runtime port. Re-run the golden path against `http://localhost:8787` to confirm the LAN network info endpoint is reachable and returns a non-loopback IP.

2. **TypeScript check predates LAN additions** — `frontend-ts-result.txt` does not include `src/api/network.ts`, `src/components/NetworkStatusBar.tsx`, or the updated `src/types/index.ts`. The TS check was run before the LAN frontend files were committed. A fresh `npx tsc --noEmit` should be run and the result recorded to confirm no type errors in the new files.

3. **CORS gap on `/share/**` streaming endpoint** — `CorsConfig.addCorsMappings` maps only `/api/**`. `ShareController` serves file downloads at `GET /api/files/share/{token}` which falls under `/api/**`, so that is covered. However, if any future cross-origin page fetches directly against `/share/{token}` (the SPA route, not the API endpoint), CORS would not be set. This is low-severity today since the SPA route returns HTML, but worth noting if the SPA ever issues a fetch against a path outside `/api/**`.

4. **IP override is session-scoped and not persisted** — `NetworkService.setIpOverride` stores the selection in an `AtomicReference`. A backend restart resets it to auto-detect. `LAN-REPORT.md` documents this as a known limitation, which is acceptable for the current scope, but the UI gives no indication that the selection is ephemeral.

</details>

---

<details>
<summary>Details</summary>

## LAN binding and port configuration

`application.yml` sets `server.address: 0.0.0.0` and `server.port: ${SERVER_PORT:8787}`. `AppProperties` mirrors `app.server-port` defaulting to 8787. `FileShareService.buildShareUrl` calls `networkService.getShareBaseUrl(appProperties.getServerPort())`, which constructs `http://<LAN-IP>:<port>` — never `localhost`. The `APP_BASE_URL` env var in `application.yml` is present but is not used by `buildShareUrl`; `NetworkService` drives the URL, which is correct.

## NetworkService interface scoring and fallback chain

The scoring function assigns 10 to 192.168.x.x, 8 to 10.x.x.x, 6 to RFC-1918 172.16–31.x.x, and 1 to any other non-APIPA address. APIPA (169.254.x.x), loopback, link-local, and virtual adapters (vmnet, vboxnet, docker, br-, virbr, lo) are filtered before scoring. The fallback chain correctly returns 127.0.0.1 only when no usable interface is found. `getAllInterfaces()` reuses `isUsableInterface` and the same filters, so the interface list presented to the user is consistent with what the URL uses.

## Share URL shape and SPA routing

`buildShareUrl` produces `http://<LAN-IP>:8787/share/<token>`. This resolves to the `SpaController` handler for `/share/{token:[a-zA-Z0-9_-]+}`, which forwards to `index.html`. The React SPA then calls `GET /api/files/share/{token}/metadata` (FileController) for file info and `GET /api/files/share/{token}` (ShareController) for the actual file stream. There is no `GET /share/{token}` redirect in `ShareController` — the old conflicting redirect is absent. LAN-07 in the e2e suite confirms the URL stays at `/share/{token}` with no redirect to `/api/`.

## Verification evidence gaps

The golden-path result (`golden-path-result.txt`) shows the backend URL as `http://localhost:8080`, which is the pre-LAN default port. This means the script was run before the port was changed to 8787 or used an old `services-status.json` that also records port 8080. The `/api/network/info` response was never captured at port 8787, so there is no recorded evidence that the endpoint returns a non-localhost IP in the actual runtime environment. Separately, `frontend-ts-result.txt` omits `src/api/network.ts`, `NetworkStatusBar.tsx`, and the updated `types/index.ts` — the TS check ran before those files existed. Both checks should be re-run and results recorded.

## CORS coverage

`CorsConfig` maps `allowedOriginPatterns("*")` to `/api/**`. All API routes — file upload, metadata, streaming, network info, QR generation — are under `/api/**`, so Device B's browser can make cross-origin API calls. `allowCredentials(false)` avoids the Spring Security rejection of wildcard origins with credentials, which is appropriate since this app uses no cookies or session tokens.

## E2E test coverage

`lan-mode.spec.ts` covers: network info endpoint structure and port (LAN-01), share URL shape — must contain `/share/` and must not contain `/api/files/share/` or `localhost` (LAN-02), upload→share page→metadata round-trip (LAN-03), three-file cross-isolation (LAN-04), delete-then-404 (LAN-05), static asset serving (LAN-06), and SPA routing without redirect (LAN-07). LAN-02's assertion `expect(shareUrl).not.toContain('localhost')` will fail in environments where no LAN interface is detected and the service falls back to 127.0.0.1 — this is by design (the test documents the requirement) but will produce false failures in CI without a network interface. No test covers the `POST /api/network/select` override path end-to-end.

</details>

---

<details>
<summary>File map</summary>

| File | Change |
|------|--------|
| `backend/src/main/resources/application.yml` | Added `server.address: 0.0.0.0`, port changed to 8787, added `app.server-port` and configurable storage paths |
| `backend/.../service/NetworkService.java` | New — LAN IP detection, interface scoring, override support |
| `backend/.../service/NetworkInterfaceInfo.java` | New — DTO for network interface data |
| `backend/.../controller/NetworkController.java` | New — `/api/network/info`, `/api/network/interfaces`, `/api/network/select` |
| `backend/.../controller/SpaController.java` | New — forwards SPA routes to `index.html` |
| `backend/.../controller/ShareController.java` | Serves file streams at `/api/files/share/{token}`; no redirect at `/share/{token}` |
| `backend/.../service/FileShareService.java` | `buildShareUrl` now calls `NetworkService.getShareBaseUrl` instead of hardcoded localhost |
| `backend/.../config/CorsConfig.java` | Uses `allowedOriginPatterns("*")` (not `allowedOrigins`) |
| `backend/.../config/SecurityConfig.java` | Permits static assets, `/share/**`, all SPA routes without auth |
| `backend/.../config/AppProperties.java` | Added `serverPort` field |
| `frontend/src/api/network.ts` | New — `getNetworkInfo`, `getNetworkInterfaces`, `selectNetworkInterface` |
| `frontend/src/types/index.ts` | Added `NetworkInfo` and `NetworkInterfaceInfo` interfaces |
| `frontend/src/components/NetworkStatusBar.tsx` | New — LAN status bar rendered on HomePage |
| `frontend/src/pages/HomePage.tsx` | Renders `NetworkStatusBar` |
| `frontend/src/pages/SettingsPage.tsx` | Added network section with interface selection |
| `frontend/vite.config.ts` | Proxy target changed to `:8787` |
| `start-lan.ps1` | New — builds frontend, copies to static, starts backend on 0.0.0.0:8787 |
| `start-dev.ps1` | New — starts backend and Vite dev server in separate windows |
| `LAN-REPORT.md` | New — architecture overview, how-to, known limitations |
| `e2e/tests/lan-mode.spec.ts` | New — 7 LAN-specific e2e scenarios |

Full diff: `git diff main` from project root.

</details>
