package com.qrshare.controller;

import com.qrshare.config.AppProperties;
import com.qrshare.config.RuntimePaths;
import com.qrshare.config.StorageConfig;
import com.qrshare.service.FileShareService;
import com.qrshare.storage.SharedFileMetadata;
import com.qrshare.util.FileStreamer;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Path;

/**
 * Streams direct-share files by token with constant memory and HTTP Range
 * support (delegated to the shared {@link FileStreamer}). Direct-share behaviour
 * is unchanged by the room feature.
 */
@RestController
@Slf4j
@RequiredArgsConstructor
@Tag(name = "File Access", description = "Stream or download shared files by token")
public class ShareController {

    private final FileShareService fileShareService;
    private final AppProperties appProperties;
    private final RuntimePaths runtimePaths;
    private final FileStreamer fileStreamer;

    @GetMapping("/api/files/share/{token}")
    @Operation(summary = "Stream or download a shared file using its access token (supports HTTP Range)")
    public void streamFile(@PathVariable String token,
                           HttpServletRequest request,
                           HttpServletResponse response) throws IOException {
        SharedFileMetadata metadata = fileShareService.getSharedFileForStreaming(token);

        Path filePath = StorageConfig
            .resolveFilesDir(appProperties, runtimePaths)
            .resolve(metadata.getStorageKey());

        // Count a download once per full/initial GET (not for mid-file range probes).
        String range = request.getHeader(HttpHeaders.RANGE);
        boolean initial = range == null || range.startsWith("bytes=0-") || !range.startsWith("bytes=");
        if (initial) {
            fileShareService.incrementDownloadCount(metadata.getId());
        }

        log.info("Streaming direct share: id={}, name={}", metadata.getId(), metadata.getOriginalFileName());
        fileStreamer.stream(filePath, metadata.getContentType(), metadata.getOriginalFileName(), request, response);
    }

    @GetMapping("/api/files/share/{token}/download")
    @Operation(summary = "Download a shared file (forces attachment/save, supports Range)")
    public void downloadFile(@PathVariable String token,
                             HttpServletRequest request,
                             HttpServletResponse response) throws IOException {
        SharedFileMetadata metadata = fileShareService.getSharedFileForStreaming(token);
        Path filePath = StorageConfig
            .resolveFilesDir(appProperties, runtimePaths)
            .resolve(metadata.getStorageKey());

        String range = request.getHeader(HttpHeaders.RANGE);
        boolean initial = range == null || range.startsWith("bytes=0-") || !range.startsWith("bytes=");
        if (initial) {
            fileShareService.incrementDownloadCount(metadata.getId());
        }
        log.info("Downloading direct share (attachment): id={}, name={}", metadata.getId(), metadata.getOriginalFileName());
        // forceAttachment=true -> Content-Disposition: attachment, so WebViews save.
        fileStreamer.stream(filePath, metadata.getContentType(), metadata.getOriginalFileName(), request, response, true);
    }
}
