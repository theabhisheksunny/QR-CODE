package com.qrshare.util;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/**
 * Shared, bounded-memory file streamer with HTTP Range support. Used by BOTH
 * the direct-share download ({@code ShareController}) and the room file download
 * ({@code RoomController}) so there is a single streaming implementation.
 *
 * <p>Reads from the stored file via a {@link FileChannel} into a fixed 64&nbsp;KiB
 * buffer and writes to the servlet output — the whole file is never loaded into
 * memory. Honours a single {@code Range} request with {@code 206 Partial
 * Content}; falls back to {@code application/octet-stream} for unknown types.</p>
 */
@Component
@Slf4j
public class FileStreamer {

    private static final int BUFFER_SIZE = 64 * 1024;

    /**
     * Streams {@code filePath} to the response, honouring a Range header.
     *
     * @return true if a response was written; false if the file was missing
     *         (caller may then send a 404 — but this method sends it itself).
     */
    public void stream(Path filePath,
                       String contentType,
                       String originalFileName,
                       HttpServletRequest request,
                       HttpServletResponse response) throws IOException {
        stream(filePath, contentType, originalFileName, request, response, false);
    }

    /**
     * @param forceAttachment when true, always sets
     *        {@code Content-Disposition: attachment} so browsers/WebViews SAVE
     *        the file instead of rendering it inline (used by the explicit
     *        download endpoints). Range/streaming behaviour is unchanged.
     */
    public void stream(Path filePath,
                       String contentType,
                       String originalFileName,
                       HttpServletRequest request,
                       HttpServletResponse response,
                       boolean forceAttachment) throws IOException {
        if (!Files.exists(filePath)) {
            response.sendError(HttpStatus.NOT_FOUND.value(), "File not found in storage");
            return;
        }

        long fileLength = Files.size(filePath);
        String ctype = (contentType != null && !contentType.isBlank())
            ? contentType : MediaType.APPLICATION_OCTET_STREAM_VALUE;

        response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
        response.setHeader(HttpHeaders.CONTENT_TYPE, forceAttachment
            ? MediaType.APPLICATION_OCTET_STREAM_VALUE : ctype);
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION, forceAttachment
            ? "attachment; filename=\"" + sanitizeFilename(originalFileName) + "\""
            : contentDisposition(ctype, originalFileName));

        long start = 0;
        long end = fileLength - 1;
        boolean partial = false;

        String range = request.getHeader(HttpHeaders.RANGE);
        if (range != null && range.startsWith("bytes=")) {
            long[] parsed = parseRange(range, fileLength);
            if (parsed == null) {
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

        try (FileChannel channel = FileChannel.open(filePath, StandardOpenOption.READ)) {
            OutputStream out = response.getOutputStream();
            ByteBuffer buffer = ByteBuffer.allocate(BUFFER_SIZE);
            byte[] chunk = new byte[BUFFER_SIZE];
            long position = start;
            long remaining = contentLength;
            while (remaining > 0) {
                buffer.clear();
                int toRead = (int) Math.min(BUFFER_SIZE, remaining);
                buffer.limit(toRead);
                int read = channel.read(buffer, position);
                if (read <= 0) break;
                buffer.flip();
                buffer.get(chunk, 0, read);
                out.write(chunk, 0, read);
                position += read;
                remaining -= read;
            }
            out.flush();
        } catch (IOException e) {
            log.debug("Download stream ended early ({})", e.getMessage());
        }
    }

    public long[] parseRange(String rangeHeader, long fileLength) {
        try {
            String spec = rangeHeader.substring("bytes=".length());
            if (spec.contains(",")) spec = spec.substring(0, spec.indexOf(','));
            int dash = spec.indexOf('-');
            if (dash < 0) return null;
            String startStr = spec.substring(0, dash).trim();
            String endStr = spec.substring(dash + 1).trim();
            long start;
            long end;
            if (startStr.isEmpty()) {
                long suffix = Long.parseLong(endStr);
                if (suffix <= 0) return null;
                start = Math.max(0, fileLength - suffix);
                end = fileLength - 1;
            } else {
                start = Long.parseLong(startStr);
                end = endStr.isEmpty() ? fileLength - 1 : Long.parseLong(endStr);
            }
            if (start > end || start >= fileLength) return null;
            end = Math.min(end, fileLength - 1);
            return new long[]{start, end};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public String contentDisposition(String contentType, String originalFileName) {
        String safe = sanitizeFilename(originalFileName);
        if (contentType != null && (
            contentType.startsWith("image/") ||
            contentType.startsWith("text/") ||
            contentType.startsWith("video/") ||
            contentType.startsWith("audio/") ||
            contentType.equals("application/pdf"))) {
            return "inline; filename=\"" + safe + "\"";
        }
        return "attachment; filename=\"" + safe + "\"";
    }

    private String sanitizeFilename(String filename) {
        if (filename == null) return "download";
        return filename.replaceAll("[/\\\\\"']", "_");
    }
}
