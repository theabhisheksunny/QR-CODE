package com.qrshare.controller;

import com.qrshare.config.AppProperties;
import com.qrshare.config.RuntimePaths;
import com.qrshare.config.StorageConfig;
import com.qrshare.service.FileShareService;
import com.qrshare.storage.SharedFileMetadata;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/**
 * Streams shared files by token with constant memory and HTTP Range support.
 *
 * <p>Design (large-file safe):</p>
 * <ul>
 *   <li>Reads directly from the stored file on disk via a {@link FileChannel}
 *       and copies to the servlet {@link OutputStream} in a small fixed-size
 *       buffer. The whole file is NEVER loaded into a {@code byte[]} /
 *       {@code ByteArrayOutputStream}, so a 10&nbsp;GB download uses the same
 *       heap as a 10&nbsp;KB one.</li>
 *   <li>Honours a single {@code Range: bytes=start-end} request and replies
 *       {@code 206 Partial Content} with {@code Content-Range}. This is what
 *       lets browsers/players seek within {@code .mp4}/{@code .mkv} and resume
 *       interrupted downloads of {@code .iso}/{@code .zip}/large PDFs.</li>
 *   <li>Advertises {@code Accept-Ranges: bytes} and sets {@code Content-Length}
 *       to the served byte count.</li>
 *   <li>Falls back to {@code application/octet-stream} for unknown content
 *       types — an unknown/absent MIME is never a failure.</li>
 * </ul>
 */
@RestController
@Slf4j
@RequiredArgsConstructor
@Tag(name = "File Access", description = "Stream or download shared files by token")
public class ShareController {

    /** 64 KiB streaming buffer — bounds memory per in-flight download. */
    private static final int BUFFER_SIZE = 64 * 1024;

    private final FileShareService fileShareService;
    private final AppProperties appProperties;
    private final RuntimePaths runtimePaths;

    @GetMapping("/api/files/share/{token}")
    @Operation(summary = "Stream or download a shared file using its access token (supports HTTP Range)")
    public void streamFile(@PathVariable String token,
                           HttpServletRequest request,
                           HttpServletResponse response) throws IOException {
        SharedFileMetadata metadata = fileShareService.getSharedFileForStreaming(token);

        Path filePath = StorageConfig
            .resolveFilesDir(appProperties, runtimePaths)
            .resolve(metadata.getStorageKey());

        if (!Files.exists(filePath)) {
            response.sendError(HttpStatus.NOT_FOUND.value(), "File not found in storage");
            return;
        }

        long fileLength = Files.size(filePath);
        String contentType = (metadata.getContentType() != null && !metadata.getContentType().isBlank())
            ? metadata.getContentType()
            : MediaType.APPLICATION_OCTET_STREAM_VALUE;

        response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
        response.setHeader(HttpHeaders.CONTENT_TYPE, contentType);
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
            resolveContentDisposition(contentType, metadata.getOriginalFileName()));

        String rangeHeader = request.getHeader(HttpHeaders.RANGE);

        long start = 0;
        long end = fileLength - 1;
        boolean partial = false;

        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            long[] parsed = parseRange(rangeHeader, fileLength);
            if (parsed == null) {
                // Unsatisfiable range -> 416 with the valid extent.
                response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes */" + fileLength);
                response.sendError(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE.value());
                return;
            }
            start = parsed[0];
            end = parsed[1];
            partial = true;
        }

        long contentLength = end - start + 1;

        if (partial) {
            response.setStatus(HttpStatus.PARTIAL_CONTENT.value());
            response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes " + start + "-" + end + "/" + fileLength);
        } else {
            response.setStatus(HttpStatus.OK.value());
        }
        response.setHeader(HttpHeaders.CONTENT_LENGTH, String.valueOf(contentLength));

        // Count a download only for a full (non-range, or range starting at 0)
        // GET so media players issuing many range probes don't inflate the count.
        if (!partial || start == 0) {
            fileShareService.incrementDownloadCount(metadata.getId());
        }

        log.info("Streaming file: id={}, name={}, type={}, range={}, bytes={}..{}/{}",
            metadata.getId(), metadata.getOriginalFileName(), contentType, partial, start, end, fileLength);

        // HEAD-less GET only; stream the requested window with bounded memory.
        try (FileChannel channel = FileChannel.open(filePath, StandardOpenOption.READ)) {
            OutputStream out = response.getOutputStream();
            java.nio.ByteBuffer buffer = java.nio.ByteBuffer.allocate(BUFFER_SIZE);
            long position = start;
            long remaining = contentLength;
            byte[] chunk = new byte[BUFFER_SIZE];
            while (remaining > 0) {
                buffer.clear();
                int toRead = (int) Math.min(BUFFER_SIZE, remaining);
                buffer.limit(toRead);
                int read = channel.read(buffer, position);
                if (read <= 0) {
                    break;
                }
                buffer.flip();
                buffer.get(chunk, 0, read);
                out.write(chunk, 0, read);
                position += read;
                remaining -= read;
            }
            out.flush();
        } catch (IOException e) {
            // Client disconnects (closed tab, cancelled download) are normal and
            // not server errors; log at debug and let the container clean up.
            log.debug("Download stream ended early for id={} ({})", metadata.getId(), e.getMessage());
        }
    }

    /**
     * Parses a single-range {@code bytes=start-end} header. Returns
     * {@code [start,end]} inclusive, or {@code null} if unsatisfiable. Multi-range
     * requests fall back to the first range only.
     */
    private long[] parseRange(String rangeHeader, long fileLength) {
        try {
            String spec = rangeHeader.substring("bytes=".length());
            if (spec.contains(",")) {
                spec = spec.substring(0, spec.indexOf(','));
            }
            int dash = spec.indexOf('-');
            if (dash < 0) {
                return null;
            }
            String startStr = spec.substring(0, dash).trim();
            String endStr = spec.substring(dash + 1).trim();

            long start;
            long end;
            if (startStr.isEmpty()) {
                // Suffix range: bytes=-N -> last N bytes.
                long suffix = Long.parseLong(endStr);
                if (suffix <= 0) {
                    return null;
                }
                start = Math.max(0, fileLength - suffix);
                end = fileLength - 1;
            } else {
                start = Long.parseLong(startStr);
                end = endStr.isEmpty() ? fileLength - 1 : Long.parseLong(endStr);
            }

            if (start > end || start >= fileLength) {
                return null;
            }
            end = Math.min(end, fileLength - 1);
            return new long[]{start, end};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String resolveContentDisposition(String contentType, String originalFileName) {
        String safe = sanitizeFilename(originalFileName);
        if (contentType != null && (
            contentType.startsWith("image/") ||
            contentType.startsWith("text/") ||
            contentType.startsWith("video/") ||
            contentType.startsWith("audio/") ||
            contentType.equals("application/pdf")
        )) {
            return "inline; filename=\"" + safe + "\"";
        }
        return "attachment; filename=\"" + safe + "\"";
    }

    private String sanitizeFilename(String filename) {
        if (filename == null) return "download";
        return filename.replaceAll("[/\\\\\"']", "_");
    }
}
