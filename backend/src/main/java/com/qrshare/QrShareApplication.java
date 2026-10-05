package com.qrshare;

import com.qrshare.config.PortSelector;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
public class QrShareApplication {
    public static void main(String[] args) {
        // Desktop distribution path: when launched as the packaged Windows .exe,
        // jpackage sets -DQR_DESKTOP=true (see windows/build-*.ps1). Spring Boot's
        // JarLauncher remains the jar Main-Class/Start-Class, so the full nested
        // BOOT-INF/lib classpath (including JavaFX) is already wired up here —
        // THEN we hand off to the embedded-WebView host. Web/dev/server mode
        // never sets this flag and runs the server exactly as before.
        if (isDesktopMode()) {
            com.qrshare.desktop.DesktopLauncher.main(args);
            return;
        }

        // Single source of truth for the runtime port: resolve before Spring
        // boots and publish to both server.port and app.server-port.
        PortSelector.resolveAndPublish();
        SpringApplication.run(QrShareApplication.class, args);
    }

    private static boolean isDesktopMode() {
        return Boolean.parseBoolean(System.getProperty("QR_DESKTOP", ""))
            || "true".equalsIgnoreCase(System.getenv("QR_DESKTOP"));
    }
}
