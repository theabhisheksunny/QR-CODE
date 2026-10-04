# Implementation Plan — Windows (jpackage app-image) + Android (Capacitor) packaging with runtime hardening

Grounded in the actual codebase at `d:\PROJECT-FINAL\Kiro\QR-CODE`. Platform: Windows / PowerShell — use `;` not `&&`, `$env:VAR` not `%VAR%`, and background processes for servers (never a blocking foreground run).

## Key decisions (single sources of truth)

- **RuntimePaths** (new `@Component`) is the ONE owner of the app-data root and all subdirs. Precedence: `UNIVERSAL_QR_HOME` env → Windows `%LOCALAPPDATA%\UniversalQRSharing` (fallback `${user.home}/AppData/Local/UniversalQRSharing`) → macOS `${user.home}/Library/Application Support/UniversalQRSharing` → Linux `${XDG_DATA_HOME:-${user.home}/.local/share}/UniversalQRSharing`. OS detected via `System.getProperty("os.name")`. Rationale: packaging needs a writable location outside `Program Files`; env override keeps dev/CI flexible.
- **Back-compat for dev/tests**: explicit `app.storage.path` / `app.metadata-storage-path` properties still win when set. `application-test.yml` keeps `./target/test-files` + `./target/test-metadata` so tests stay hermetic and need no change. Only when these are unset (the packaged default) does `RuntimePaths` supply the dynamic app-data dirs. Rationale: avoids breaking the 27 passing backend tests and local dev.
- **Port selection** lives in `main()` before `SpringApplication.run`: read `SERVER_PORT` env (default 8787), probe by binding `java.net.ServerSocket` on `0.0.0.0:<port>`; if busy, scan `8787..8887` for the first free port; set the chosen value via `System.setProperty("server.port", ...)` AND `System.setProperty("app.server-port", ...)` so Spring, `NetworkService`, and `ShareUrlService` all read ONE authoritative value. Rationale: there must be no duplicated detection logic; `AppProperties.serverPort` + Spring `server.port` resolve from the same system property.
- **ShareUrlService** (new `@Service`) owns: active LAN IP (delegated to `NetworkService`), runtime port (from `AppProperties.getServerPort()`), and builds `http://<lan-ip>:<port>/share/<token>`. `FileShareService.buildShareUrl` is routed through it instead of calling `networkService.getShareBaseUrl` directly. It must never emit `localhost`/`127.0.0.1` when a real LAN IP exists (NetworkService already returns `127.0.0.1` only as a last-resort fallback). Rationale: consolidates URL construction so QR, diagnostics, and API share one definition.

## Verifiability summary

- **VERIFIABLE here**: all of Phase 1 (mvn test, live backend checks), Phase 2 app-image build + launch (`jpackage --type app-image`, jpackage/jlink confirmed present), Phase 3 frontend build/lint/tsc + Capacitor source generation, Phase 4 quality gate, Phase 5 docs/release layout.
- **BLOCKED here (document, do not fake)**: Phase 2 real `.exe`/`.msi` installer — WiX NOT installed, NSIS NOT installed; jpackage `--type exe` needs WiX v3 `candle`/`light`. Phase 3 `npx cap add android` / APK build — Android SDK, ANDROID_HOME, gradle, adb ALL absent; no device, no emulator.
- **NOT CLAIMED**: real-device Android install/scan, hotspot AP-isolation behavior, multi-user load, Windows reboot persistence, upgrade-preserves-data on a real reinstall.

---

## PHASE 1 — Backend runtime hardening (fully verifiable here)

- [ ] 1. Create `RuntimePaths` component resolving the dynamic app-data root and creating all runtime subdirectories on startup.
      Resolve root by the precedence above; in `@PostConstruct` create `<root>/storage/files`, `/storage/temp`, `/storage/metadata`, `/logs`, `/config`. Expose getters: `dataRoot()`, `filesDir()`, `tempDir()`, `metadataDir()`, `logsDir()`, `configDir()` (all `Path`). Log the resolved root once.
      Files: `backend/src/main/java/com/qrshare/config/RuntimePaths.java`
      Verify: `cd backend; mvn test` — all existing tests still compile and pass (hermetic test config unaffected).

- [ ] 2. Wire storage to RuntimePaths as the single source of truth while preserving explicit-property back-compat.
      Change `AppProperties` so `storage.path` / `metadataStoragePath` default to empty/null (not the hardcoded `./storage/...`). In `StorageConfig`, `LocalFileStorageService`, `LocalMetadataStorageService`, and `CleanupService`, resolve the effective dir as: explicit property if non-blank, else `RuntimePaths.filesDir()` / `metadataDir()`. Keep `application.yml` env overrides (`FILE_STORAGE_PATH`, `METADATA_STORAGE_PATH`) working. `application-test.yml` already sets explicit `./target/...` paths — leave it unchanged so tests stay hermetic.
      Files: `backend/src/main/java/com/qrshare/config/AppProperties.java`, `config/StorageConfig.java`, `storage/LocalFileStorageService.java`, `storage/LocalMetadataStorageService.java`, `service/CleanupService.java`
      Verify: `cd backend; mvn test` — all pass (tests use explicit target paths, so RuntimePaths defaults are not exercised and remain back-compat).

- [ ] 3. Add dynamic port selection as a single source of truth in `main()`.
      Before `SpringApplication.run`: read `SERVER_PORT` env (default 8787), probe by binding `ServerSocket` on `0.0.0.0:<port>`; if busy scan `8787..8887` for the first free port. Set `System.setProperty("server.port", chosen)` and `System.setProperty("app.server-port", chosen)` so Spring and `AppProperties` agree. Put the probe helper in a small static method or a `PortSelector` util class.
      Files: `backend/src/main/java/com/qrshare/QrShareApplication.java` (+ optional `backend/src/main/java/com/qrshare/config/PortSelector.java`)
      Verify: `cd backend; mvn test` passes; then start backend with `$env:SERVER_PORT='8899'` and confirm `/api/network/info` reports port 8899 (covered by the Phase 1g live check in item 7).

- [ ] 4. Create `ShareUrlService` and route `FileShareService` through it.
      New `@Service` with `buildShareUrl(String token)` → `http://<lanIp>:<port>/share/<token>` using `NetworkService.getLocalIpAddress()` and `AppProperties.getServerPort()`; add `activeLanIp()` and `runtimePort()` accessors for diagnostics. Replace `FileShareService.buildShareUrl` body to delegate to `ShareUrlService`. Must not emit localhost/127.0.0.1 unless NetworkService has no real LAN IP.
      Files: `backend/src/main/java/com/qrshare/service/ShareUrlService.java`, `service/FileShareService.java`
      Verify: `cd backend; mvn test` — `FileShareServiceTest` still passes (adjust its mock wiring if it stubs `networkService.getShareBaseUrl`; swap to the new service).

- [ ] 5. Add `GET /api/diagnostics` returning the diagnostics JSON (no secrets).
      Fields: `appVersion` (default `1.0.0`, from a property), `runtimePort`, `activeInterface` + `lanIp` (from NetworkService/ShareUrlService), `dataRoot`, `filesDir` (from RuntimePaths), `storageWritable` (write + delete a temp probe file under `tempDir()`), `freeDiskSpaceBytes` (`Files.getFileStore(dataRoot).getUsableSpace()`), `activeShareCount` (`metadataStorageService.findAll()` ACTIVE count), `cleanupLastRunEpoch` (track a timestamp in `CleanupService` set each run; may be 0 before first run), `javaVersion` (`java.version`), `osName` (`os.name`). Never include raw tokens or secret config. Keep `/actuator/health` as-is.
      Files: `backend/src/main/java/com/qrshare/controller/DiagnosticsController.java`, `service/CleanupService.java` (expose last-run epoch), `backend/src/main/resources/application.yml` (optional `app.app-version`)
      Verify: `cd backend; mvn test` passes; live check in item 7 confirms the JSON shape and `storageWritable: true`.

- [ ] 6. Make uploads atomic with crash-recovery sweep.
      In `LocalFileStorageService.store`: write to `<tempDir>/<uuid>.part`, then `Files.move(part, target, ATOMIC_MOVE)` with fallback to `REPLACE_EXISTING` if atomic unsupported; only after a successful move does `FileShareService` persist metadata (reorder so metadata save happens after store returns). On store failure delete the temp part and persist no metadata. Add a `@PostConstruct` sweep that deletes stale `*.part` files in `tempDir()` on startup.
      Files: `backend/src/main/java/com/qrshare/storage/LocalFileStorageService.java`, `service/FileShareService.java`
      Verify: `cd backend; mvn test` passes (existing `FileControllerIntegrationTest`/`ShareControllerIntegrationTest` exercise upload→download→delete through the real storage path).

- [ ] 7. Add the Windows firewall helper script and run the Phase 1 live verification.
      Script: narrow INBOUND rule for the chosen port on the Private profile only (`New-NetFirewallRule ... -Direction Inbound -Protocol TCP -LocalPort <port> -Profile Private -Action Allow`); never disables the firewall; prints what it will do and requires elevation. App only detects/advises — it does not auto-modify the firewall.
      Live verification (start backend as a BACKGROUND process, wait for health, then curl): `/actuator/health` = UP; `/api/network/info` shows a real LAN IP (not 127.0.0.1 on a networked machine); `/api/diagnostics` shows `dataRoot` under `%LOCALAPPDATA%\UniversalQRSharing` and `storageWritable: true`; upload a file → `shareUrl` contains the LAN IP + runtime port and the blob lands under `%LOCALAPPDATA%\UniversalQRSharing\storage\files`; download and confirm SHA-256 matches the source; delete → `404`; restart with `$env:SERVER_PORT='8899'` and confirm the port override flows through. Stop the background process. Record actual command output in the final report.
      Files: `windows/add-firewall-rule.ps1`
      Verify: all live checks above pass against the running backend; then `git add` the Phase 1 changes and commit.

---

## PHASE 2 — Windows packaging (jpackage app-image buildable + launchable here; real installer BLOCKED)

- [ ] 8. Build the frontend and produce the runnable fat jar containing it.
      `cd frontend; npm install; npm run build`; copy `frontend/dist/*` into `backend/src/main/resources/static/` preserving `.gitkeep`; `cd backend; mvn clean package -DskipTests` → `backend/target/qr-share-0.0.1-SNAPSHOT.jar`.
      Files: (build artifacts only; no source changes) — optionally a helper `windows/build-jar.ps1`
      Verify: the jar exists and runs: `java -jar backend/target/qr-share-0.0.1-SNAPSHOT.jar` starts, serves the SPA at `/`, then stop it. Confirm `Main-Class` in the jar's `META-INF/MANIFEST.MF` is `org.springframework.boot.loader.launch.JarLauncher` (Spring Boot 3.2) — unzip and read it; this is the value jpackage must target.

- [ ] 9. Create and run the app-image build script.
      Script runs: `jpackage --type app-image --name UniversalQRSharing --input backend\target --main-jar qr-share-0.0.1-SNAPSHOT.jar --main-class org.springframework.boot.loader.launch.JarLauncher --dest release\windows --app-version 1.0.0 --vendor "Universal QR" --java-options "-Xmx512m" --win-console`. Actually run it and fix any errors (e.g. wrong main-class, stale dest dir).
      Files: `windows/build-app-image.ps1`
      Verify: `release\windows\UniversalQRSharing\UniversalQRSharing.exe` is produced.

- [ ] 10. Launch the packaged app-image and verify end-to-end against the packaged runtime.
      Start the packaged exe as a BACKGROUND process, wait ~40s, then verify `/actuator/health` UP, `/api/network/info`, `/api/diagnostics` against the packaged runtime port; upload + download + SHA-256 match + delete; confirm persistent data is under `%LOCALAPPDATA%\UniversalQRSharing` and NOT inside the app-image directory. Stop the app.
      Files: (none — verification only)
      Verify: all checks above pass; record actual output in the report as VERIFIED.

- [ ] 11. Attempt the real `.exe` installer; document precisely if blocked.
      Check `winget`, `choco`, `dotnet` availability. jpackage `--type exe` needs WiX v3 (`candle`/`light`); WiX v4 as a dotnet tool is likely insufficient for jpackage — state this precisely. Do NOT install untrusted/destructive tooling. If WiX v3 is already present, run the installer build (item 12) and mark real-install pending real test; otherwise retain the app-image and document the exact manual step. (Confirmed in this environment: WiX NOT installed, NSIS NOT installed → EXPECT BLOCKED here.)
      Files: (none — probe + document)
      Verify: record the exact tool-probe output and the BLOCKED reason in the report; do not fabricate an installer.

- [ ] 12. Create the installer build script (runs where WiX v3 exists).
      Script: `jpackage --type exe ...` with `--win-menu --win-shortcut --win-dir-chooser --win-menu-group "Universal QR Sharing"` producing `release\windows\UniversalQRSharing-1.0.0.exe`. Document that binaries may live under `Program Files` but user data must stay under `%LOCALAPPDATA%` (RuntimePaths already guarantees this), and that upgrades must preserve that data.
      Files: `windows/build-installer.ps1`
      Verify: script exists and is internally consistent; mark EXECUTION BLOCKED here (no WiX). Commit Phase 2 scripts + docs.

---

## PHASE 3 — Android (Capacitor source complete; APK build BLOCKED here)

- [ ] 13. Add Capacitor to the frontend and initialize config.
      Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` as devDeps; `npx cap init "Universal QR Sharing" "com.universalqr.sharing" --web-dir=dist`; create `frontend/capacitor.config.ts`.
      Files: `frontend/package.json`, `frontend/capacitor.config.ts`
      Verify: `cd frontend; npm install` succeeds; `npx cap --version` prints a version.

- [ ] 14. Add a configurable server base URL and make the API client platform-aware.
      The app already uses a `localStorage` base-URL override (`qrshare_api_base_url`) in `src/api/client.ts` and `SettingsPage.tsx`. Extend `client.ts` so on native (`Capacitor.isNativePlatform()`) it uses the configured base (e.g. `http://172.20.10.2:8787`), and on web it stays relative (`''`). Android is a CLIENT reusing the SAME React UI + API client — no duplicated business logic. The existing Settings "API Base URL" field is the entry point for the Device A base URL.
      Files: `frontend/src/api/client.ts`, (optionally) `frontend/src/pages/SettingsPage.tsx`
      Verify: `cd frontend; npx tsc --noEmit` → 0 errors; `npm run build` exits 0; `npm run lint` 0 warnings.

- [ ] 15. Add the QR scanner service + native-only Scan button.
      Add a Capacitor barcode-scanner plugin (devDep); `frontend/src/services/scanner.ts` exposing `scan(): Promise<string>` (native uses the plugin; web throws a clear "not supported" error). A native-only "Scan QR" button parses the result: share URL (`http://<ip>:<port>/share/<token>`) → set the host base + open the in-app share view; plain URL → open in browser; text/JSON/number → display. Gate the button on `Capacitor.isNativePlatform()`.
      Files: `frontend/src/services/scanner.ts`, a small component/button (e.g. `frontend/src/components/ScanQrButton.tsx`), wired into an existing page (e.g. `HomePage.tsx`)
      Verify: `cd frontend; npx tsc --noEmit` 0 errors; `npm run build` exits 0; `npm run lint` 0 warnings. (Runtime scan is NOT verifiable here — no device.)

- [ ] 16. Configure Android permissions and cleartext for LAN HTTP.
      Request only CAMERA + network. Set `android:usesCleartextTraffic="true"` in `AndroidManifest.xml` (REQUIRED for `http://` LAN sharing — document as a deliberate scoped decision), optionally add `network_security_config.xml` restricting cleartext to private IP ranges. These files are generated under `frontend/android/` by `cap add android` (item 17); if that is blocked, author them as documented templates under `android/` or in the Android doc.
      Files: `frontend/android/app/src/main/AndroidManifest.xml` (or template), optional `network_security_config.xml`
      Verify: files present/consistent; actual on-device enforcement NOT verifiable here.

- [ ] 17. Generate the native Android project (expected to be BLOCKED by missing SDK).
      `cd frontend; npm run build; npx cap add android; npx cap sync android`. `cap add android` may fail without the Android SDK — EXPECTED. Capture the EXACT error. Do NOT download the multi-GB SDK. Document ANDROID SDK as BLOCKED. (Confirmed absent in this environment: Android SDK, ANDROID_HOME, gradle, adb.)
      Files: `frontend/android/` (if generation succeeds) or captured error log
      Verify: record the actual `cap add android` outcome verbatim; do not fake success.

- [ ] 18. Write the Android build/signing documentation and run the possible verifications.
      `docs/android.md` (and/or `android/BUILD-ANDROID.md`) with EXACT APK build steps, keystore generation via `keytool`, and signing config via env vars (never commit a keystore). Then verify what IS possible: `npm run build` exit 0, `npx tsc --noEmit` 0 errors, `npm run lint` 0 errors; honestly report the `cap add android` result and APK as BLOCKED.
      Files: `docs/android.md`, `android/BUILD-ANDROID.md`
      Verify: the three frontend gates pass; the doc states APK build as BLOCKED (SDK absent, no device). Commit Phase 3.

---

## PHASE 4 — Quality gate (verifiable here)

- [ ] 19. Run the full quality gate and remove dead code.
      Backend: `cd backend; mvn clean test` writing output to a log file (shell truncates), then read the `Tests run` / `BUILD` line and delete the log. Frontend: `npm run build` + `npm run lint` + `npx tsc --noEmit` all exit 0. E2E: start the stack as background processes, `cd e2e; npx playwright test` capturing JSON reporter output, parse pass count (expect 37), delete the capture. Remove dead code / unused imports introduced during packaging. No Python/Ruff.
      Files: (cleanup edits as needed across changed files)
      Verify: backend tests pass; frontend 3 gates exit 0; Playwright reports its pass count (record the ACTUAL number, do not assume 37 if different).

---

## PHASE 5 — Docs, release layout, cleanup (verifiable here)

- [ ] 20. Create the release layout, update `.gitignore`, and write the docs.
      `release/` layout: app-image (+ optional `.exe`) + `checksums.txt` (SHA256). Add `release/` to `.gitignore`. Update `README.md` with Windows + Android sections. Create `docs/packaging.md`, `docs/android.md` (if not already), `docs/troubleshooting.md` (firewall, port-conflict, QR-shows-localhost, Android cleartext, hotspot isolation).
      Files: `.gitignore`, `README.md`, `docs/packaging.md`, `docs/android.md`, `docs/troubleshooting.md`, `release/checksums.txt` (generated, git-ignored)
      Verify: `release/` is git-ignored (`git status` does not list release artifacts); docs render and cross-link.

- [ ] 21. Final commit and push attempt.
      `git add -A`; commit; attempt `git push origin main`. If push fails (auth/network), report it and do NOT halt the task. (Note: latest local commit `a78d426` is already ahead of `origin/main` and unpushed.)
      Files: (none)
      Verify: commit created; push result recorded honestly (pushed vs failed-with-reason).

---

## PHASE 6 — Final report (verifiable here)

- [ ] 22. Write `docs/PACKAGING-REPORT.md` with strictly separated honesty sections.
      Sections: **VERIFIED** (actually executed — list the exact commands + outcomes), **BUILT-BUT-NOT-REAL-DEVICE/REAL-INSTALL-VERIFIED** (app-image launches; installer script authored), **BLOCKED** (exact reasons: WiX v3 not installed and not safely installable here; Android SDK/ANDROID_HOME/gradle/adb absent; no device/emulator), **NOT CLAIMED** (real-device install/scan, hotspot AP-isolation, 100-user load, Windows reboot persistence, upgrade-preserves-data on real reinstall), plus the 22-point final report structure. NEVER write "passed" for anything not executed — use VERIFIED / BUILT-NOT-VERIFIED / BLOCKED.
      Files: `docs/PACKAGING-REPORT.md`
      Verify: every claim maps to an actual command/output captured during the run; blocked items name the exact missing tool.

---

## Things checked but not yet verified at plan time

- Spring Boot 3.2 fat-jar `Main-Class` is `org.springframework.boot.loader.launch.JarLauncher` (the Spring Boot 3.2 package path). The implementer MUST confirm by reading `META-INF/MANIFEST.MF` of the built jar before running jpackage (item 8), since a wrong `--main-class` is the most common jpackage failure here.
- `FileShareServiceTest` may stub `networkService.getShareBaseUrl`; routing through `ShareUrlService` (item 4) may require updating that test's mock. Confirm when editing.
- WiX/Android SDK/device absence are stated as confirmed environment facts in the task brief; the implementer should still capture the exact probe output rather than restating the brief.
