# Building the Universal QR Sharing APK

This is the exact, reproducible procedure to build and sign the Android APK on a
properly provisioned machine. The native project is **generated** by Capacitor
from the existing React frontend — nothing here is a hand-maintained second app.

> **Status in the current build environment: BLOCKED.**
> `npx cap add android` / `npx cap sync android` succeed and generate
> `frontend/android/`, but the APK build cannot complete here because:
> 1. no Android SDK is installed (`ANDROID_HOME` / `ANDROID_SDK_ROOT` empty, no `adb`), and
> 2. the installed JDK is 25, which the Capacitor Gradle wrapper (8.11.1) rejects
>    (`Unsupported class file major version 69`).
> See "Prerequisites" for the fix. No APK was produced here.

## Prerequisites

| Tool | Required | Notes |
| --- | --- | --- |
| Node.js | 20+ | Capacitor 7 requirement. |
| JDK | **17** | AGP needs JDK 17. JDK 25 fails with "Unsupported class file major version 69". Set `JAVA_HOME` to a JDK 17 for the Gradle build. |
| Android SDK | API 34+ | Install via Android Studio or `cmdline-tools` + `sdkmanager`. |
| `ANDROID_HOME` | yes | Point at the SDK root; add `platform-tools` to `PATH`. |
| Build tools | yes | `platform-tools`, `build-tools;34.0.0`, `platforms;android-34`. |

The ML Kit barcode scanner requires **minSdk 21+** (Capacitor 7 default minSdk
is already compatible).

### Point Gradle at the right JDK (example)

```powershell
# PowerShell — use a JDK 17 just for the Android build.
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot"
$env:ANDROID_HOME = "C:\Users\<you>\AppData\Local\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:JAVA_HOME\bin;$env:PATH"
```

## 1. Generate / refresh the native project

```powershell
cd frontend
npm install
npm run build          # produces dist/
npx cap add android    # first time only; creates frontend/android/
npx cap sync android   # copy web assets + plugins into the native project
```

`frontend/android/` is git-ignored (regenerate it any time with the commands
above). Do not hand-edit generated files; apply the templates in step 2 instead.

## 2. Apply the manifest + network-security templates

After `cap add android`, apply the documented edits once:

- Merge `android/templates/AndroidManifest.additions.xml` into
  `frontend/android/app/src/main/AndroidManifest.xml`:
  - add `CAMERA`, `INTERNET`, `ACCESS_NETWORK_STATE` permissions,
  - add `<uses-feature android:name="android.hardware.camera" android:required="false" />`,
  - on `<application>` set `android:usesCleartextTraffic="true"` and
    `android:networkSecurityConfig="@xml/network_security_config"`.
- Copy `android/templates/network_security_config.xml` to
  `frontend/android/app/src/main/res/xml/network_security_config.xml`.

`usesCleartextTraffic` is required for plain-`http://` LAN sharing (no TLS on a
local network) and is scoped by the network-security config.

## 3. Build a debug APK

```powershell
cd frontend/android
./gradlew.bat assembleDebug
```

Output: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
Install on a connected device/emulator with:

```powershell
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 4. Generate a signing keystore (release)

**Never commit a keystore or its passwords.** Generate one with `keytool`
(ships with the JDK):

```powershell
keytool -genkeypair -v `
  -keystore universalqr-release.jks `
  -alias universalqr `
  -keyalg RSA -keysize 2048 -validity 10000
```

Store `universalqr-release.jks` outside the repo and keep the passwords in a
secret manager / environment variables.

## 5. Configure signing via environment variables

Create `frontend/android/keystore.properties` **(git-ignored — do not commit)**,
or supply the values via environment variables / CI secrets:

```properties
storeFile=C:/secure/universalqr-release.jks
storePassword=${UNIVERSALQR_STORE_PASSWORD}
keyAlias=universalqr
keyPassword=${UNIVERSALQR_KEY_PASSWORD}
```

Wire it into `frontend/android/app/build.gradle`:

```gradle
def keystorePropsFile = rootProject.file("keystore.properties")
def keystoreProps = new Properties()
if (keystorePropsFile.exists()) {
    keystoreProps.load(new FileInputStream(keystorePropsFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropsFile.exists()) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            // ...
        }
    }
}
```

In CI, set `storePassword` / `keyPassword` from secrets rather than committing
`keystore.properties`.

## 6. Build a signed release APK

```powershell
cd frontend/android
./gradlew.bat assembleRelease
```

Output: `frontend/android/app/build/outputs/apk/release/app-release.apk`.

For Play Store distribution build an AAB instead:

```powershell
./gradlew.bat bundleRelease
# frontend/android/app/build/outputs/bundle/release/app-release.aab
```

## 7. Configure the LAN host on the device

Install the APK, open the app → **Settings → API Base URL**, and enter Device A's
LAN address, e.g. `http://172.20.10.2:8787`. The shared axios client then routes
all API calls there. Scanning a Universal QR share URL sets this automatically.

## Troubleshooting

- **`Unsupported class file major version 69`** — Gradle is running on a JDK that
  is too new (e.g. JDK 25). Set `JAVA_HOME` to a JDK 17 (see Prerequisites).
- **`SDK location not found`** — set `ANDROID_HOME` or create
  `frontend/android/local.properties` with `sdk.dir=/path/to/Android/Sdk`.
- **Cleartext HTTP blocked at runtime** — confirm step 2 was applied
  (`usesCleartextTraffic="true"` + `network_security_config.xml`).
- **Camera permission denied** — the app requests it at scan time; if
  permanently denied, enable it in Android app settings.
