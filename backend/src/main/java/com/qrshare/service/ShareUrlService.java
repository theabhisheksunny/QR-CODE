package com.qrshare.service;

import com.qrshare.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Single source of truth for the outward-facing share URL. Owns the active LAN
 * IP (via {@link NetworkService}) and the runtime port (via
 * {@link AppProperties#getServerPort()}) and composes them into
 * {@code http://<lanIp>:<port>/share/<token>}.
 *
 * It never emits localhost/127.0.0.1 unless the host genuinely has no routable
 * LAN address, in which case the loopback fallback from {@link NetworkService}
 * is the only correct answer.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ShareUrlService {

    private final NetworkService networkService;
    private final AppProperties appProperties;

    /** The currently active LAN IP used in generated share URLs. */
    public String activeLanIp() {
        return networkService.getLocalIpAddress();
    }

    /** The resolved runtime port (single-source-of-truth port selection). */
    public int runtimePort() {
        return appProperties.getServerPort();
    }

    /** Base URL for this host, e.g. {@code http://192.168.1.25:8787}. */
    public String baseUrl() {
        return "http://" + activeLanIp() + ":" + runtimePort();
    }

    /** Builds the full share URL for the given token. */
    public String buildShareUrl(String token) {
        return baseUrl() + "/share/" + token;
    }
}
