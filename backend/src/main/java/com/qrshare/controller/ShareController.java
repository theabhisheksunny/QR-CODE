package com.qrshare.controller;

import com.qrshare.service.FileShareService;
import com.qrshare.storage.FileStorageService;
import com.qrshare.storage.SharedFileMetadata;
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

    @GetMapping("/api/files/share/{token}")
    @Operation(summary = "Stream or download a shared file using its access token")
    public ResponseEntity<Resource> streamFile(@PathVariable String token) throws IOException {
        SharedFileMetadata metadata = fileShareService.getSharedFileForStreaming(token);
        Resource resource = fileStorageService.load(metadata.getStorageKey());

        fileShareService.incrementDownloadCount(metadata.getId());

        String contentType = metadata.getContentType() != null
            ? metadata.getContentType()
            : MediaType.APPLICATION_OCTET_STREAM_VALUE;

        String disposition = resolveContentDisposition(contentType, metadata.getOriginalFileName());

        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.CONTENT_DISPOSITION, disposition);
        headers.add(HttpHeaders.CONTENT_TYPE, contentType);
        if (metadata.getFileSize() != null) {
            headers.add(HttpHeaders.CONTENT_LENGTH, String.valueOf(metadata.getFileSize()));
        }

        log.info("Streaming file: id={}, name={}, type={}", metadata.getId(),
            metadata.getOriginalFileName(), contentType);

        return ResponseEntity.ok()
            .headers(headers)
            .body(resource);
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
        return filename.replaceAll("[/\\\\\"']", "_");
    }
}
