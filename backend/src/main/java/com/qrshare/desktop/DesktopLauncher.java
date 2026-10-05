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
            } else if (state == Worker.State.FAILED) {
                showErrorPane("Failed to load the application UI from " + base
                    + "\n" + describeLoadError(engine));
            }
        });
        engine.load(base);
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
