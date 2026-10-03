package com.qrshare.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

@Service
@Slf4j
public class NetworkService {

    @Value("${server.port:8787}")
    private int serverPort;

    private final AtomicReference<String> ipOverride = new AtomicReference<>(null);

    /**
     * Returns the most suitable LAN IP address for this machine.
     * Checks ipOverride first; otherwise scores all active IPv4 interfaces.
     * Skips loopback, link-local (169.254.x.x), and virtual adapters.
     */
    public String getLocalIpAddress() {
        String override = ipOverride.get();
        if (override != null) {
            return override;
        }
        try {
            String best = null;
            int bestScore = Integer.MIN_VALUE;

            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            if (ifaces == null) return "127.0.0.1";

            while (ifaces.hasMoreElements()) {
                NetworkInterface iface = ifaces.nextElement();
                if (!isUsableInterface(iface)) continue;

                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (!(addr instanceof Inet4Address)) continue;
                    if (addr.isLoopbackAddress()) continue;

                    String ip = addr.getHostAddress();

                    // Skip APIPA / link-local
                    if (ip.startsWith("169.254.")) continue;

                    int score = scoreAddress(ip);
                    if (score > bestScore) {
                        bestScore = score;
                        best = ip;
                    }
                }
            }
            return best != null ? best : "127.0.0.1";
        } catch (SocketException e) {
            log.warn("Could not enumerate network interfaces: {}", e.getMessage());
            return "127.0.0.1";
        }
    }

    /**
     * Returns all usable network interfaces with their IPv4 addresses.
     */
    public List<NetworkInterfaceInfo> getAllInterfaces() {
        List<NetworkInterfaceInfo> result = new ArrayList<>();
        String preferredIp = getLocalIpAddress();

        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            if (ifaces == null) return result;

            while (ifaces.hasMoreElements()) {
                NetworkInterface iface = ifaces.nextElement();
                if (!isUsableInterface(iface)) continue;

                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (!(addr instanceof Inet4Address)) continue;
                    if (addr.isLoopbackAddress()) continue;

                    String ip = addr.getHostAddress();
                    if (ip.startsWith("169.254.")) continue;

                    result.add(new NetworkInterfaceInfo(
                        iface.getName(),
                        iface.getDisplayName(),
                        ip,
                        ip.equals(preferredIp)
                    ));
                }
            }
        } catch (SocketException e) {
            log.warn("Could not enumerate network interfaces: {}", e.getMessage());
        }
        return result;
    }

    /**
     * Returns the base URL used in generated share links (e.g. http://192.168.1.25:8787).
     */
    public String getShareBaseUrl() {
        return "http://" + getLocalIpAddress() + ":" + serverPort;
    }

    /**
     * Returns the share base URL with an explicit port (useful when serverPort is injected later).
     */
    public String getShareBaseUrl(int port) {
        return "http://" + getLocalIpAddress() + ":" + port;
    }

    /**
     * Overrides the auto-detected IP. Pass null to clear the override.
     */
    public void setIpOverride(String ip) {
        ipOverride.set(ip);
        log.info("Network IP override set to: {}", ip);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private boolean isUsableInterface(NetworkInterface iface) {
        try {
            if (iface.isLoopback()) return false;
            if (!iface.isUp()) return false;
            // Skip common virtual adapter names
            String name = iface.getName().toLowerCase();
            if (name.startsWith("vmnet") || name.startsWith("vboxnet") ||
                name.startsWith("docker") || name.startsWith("br-") ||
                name.startsWith("virbr") || name.startsWith("lo")) {
                return false;
            }
            return true;
        } catch (SocketException e) {
            return false;
        }
    }

    private int scoreAddress(String ip) {
        if (ip.startsWith("192.168.")) return 10;
        if (ip.startsWith("10.")) return 8;
        if (ip.matches("172\\.(1[6-9]|2[0-9]|3[0-1])\\..*")) return 6;
        return 1; // any other non-loopback, non-APIPA address
    }
}
