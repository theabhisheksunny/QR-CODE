package com.qrshare.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Single source of truth for the application's dynamic data-root location and
 * its subdirectories. The root is resolved by platform precedence and never
 * hardcoded to a specific user path.
 *
 * Precedence:
 *   1. UNIVERSAL_QR_HOME environment variable (any OS)
 *   2. Windows:   %LOCALAPPDATA%\UniversalQRSharing
 *                 (fallback ${user.home}/AppData/Local/UniversalQRSharing)
 *   3. macOS:     ${user.home}/Library/Application Support/UniversalQRSharing
 *   4. Linux/*:   ${XDG_DATA_HOME:-${user.home}/.local/share}/UniversalQRSharing
 */
@Component
@Slf4j
public class RuntimePaths {

    private static final String APP_DIR_NAME = "UniversalQRSharing";
    /**
     * Windows data-root folder name. Deliberately DISTINCT from
     * {@link #APP_DIR_NAME} so persistent user data never shares a directory
     * with the installed binaries. The per-user jpackage installer places
     * binaries in {@code %LOCALAPPDATA%\UniversalQRSharing}; if data lived there
     * too, uninstalling the app would delete the user's shares/config/logs.
     * Keeping data in {@code %LOCALAPPDATA%\UniversalQRSharing-Data} makes an
     * uninstall (which removes only the binary folder) data-safe, and lets an
     * upgrade preserve everything.
     */
    private static final String WIN_DATA_DIR_NAME = "UniversalQRSharing-Data";

    private final Path dataRoot;

    public RuntimePaths() {
        this.dataRoot = resolveDataRoot();
    }

    @PostConstruct
    public void init() {
        createDirs();
        log.info("Application data root resolved to: {}", dataRoot);
    }

    private void createDirs() {
        createDir(filesDir());
        createDir(tempDir());
        createDir(metadataDir());
        createDir(roomsDir());
        createDir(logsDir());
        createDir(configDir());
    }

    private void createDir(Path path) {
        try {
            Files.createDirectories(path);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create runtime directory: " + path, e);
        }
    }

    private Path resolveDataRoot() {
        String override = System.getenv("UNIVERSAL_QR_HOME");
        if (override != null && !override.isBlank()) {
            return Path.of(override.trim(), APP_DIR_NAME);
        }

        String osName = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String userHome = System.getProperty("user.home", ".");

        if (osName.contains("win")) {
            String localAppData = System.getenv("LOCALAPPDATA");
            Path base = (localAppData != null && !localAppData.isBlank())
                ? Path.of(localAppData.trim())
                : Path.of(userHome, "AppData", "Local");
            return base.resolve(WIN_DATA_DIR_NAME);
        }

        if (osName.contains("mac") || osName.contains("darwin")) {
            return Path.of(userHome, "Library", "Application Support", APP_DIR_NAME);
        }

        // Linux and other *nix
        String xdgDataHome = System.getenv("XDG_DATA_HOME");
        Path base = (xdgDataHome != null && !xdgDataHome.isBlank())
            ? Path.of(xdgDataHome.trim())
            : Path.of(userHome, ".local", "share");
        return base.resolve(APP_DIR_NAME);
    }

    public Path dataRoot() {
        return dataRoot;
    }

    public Path filesDir() {
        return dataRoot.resolve("storage").resolve("files");
    }

    public Path tempDir() {
        return dataRoot.resolve("storage").resolve("temp");
    }

    public Path metadataDir() {
        return dataRoot.resolve("storage").resolve("metadata");
    }

    /** Per-room JSON documents for the Local Sharing Room feature. */
    public Path roomsDir() {
        return dataRoot.resolve("rooms");
    }

    public Path logsDir() {
        return dataRoot.resolve("logs");
    }

    public Path configDir() {
        return dataRoot.resolve("config");
    }
}
