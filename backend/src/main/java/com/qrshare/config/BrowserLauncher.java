package com.qrshare.config;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.awt.Desktop;
import java.net.URI;
import java.util.Locale;

/**
 * Opens the user's default web browser to the locally served UI once the
 * application is fully started.
 *
 * <p>Rationale: the packaged Windows app (jpackage) is a headless Spring Boot
 * server with no native window. Without this, a user who double-clicks the
 * installed executable sees <em>nothing</em> on screen — the backend starts
 * silently in the background — and reasonably concludes "the app did not
 * launch". Auto-opening the browser gives the installed app a visible UI and a
 * real launch experience.</p>
 *
 * <p>Design notes:</p>
 * <ul>
 *   <li>Uses the resolved runtime port ({@link AppProperties#getServerPort()}),
 *       which is the single source of truth published by
 *       {@link PortSelector} before Spring boots, so the browser always targets
 *       the port Tomcat actually bound to (even if 8787 was occupied).</li>
 *   <li>Targets {@code http://localhost:<port>} (the loopback UI for the local
 *       user). LAN/QR share URLs still use the detected LAN IP — that concern is
 *       owned by {@code ShareUrlService} and is unaffected here.</li>
 *   <li>Can be disabled with {@code app.auto-open-browser=false} or the
 *       {@code QR_NO_BROWSER} environment variable (useful for headless/server
 *       deployments and automated tests).</li>
 *   <li>Fails soft: a browser-launch error is logged with the URL to open
 *       manually and never aborts startup.</li>
 *   <li>Runs the open on a short-lived daemon thread so a slow browser launch
 *       never blocks the main thread.</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class BrowserLauncher {

    private final AppProperties appProperties;

    private volatile boolean enabled = true;

    @PostConstruct
    void resolveEnabled() {
        // Property wins; env var is a convenience override for headless runs.
        if (!appProperties.isAutoOpenBrowser()) {
            enabled = false;
        }
        String env = System.getenv("QR_NO_BROWSER");
        if (env != null && !env.isBlank()) {
            enabled = false;
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        int port = appProperties.getServerPort();
        String url = "http://localhost:" + port;

        if (!enabled) {
            log.info("Auto-open browser disabled. Open the app manually at: {}", url);
            return;
        }

        Thread t = new Thread(() -> openBrowser(url), "browser-launcher");
        t.setDaemon(true);
        t.start();
    }

    private boolean awtUsable() {
        // The jpackage/jlink runtime frequently reports AWT as "headless"
        // (java.awt.headless=true by default for a server-style image), which
        // would make Desktop.browse throw. That must NOT stop us: the OS-native
        // launcher (rundll32/open/xdg-open) opens the user's real browser
        // regardless of AWT's headless state. So we only *attempt* Desktop when
        // AWT is genuinely usable, and always fall back to the OS launcher.
        try {
            return !Boolean.getBoolean("java.awt.headless")
                && !java.awt.GraphicsEnvironment.isHeadless();
        } catch (Throwable e) {
            return false;
        }
    }

    private void openBrowser(String url) {
        // 1) Preferred: java.awt.Desktop (only when AWT is actually usable).
        if (awtUsable()) {
            try {
                if (Desktop.isDesktopSupported()
                    && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                    Desktop.getDesktop().browse(URI.create(url));
                    log.info("Opened default browser at {}", url);
                    return;
                }
            } catch (Throwable e) {
                log.warn("Desktop.browse failed ({}); trying OS fallback", e.toString());
            }
        }

        // 2) OS-specific native launcher — works even when AWT is headless.
        try {
            String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
            ProcessBuilder pb;
            if (os.contains("win")) {
                pb = new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url);
            } else if (os.contains("mac") || os.contains("darwin")) {
                pb = new ProcessBuilder("open", url);
            } else {
                pb = new ProcessBuilder("xdg-open", url);
            }
            pb.inheritIO().start();
            log.info("Opened default browser via OS handler at {}", url);
            return;
        } catch (Throwable e) {
            log.warn("OS browser fallback failed: {}", e.toString());
        }

        // 3) Give up gracefully — never crash startup.
        log.warn("Could not auto-open a browser. Open the app manually at: {}", url);
    }
}
