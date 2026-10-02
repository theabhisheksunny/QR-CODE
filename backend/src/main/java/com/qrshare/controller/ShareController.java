package com.qrshare.controller;

import com.qrshare.model.SharedFile;
import com.qrshare.service.FileShareService;
import com.qrshare.storage.FileStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@Slf4j
@RequiredArgsConstructor
@Tag(name = "File Access", description = "Stream or download shared files by token")
public class ShareController {

    private final FileShareService fileShareService;
    private final FileStorageService fileStorageService;

    /**
     * Primary file streaming endpoint used in share URLs and QR codes.
     * Increments download count and streams the file to the caller.
     */
    @GetMapping("/api/files/share/{token}")
    @Operation(summary = "Stream or download a shared file using its access token")
    public ResponseEntity<Resource> streamFile(@PathVariable String token) throws IOException {
        SharedFile sharedFile = fileShareService.getSharedFileForStreaming(token);
        Resource resource = fileStorageService.load(sharedFile.getStorageKey());

        fileShareService.incrementDownloadCount(sharedFile.getId());

        String contentType = sharedFile.getContentType() != null
            ? sharedFile.getContentType()
            : MediaType.APPLICATION_OCTET_STREAM_VALUE;

        String disposition = resolveContentDisposition(contentType, sharedFile.getOriginalFileName());

        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.CONTENT_DISPOSITION, disposition);
        headers.add(HttpHeaders.CONTENT_TYPE, contentType);
        if (sharedFile.getFileSize() != null) {
            headers.add(HttpHeaders.CONTENT_LENGTH, String.valueOf(sharedFile.getFileSize()));
        }

        log.info("Streaming file: id={}, name={}, type={}", sharedFile.getId(),
            sharedFile.getOriginalFileName(), contentType);

        return ResponseEntity.ok()
            .headers(headers)
            .body(resource);
    }

    /**
     * Convenience redirect endpoint: /share/{token} → /api/files/share/{token}
     * Allows short QR URLs if the frontend uses /share/... paths.
     */
    @GetMapping("/share/{token}")
    @Operation(summary = "Redirect short share URL to the API file streaming endpoint")
    public ResponseEntity<Void> redirectToFileEndpoint(@PathVariable String token) {
        return ResponseEntity.status(302)
            .header(HttpHeaders.LOCATION, "/api/files/share/" + token)
            .build();
    }

    private String resolveContentDisposition(String contentType, String originalFileName) {
        if (contentType != null && (
            contentType.startsWith("image/") ||
            contentType.startsWith("text/") ||
            contentType.startsWith("video/") ||
            contentType.startsWith("audio/") ||
            contentType.equals("application/pdf")
        )) {
            return "inline; filename=\"" + sanitizeFilename(originalFileName) + "\"";
        }
        return "attachment; filename=\"" + sanitizeFilename(originalFileName) + "\"";
    }

    private String sanitizeFilename(String filename) {
        if (filename == null) return "download";
        // Remove path traversal characters and quotes
        return filename.replaceAll("[/\\\\\"']", "_");
    }
}
