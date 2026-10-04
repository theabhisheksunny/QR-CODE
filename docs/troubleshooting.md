# Troubleshooting

Common issues when running or packaging Universal QR Sharing, with concrete
fixes. Covers the Windows app and the Android (Capacitor) client.

## LAN devices cannot reach the share URL (firewall)

**Symptom:** The desktop app shows a QR with `http://<lan-ip>:<port>/share/...`,
but a phone on the same Wi-Fi gets a connection timeout.

**Cause:** Windows Firewall blocks inbound connections to the app's port by
default.

**Fix:** The app never changes the firewall itself — it only advises. Run the
helper from an **elevated** PowerShell prompt, passing the actual runtime port
(check `/api/diagnostics` → `runtimePort`):

```powershell
.\windows\add-firewall-rule.ps1 -Port 8787
```

This adds one narrow inbound TCP Allow rule, **Private profile only** — the
Domain and Public profiles are untouched and the firewall is never disabled. To
remove it later:

```powershell
Remove-NetFirewallRule -DisplayName "Universal QR Sharing (TCP 8787, Private)"
```

Also confirm the phone and PC are on the **same subnet** and the Wi-Fi network
is marked **Private** in Windows (Public profile blocks the rule above).

## Port conflict (8787 already in use)

**Symptom:** Another app already uses 8787, or you want a specific port.

**Behaviour:** Port selection is a single source of truth resolved in `main()`
before Spring starts (FEAT-001): it reads `SERVER_PORT` (default 8787), probes
`ServerSocket` on `0.0.0.0`, and if busy scans `8787..8887` for the first free
port. The chosen port is published to both `server.port` and `app.server-port`,
so the backend, QR URLs, diagnostics, and the SPA all agree.

**Fix / override:**

```powershell
$env:SERVER_PORT = '8899'
# then launch the app / jar
```

Confirm with:

```powershell
Invoke-RestMethod http://localhost:8899/api/network/info      # port = 8899
Invoke-RestMethod http://localhost:8899/api/diagnostics       # runtimePort = 8899
```

If you opened a firewall rule for the old port, open one for the new port too.

## QR shows `localhost` or `127.0.0.1` instead of the LAN IP

**Symptom:** The share URL in the QR is `http://localhost:8787/...` or
`http://127.0.0.1:8787/...`, so other devices cannot open it.

**Cause:** No real LAN IP was detected (no active non-loopback interface), so
the app fell back to loopback. `ShareUrlService` (FEAT-001) owns the LAN IP +
runtime port and only emits loopback when there is genuinely no LAN address.

**Fix:**

1. Connect the machine to Wi-Fi/Ethernet so it has a private IP.
2. Check `GET /api/network/info` → `localIp` and `allInterfaces`. The
   `preferred` interface's `ipAddress` is what goes into the QR.
3. If multiple interfaces exist (VPN, virtual adapters), the detected
   `localIp` reflects the active interface. Disable unused virtual adapters if
   the wrong one is picked.
4. A loopback URL is **correct** when the QR is only meant for the same
   machine; it is a problem only for cross-device LAN sharing.

## Android: `net::ERR_CLEARTEXT_NOT_PERMITTED` / requests fail on device

**Symptom:** The Android app loads but every API call to the LAN backend fails;
logcat shows a cleartext/HTTP blocked error.

**Cause:** Android blocks plain `http://` traffic by default. LAN sharing has no
TLS, so cleartext to the private LAN IP must be explicitly allowed.

**Fix:** Apply the templates from `android/templates/` to the generated
`frontend/android/` project:

- `AndroidManifest.additions.xml` sets `android:usesCleartextTraffic="true"`
  and declares `CAMERA`, `INTERNET`, `ACCESS_NETWORK_STATE` only.
- `network_security_config.xml` scopes cleartext to private IP ranges / the
  pinned Device-A IP.

Also verify **Settings → API Base URL** in the app points at the desktop's LAN
IP and runtime port (e.g. `http://172.20.10.2:8787`) — the native client uses
that configured host (stored under `qrshare_api_base_url`); without it, requests
fail fast with a clear message instead of hitting the app's own `file://`
origin. See [android.md](android.md) for details.

## Android: hotspot / Wi-Fi client isolation

**Symptom:** PC and phone are "connected to the same hotspot" but still cannot
reach each other.

**Cause:** Many mobile hotspots and guest/public Wi-Fi networks enable **client
(AP) isolation**, which blocks device-to-device traffic even though both devices
have internet.

**Fix:**

1. Prefer a normal home/office Wi-Fi router (both devices on the same subnet)
   over a phone hotspot.
2. If using a hotspot, disable "client isolation" / "AP isolation" in its
   settings if the option exists (many phone hotspots do **not** expose it).
3. Verify reachability directly: from the phone browser open
   `http://<pc-lan-ip>:<port>/actuator/health` — if that fails, it is a network
   isolation problem, not an app problem.

> AP-isolation behaviour depends on the specific access point and cannot be
> changed by the app. This is listed as NOT-CLAIMED in the packaging report
> because it was not verified on real isolated hardware.

## Windows installer build fails: "Can not find WiX tools"

**Symptom:** `windows\build-installer.ps1` (or `jpackage --type exe`) fails with:

```
Can not find WiX tools. Was looking for WiX v3 light.exe and candle.exe
or WiX v4/v5 wix.exe and none was found
Error: Invalid or unsupported type: [exe]
```

**Cause:** `jpackage --type exe`/`msi` requires the WiX Toolset on `PATH`.

**Fix:** Install WiX v3.14 (`candle`/`light`) or WiX v4/v5 (`wix.exe`) from
<https://wixtoolset.org>, add it to `PATH`, verify with `wix --version`, then
re-run `windows\build-installer.ps1`. Until then, ship the self-contained
app-image (`windows\build-app-image.ps1`), which needs no WiX.

## Android APK build fails: "Unsupported class file major version 69"

**Symptom:** `./gradlew assembleDebug` fails during semantic analysis with
`Unsupported class file major version 69`.

**Cause:** The installed JDK is 25; the Capacitor Gradle wrapper (8.11.1) does
not support that class-file version. The Android Gradle Plugin expects JDK 17.

**Fix:** Build the APK with JDK 17 and an installed Android SDK
(`ANDROID_HOME`/`ANDROID_SDK_ROOT` set, `adb` on `PATH`). Exact steps and
keystore signing are in [../android/BUILD-ANDROID.md](../android/BUILD-ANDROID.md).
