package com.qrshare.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Response after successfully uploading a file for sharing")
public class FileUploadResponse {

    @Schema(description = "Unique identifier of the shared file record")
    private UUID id;

    @Schema(description = "Original filename as uploaded by the user")
    private String originalFileName;

    @Schema(description = "MIME content type of the file")
    private String contentType;

    @Schema(description = "File size in bytes")
    private Long fileSize;

    @Schema(description = "Shareable URL containing the raw access token")
    private String shareUrl;

    @Schema(description = "Base64-encoded PNG QR code as a data URL for the share URL")
    private String qrCode;

    @Schema(description = "Timestamp when the file was uploaded")
    private Instant createdAt;

    @Schema(description = "Timestamp when the file will expire and become inaccessible")
    private Instant expiresAt;

    @Schema(description = "Number of times the file has been downloaded")
    private int downloadCount;
}
