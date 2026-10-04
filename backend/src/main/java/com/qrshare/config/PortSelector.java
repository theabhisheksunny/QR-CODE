package com.qrshare.config;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;

/**
 * Single source of truth for runtime port selection. Resolved once in
 * {@code main()} before Spring starts, then published to both
 * {@code server.port} and {@code app.server-port} system properties so the web
 * server, diagnostics, QR generation, and API layer all agree on one value.
 */
public final class PortSelector {

    public static final int PREFERRED_PORT = 8787;
    private static final int SCAN_START = 8787;
    private static final int SCAN_END = 8887;

    private PortSelector() {
    }

    /**
     * Determines the runtime port: honours the {@code SERVER_PORT} env var
     * (default {@link #PREFERRED_PORT}); if that port is busy, scans
     * {@value #SCAN_START}..{@value #SCAN_END} for the first free port.
     */
    public static int selectPort() {
        int preferred = PREFERRED_PORT;
        String env = System.getenv("SERVER_PORT");
        if (env != null && !env.isBlank()) {
            try {
                preferred = Integer.parseInt(env.trim());
            } catch (NumberFormatException ignored) {
                // fall back to the preferred default
            }
        }

        if (isAvailable(preferred)) {
            return preferred;
        }

        for (int port = SCAN_START; port <= SCAN_END; port++) {
            if (port != preferred && isAvailable(port)) {
                return port;
            }
        }

        // Nothing free in range; let the preferred port surface the bind error.
        return preferred;
    }

    /**
     * Resolves the port and publishes it to {@code server.port} and
     * {@code app.server-port} so there is exactly one source of truth.
     */
    public static int resolveAndPublish() {
        int port = selectPort();
        System.setProperty("server.port", Integer.toString(port));
        System.setProperty("app.server-port", Integer.toString(port));
        return port;
    }

    private static boolean isAvailable(int port) {
        if (port < 1 || port > 65535) {
            return false;
        }
        try (ServerSocket socket = new ServerSocket()) {
            socket.setReuseAddress(false);
            socket.bind(new InetSocketAddress(InetAddress.getByName("0.0.0.0"), port));
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
