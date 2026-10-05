package com.qrshare.desktop;

/**
 * Thin, non-JavaFX entry point for the packaged desktop {@code .exe}.
 *
 * <p>JavaFX refuses to start with "JavaFX runtime components are missing" when
 * the launched main class itself {@code extends Application} and JavaFX is on
 * the classpath (unnamed module) rather than the module path. The documented
 * workaround is to launch from a separate class that does NOT extend
 * {@link javafx.application.Application}; that class simply forwards to the real
 * {@link DesktopLauncher}. jpackage therefore targets THIS class as its
 * {@code --main-class}.</p>
 *
 * <p>This keeps the Spring Boot fat jar's own {@code Start-Class}
 * ({@code QrShareApplication}, the web/server entry point) untouched, so web and
 * dev modes are completely unaffected.</p>
 */
public final class DesktopMain {

    private DesktopMain() {
    }

    public static void main(String[] args) {
        DesktopLauncher.main(args);
    }
}
