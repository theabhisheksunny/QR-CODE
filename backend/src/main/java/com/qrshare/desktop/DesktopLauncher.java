package com.qrshare.desktop;

import com.qrshare.QrShareApplication;
import com.qrshare.config.PortSelector;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.concurrent.Worker;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import javafx.scene.web.WebView;
import javafx.stage.Stage;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Embedded-WebView desktop host for the Windows (and any desktop) distribution.
 *
 * <p>This is the entry point used by the packaged Windows {@code .exe}. It is a
 * REAL native application window (JavaFX {@link Stage} + {@link WebView}), not a
 * browser launch. The window renders the <em>existing</em> React production UI
 * that Spring Boot serves from {@code classpath:/static/}; the UI is reused
 * verbatim — nothing is rewritten into Swing/JavaFX controls.</p>
 *
 * <p>Why JavaFX WebView (the compelling technical reason):</p>
 * <ul>
 *   <li>Pure Java — no C#/Rust/.NET toolchain is required to build, which keeps
 *       the self-contained jpackage pipeline working in environments that only
 *       have the JDK + Maven.</li>
 *   <li>jlink/jpackage-friendly — the JavaFX modules bundle into the
 *       self-contained runtime, so the installed app needs no separate
 *       Java/JavaFX install.</li>
 *   <li>Loads the local React SPA over {@code http://localhost:<port>}, so the
 *       whole shared frontend (components, pages, API client, QR UI, share UI,
 *       diagnostics, error handling) is reused unchanged.</li>
 *   <li>Provides a native error/diagnostic window if the backend fails to come
 *       up — never a silent exit.</li>
 * </ul>
 *
 * <p>Startup sequence (directive #10):</p>
 * <pre>
 *   launch EXE -> resolve port -> start Spring Boot -> poll /actuator/health
 *   -> open WebView window at http://localhost:&lt;port&gt; -> ready
 *   (on failure -> native error window, non-zero exit)
 * </pre>
 *
 * <p>The web and plain-server modes are unaffected: they still use
 * {@link QrShareApplication#main(String[])} and never load this class or
 * JavaFX. This class disables the browser auto-open ({@code AUTO_OPEN_BROWSER})
 * so the desktop app shows exactly one window (the embedded WebView), never a
 * second external browser tab.</p>
 */
public class DesktopLauncher extends Application {

    private static final org.slf4j.Logger log =
        org.slf4j.LoggerFactory.getLogger(DesktopLauncher.class);

    private static final String WINDOW_TITLE = "Universal QR Sharing";
    private static final Duration HEALTH_TIMEOUT = Duration.ofSeconds(60);
    private static final Duration POLL_INTERVAL = Duration.ofMillis(500);

    private ConfigurableApplicationContext springContext;
    private volatile int runtimePort = PortSelector.PREFERRED_PORT;
    private volatile String startupError;

    private WebView webView;
    private VBox loadingPane;
    private StackPane root;

    /**
     * STRONG reference to the JS bridge object. CRITICAL: JavaFX WebView holds
     * only a WEAK reference to objects passed to {@code JSObject.setMember(...)}.
     * Without this field the ScanBridge is garbage-collected after
     * installScanBridge() returns, so {@code window.__qrBridge} becomes a dead
     * stub and every {@code window.__qrDownload(...)} call silently fails. We
     * keep a strong reference here for the lifetime of the window.
     */
    private ScanBridge scanBridge;

    /**
     * Desktop entry point. Resolves the runtime port up front (single source of
     * truth, same as {@link QrShareApplication}) and then hands off to the
     * JavaFX lifecycle. Spring Boot itself is started in {@link #start(Stage)}
     * on a background thread so the UI thread can show a loading window
     * immediately.
     */
    public static void main(String[] args) {
        // The embedded WebView IS the UI; never also pop a system browser.
        System.setProperty("app.auto-open-browser", "false");
        if (System.getProperty("java.awt.headless") == null) {
            System.setProperty("java.awt.headless", "false");
        }
        // Resolve + publish the port before anything else, exactly like the
        // server entry point, so WebView, QR links and diagnostics all agree.
        PortSelector.resolveAndPublish();
        launch(args);
    }

    @Override
    public void start(Stage stage) {
        this.runtimePort = currentPort();

        buildUi(stage);
        stage.show();

        // Start the backend off the FX Application Thread so the loading window
        // stays responsive; then poll health and swap in the WebView.
        Thread boot = new Thread(this::startBackendThenLoad, "desktop-backend-boot");
        boot.setDaemon(true);
        boot.start();
    }

    private void buildUi(Stage stage) {
        webView = new WebView();

        ProgressIndicator spinner = new ProgressIndicator();
        spinner.setPrefSize(48, 48);

        Label title = new Label(WINDOW_TITLE);
        title.setFont(Font.font("Segoe UI", FontWeight.SEMI_BOLD, 18));

        Label status = new Label("Starting local service\u2026");
        status.setFont(Font.font("Segoe UI", 12));

        loadingPane = new VBox(14, title, spinner, status);
        loadingPane.setAlignment(Pos.CENTER);
        loadingPane.setPadding(new Insets(24));

        root = new StackPane(loadingPane);
        Scene scene = new Scene(root, 1100, 760);

        stage.setTitle(WINDOW_TITLE);
        stage.setScene(scene);
        stage.setMinWidth(640);
        stage.setMinHeight(480);
    }

    private void startBackendThenLoad() {
        try {
            // Boot Spring in the same JVM. Reuses the identical application
            // context, controllers, services and bundled SPA as web mode.
            springContext = new SpringApplicationBuilder(QrShareApplication.class)
                .properties("app.auto-open-browser=false")
                .run();

            this.runtimePort = currentPort();
            String base = "http://localhost:" + runtimePort;

            if (!waitForHealth(base)) {
                failOnFxThread("The local service did not become healthy within "
                    + HEALTH_TIMEOUT.toSeconds() + "s.\nURL probed: " + base + "/actuator/health");
                return;
            }

            Platform.runLater(() -> loadUi(base));
        } catch (Throwable t) {
            failOnFxThread(describe(t));
        }
    }

    private void loadUi(String base) {
        var engine = webView.getEngine();
        engine.setUserAgent(engine.getUserAgent() + " UniversalQRSharing/Desktop");
        engine.getLoadWorker().stateProperty().addListener((obs, old, state) -> {
            if (state == Worker.State.SUCCEEDED) {
                // Swap the loading pane for the live React UI.
                if (!root.getChildren().contains(webView)) {
                    root.getChildren().setAll(webView);
                }
                installScanBridge(engine);
            } else if (state == Worker.State.FAILED) {
                showErrorPane("Failed to load the application UI from " + base
                    + "\n" + describeLoadError(engine));
            }
        });
        engine.load(base);
    }

    /**
     * Exposes a native QR scanner to the React UI. The WebKit WebView lacks
     * getUserMedia, so the page cannot scan with a browser scanner; instead we
     * publish {@code window.__qrDesktopScan()} which opens the native
     * {@link NativeQrScanner}. On a successful decode the bridge calls the page's
     * {@code window.__qrNativeScanResult(raw)} so the existing shared resolver
     * routes it (/share or /room). This keeps all routing logic in one place.
     */
    private void installScanBridge(javafx.scene.web.WebEngine engine) {
        try {
            netscape.javascript.JSObject window =
                (netscape.javascript.JSObject) engine.executeScript("window");
            // CRITICAL FIX: keep a STRONG Java reference so the bridge is not GC'd.
            if (this.scanBridge == null) {
                this.scanBridge = new ScanBridge(engine);
            }
            window.setMember("__qrBridge", this.scanBridge);
            engine.executeScript(
                "window.__qrDesktopScan = function(){ try { window.__qrBridge.scan(); } catch(e){} };");
            engine.executeScript(
                "window.__qrOpenExternal = function(u){ try { window.__qrBridge.openExternal(u); } catch(e){} };");
            // Download wrapper. Surfaces a bridge error back to the page instead of
            // silently swallowing it (so the trace shows exactly where it failed).
            engine.executeScript(
                "window.__qrDownload = function(u,f){ try { window.__qrBridge.download(u,f); }"
              + " catch(e){ if(window.__qrDownloadResult) window.__qrDownloadResult(false,"
              + " 'JS bridge call failed: '+e, ''); } };");
            // Diagnostic ping: lets the page confirm the Java bridge is ALIVE
            // (not just that the JS wrapper exists). Returns a known string.
            engine.executeScript(
                "window.__qrBridgePing = function(){ try { return window.__qrBridge.ping(); }"
              + " catch(e){ return 'DEAD:'+e; } };");
            log.info("Native bridge installed (strong ref held): __qrDesktopScan, __qrOpenExternal, __qrDownload, __qrBridgePing.");
        } catch (Throwable t) {
            log.warn("Could not install native scan bridge: {}", t.toString());
        }
    }

    /** Java object bridged into the page as {@code window.__qrBridge}. */
    public final class ScanBridge {
        private final javafx.scene.web.WebEngine engine;

        ScanBridge(javafx.scene.web.WebEngine engine) {
            this.engine = engine;
        }

        /** Diagnostic: confirm the bridge object is alive (not GC'd). */
        public String ping() {
            return "ALIVE";
        }

        /** Called from JS; opens the native webcam scanner. */
        public void scan() {
            Platform.runLater(() -> {
                NativeQrScanner scanner = new NativeQrScanner(raw -> deliver(raw));
                scanner.open();
            });
        }

        /**
         * Opens a URL in the user's real OS browser (so file downloads go through
         * the browser's download manager / save dialog rather than rendering
         * inline in the WebView). Runs off the FX thread.
         */
        public void openExternal(String url) {
            Thread t = new Thread(() -> {
                try {
                    if (java.awt.Desktop.isDesktopSupported()
                        && java.awt.Desktop.getDesktop().isSupported(java.awt.Desktop.Action.BROWSE)) {
                        java.awt.Desktop.getDesktop().browse(java.net.URI.create(url));
                        return;
                    }
                } catch (Throwable ignored) { /* fall through to OS launcher */ }
                try {
                    new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
                } catch (Throwable e) {
                    log.warn("openExternal failed for {}: {}", url, e.toString());
                }
            }, "qr-open-external");
            t.setDaemon(true);
            t.start();
        }

        /**
         * Native in-app download: prompts for a save location (defaulting to the
         * user's Downloads folder) and STREAMS the URL to disk with a bounded
         * 64 KiB buffer — no whole-file buffering, so large files are fine. The
         * user never leaves the application. Reports success/failure + saved path
         * back to the page via window.__qrDownloadResult.
         */
        public void download(String url, String filename) {
            log.info("[download] Java bridge invoked. url host={}, filename={}",
                safeHost(url), filename);
            Platform.runLater(() -> {
                try {
                    javafx.stage.FileChooser chooser = new javafx.stage.FileChooser();
                    String safeName = (filename == null || filename.isBlank()) ? "download" : filename;
                    chooser.setInitialFileName(safeName);
                    java.io.File downloads = new java.io.File(System.getProperty("user.home", "."), "Downloads");
                    if (downloads.isDirectory()) {
                        chooser.setInitialDirectory(downloads);
                    }
                    log.info("[download] Opening FileChooser for '{}'", safeName);
                    java.io.File target = chooser.showSaveDialog(null);
                    if (target == null) {
                        log.info("[download] FileChooser cancelled");
                        downloadResult(false, "Download cancelled", null);
                        return;
                    }
                    log.info("[download] Save target selected: {}", target.getAbsolutePath());
                    Thread dt = new Thread(() -> streamToDisk(url, target), "qr-native-download");
                    dt.setDaemon(true);
                    dt.start();
                } catch (Throwable e) {
                    log.error("[download] Could not start download", e);
                    downloadResult(false, "Could not start download: " + e.getMessage(), null);
                }
            });
        }

        /** Safe host extraction for logging (no tokens). */
        private static String safeHost(String url) {
            try { return new java.net.URI(url).getHost(); } catch (Exception e) { return "(bad url)"; }
        }

        private void streamToDisk(String url, java.io.File target) {
            long expectedBytes = -1;   // from Content-Length, if present
            long written = 0;          // bytes written to the output stream
            try {
                log.info("[download] streamToDisk starting — url host={}", safeHost(url));
                java.net.http.HttpClient http = java.net.http.HttpClient.newHttpClient();
                java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url)).GET().build();
                log.info("[download] Sending HTTP GET...");
                java.net.http.HttpResponse<java.io.InputStream> resp =
                    http.send(req, java.net.http.HttpResponse.BodyHandlers.ofInputStream());
                int httpStatus = resp.statusCode();
                String clHeader = resp.headers().firstValue("content-length").orElse(null);
                if (clHeader != null) {
                    try { expectedBytes = Long.parseLong(clHeader.trim()); } catch (NumberFormatException ignored) { }
                }
                log.info("[download] HTTP {} — Content-Length={}, Content-Disposition={}",
                    httpStatus, clHeader == null ? "(absent)" : clHeader,
                    resp.headers().firstValue("content-disposition").orElse("(absent)"));

                // (1) HTTP response must be a success before we trust any bytes.
                if (httpStatus / 100 != 2) {
                    String msg = "Server returned HTTP " + httpStatus;
                    log.warn("[download] {}", msg);
                    downloadFailure(msg, httpStatus, expectedBytes, 0, false, 0);
                    return;
                }

                // (2) Stream the body; (3) the try-with-resources CLOSES the output
                // stream before we proceed to verification below.
                try (java.io.InputStream in = resp.body();
                     java.io.OutputStream out = new java.io.BufferedOutputStream(new java.io.FileOutputStream(target))) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        written += n;
                    }
                    out.flush();
                } // <-- streams closed here (requirement #3)

                // (4) Destination file must exist. (5) size must be > 0.
                boolean fileExists = target.exists() && target.isFile();
                long savedBytes = fileExists ? target.length() : -1;
                boolean saveCompleted = fileExists && savedBytes > 0;

                // (6) If Content-Length is known, writtenBytes AND savedBytes must match it.
                boolean lengthMatches = true;
                if (expectedBytes >= 0) {
                    lengthMatches = (written == expectedBytes) && (savedBytes == expectedBytes);
                }

                log.info("[download] verify — httpStatus={}, expectedBytes={}, writtenBytes={}, "
                        + "fileExists={}, savedBytes={}, saveCompleted={}, lengthMatches={}",
                    httpStatus, expectedBytes, written, fileExists, savedBytes, saveCompleted, lengthMatches);

                if (!saveCompleted) {
                    downloadFailure("Save incomplete (file missing or empty)",
                        httpStatus, expectedBytes, written, fileExists, savedBytes);
                    return;
                }
                if (!lengthMatches) {
                    downloadFailure("Byte-count mismatch (expected " + expectedBytes
                            + ", wrote " + written + ", saved " + savedBytes + ")",
                        httpStatus, expectedBytes, written, true, savedBytes);
                    return;
                }

                // All checks passed → genuine success.
                downloadSuccess(target.getAbsolutePath(), httpStatus, expectedBytes, written, savedBytes);
            } catch (Throwable e) {
                log.error("[download] streamToDisk failed", e);
                boolean fileExists = target.exists() && target.isFile();
                long savedBytes = fileExists ? target.length() : -1;
                downloadFailure("Download failed: " + e.getMessage(),
                    -1, expectedBytes, written, fileExists, savedBytes);
            }
        }

        /** Builds a safe (token-free) diagnostics suffix for the result message. */
        private String diagSuffix(int httpStatus, long expectedBytes, long writtenBytes,
                                  boolean fileExists, long savedBytes, boolean saveCompleted) {
            return " [httpStatus=" + httpStatus
                + ", expectedBytes=" + (expectedBytes >= 0 ? expectedBytes : "(unknown)")
                + ", writtenBytes=" + writtenBytes
                + ", fileExists=" + fileExists
                + ", savedBytes=" + (savedBytes >= 0 ? savedBytes : "(n/a)")
                + ", saveCompleted=" + saveCompleted + "]";
        }

        private void downloadSuccess(String path, int httpStatus, long expectedBytes,
                                     long writtenBytes, long savedBytes) {
            String msg = "Saved" + diagSuffix(httpStatus, expectedBytes, writtenBytes, true, savedBytes, true);
            downloadResult(true, msg, path);
        }

        private void downloadFailure(String reason, int httpStatus, long expectedBytes,
                                     long writtenBytes, boolean fileExists, long savedBytes) {
            String msg = reason + diagSuffix(httpStatus, expectedBytes, writtenBytes, fileExists, savedBytes,
                fileExists && savedBytes > 0);
            downloadResult(false, msg, null);
        }

        private void downloadResult(boolean ok, String message, String path) {
            String js = "window.__qrDownloadResult && window.__qrDownloadResult("
                + ok + "," + toJsString(message) + "," + toJsString(path == null ? "" : path) + ");";
            Platform.runLater(() -> {
                try { engine.executeScript(js); } catch (Throwable ignored) { }
            });
        }

        private void deliver(String raw) {
            // Hand the decoded value to the page's shared resolver bridge.
            String js = "window.__qrNativeScanResult && window.__qrNativeScanResult("
                + toJsString(raw) + ");";
            try {
                engine.executeScript(js);
            } catch (Throwable t) {
                log.warn("Could not deliver scan result to page: {}", t.toString());
            }
        }

        private String toJsString(String s) {
            if (s == null) return "''";
            String escaped = s.replace("\\", "\\\\").replace("'", "\\'")
                .replace("\n", "\\n").replace("\r", "\\r");
            return "'" + escaped + "'";
        }
    }

    /** Polls {@code /actuator/health} until UP or the timeout elapses. */
    private boolean waitForHealth(String base) {
        HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create(base + "/actuator/health"))
            .timeout(Duration.ofSeconds(2))
            .GET()
            .build();

        long deadline = System.nanoTime() + HEALTH_TIMEOUT.toNanos();
        while (System.nanoTime() < deadline) {
            try {
                HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
                if (resp.statusCode() == 200 && resp.body() != null && resp.body().contains("UP")) {
                    return true;
                }
            } catch (Exception ignored) {
                // backend not up yet; keep polling
            }
            try {
                Thread.sleep(POLL_INTERVAL.toMillis());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    private void failOnFxThread(String message) {
        this.startupError = message;
        Platform.runLater(() -> showErrorPane(message));
    }

    /**
     * Replaces the window content with a native error/diagnostic pane. Satisfies
     * directive #10: on backend-startup failure the app must NOT silently exit;
     * it shows a real desktop error window.
     */
    private void showErrorPane(String message) {
        Label heading = new Label("Universal QR Sharing could not start");
        heading.setFont(Font.font("Segoe UI", FontWeight.BOLD, 18));

        Label detail = new Label(message);
        detail.setWrapText(true);
        detail.setFont(Font.font("Segoe UI", 12));
        detail.setMaxWidth(760);

        Label hint = new Label(
            "Troubleshooting: ensure no other instance is running, that a port in "
            + "8787\u20138887 is free, and that %LOCALAPPDATA%\\UniversalQRSharing-Data is writable.");
        hint.setWrapText(true);
        hint.setFont(Font.font("Segoe UI", 11));
        hint.setMaxWidth(760);

        VBox box = new VBox(14, heading, detail, hint);
        box.setAlignment(Pos.CENTER_LEFT);
        box.setPadding(new Insets(28));
        root.getChildren().setAll(box);
    }

    private int currentPort() {
        String p = System.getProperty("app.server-port",
            System.getProperty("server.port", Integer.toString(PortSelector.PREFERRED_PORT)));
        try {
            return Integer.parseInt(p.trim());
        } catch (NumberFormatException e) {
            return PortSelector.PREFERRED_PORT;
        }
    }

    private static String describe(Throwable t) {
        StringBuilder sb = new StringBuilder();
        Throwable cur = t;
        int depth = 0;
        while (cur != null && depth < 5) {
            if (depth > 0) {
                sb.append("\nCaused by: ");
            }
            sb.append(cur.getClass().getSimpleName());
            if (cur.getMessage() != null) {
                sb.append(": ").append(cur.getMessage());
            }
            cur = cur.getCause();
            depth++;
        }
        return sb.toString();
    }

    private static String describeLoadError(javafx.scene.web.WebEngine engine) {
        Throwable ex = engine.getLoadWorker().getException();
        return ex != null ? describe(ex) : "(no further detail from the web engine)";
    }

    @Override
    public void stop() {
        // Clean, graceful shutdown of the embedded backend when the window closes.
        try {
            if (springContext != null && springContext.isActive()) {
                springContext.close();
            }
        } finally {
            Platform.exit();
            // Ensure the process actually terminates (daemon threads aside).
            Runtime.getRuntime().halt(startupError != null ? 1 : 0);
        }
    }
}
