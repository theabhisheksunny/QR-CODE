package com.qrshare.controller;

import com.qrshare.config.AppProperties;
import com.qrshare.config.RuntimePaths;
import com.qrshare.service.CleanupService;
import com.qrshare.service.NetworkInterfaceInfo;
import com.qrshare.service.NetworkService;
import com.qrshare.service.ShareUrlService;
import com.qrshare.storage.MetadataStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/**
 * Read-only operational diagnostics. Exposes runtime health, network, and
 * storage facts for the diagnostics screen. Deliberately excludes raw tokens
 * and other secrets.
 */
@RestController
@RequestMapping("/api/diagnostics")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Diagnostics", description = "Operational diagnostics (no secrets)")
public class DiagnosticsController {

    private final AppProperties appProperties;
    private final RuntimePaths runtimePaths;
    private final NetworkService networkService;
    private final ShareUrlService shareUrlService;
    private final MetadataStorageService metadataStorageService;
    private final CleanupService cleanupService;

    public record DiagnosticsResponse(
        String appVersion,
        int runtimePort,
        String activeInterface,
        String lanIp,
        String dataRoot,
        String filesDir,
        boolean storageWritable,
        long freeDiskSpaceBytes,
        long activeShareCount,
        long cleanupLastRunEpoch,
        String javaVersion,
        String osName
    ) {}

    @GetMapping
    @Operation(summary = "Runtime, network, and storage diagnostics (no secrets)")
    public DiagnosticsResponse getDiagnostics() {
        String lanIp = shareUrlService.activeLanIp();
        String activeInterface = resolveActiveInterface(lanIp);
        long activeShares = metadataStorageService.findAll().stream()
            .filter(m -> "ACTIVE".equals(m.getStatus()))
            .count();

        return new DiagnosticsResponse(
            appProperties.getAppVersion(),
            shareUrlService.runtimePort(),
            activeInterface,
            lanIp,
            runtimePaths.dataRoot().toString(),
            runtimePaths.filesDir().toString(),
            probeStorageWritable(),
            freeDiskSpace(),
            activeShares,
            cleanupService.getLastRunEpoch(),
            System.getProperty("java.version"),
            System.getProperty("os.name")
        );
    }

    private String resolveActiveInterface(String lanIp) {
        return networkService.getAllInterfaces().stream()
            .filter(i -> lanIp != null && lanIp.equals(i.getIpAddress()))
            .map(NetworkInterfaceInfo::getDisplayName)
            .findFirst()
            .orElse(null);
    }

    private boolean probeStorageWritable() {
        Path probe = runtimePaths.tempDir().resolve("diag-" + UUID.randomUUID() + ".probe");
        try {
            Files.createDirectories(runtimePaths.tempDir());
            Files.writeString(probe, "ok");
            return true;
        } catch (IOException e) {
            log.warn("Storage write probe failed: {}", e.getMessage());
            return false;
        } finally {
            try {
                Files.deleteIfExists(probe);
            } catch (IOException e) {
                log.warn("Could not delete diagnostics probe file {}: {}", probe, e.getMessage());
            }
        }
    }

    private long freeDiskSpace() {
        try {
            return Files.getFileStore(runtimePaths.dataRoot()).getUsableSpace();
        } catch (IOException e) {
            log.warn("Could not read free disk space: {}", e.getMessage());
            return -1L;
        }
    }
}
