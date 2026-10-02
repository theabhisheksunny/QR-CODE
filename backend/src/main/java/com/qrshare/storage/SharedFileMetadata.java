package com.qrshare.storage;

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
public class SharedFileMetadata {

    private UUID id;
    private String token;           // raw token (not hashed) — safe for single-instance local app
    private String originalFileName;
    private String contentType;
    private Long fileSize;
    private String storageKey;      // UUID string matching the filename in files/ directory
    private Instant createdAt;
    private Instant expiresAt;
    @Builder.Default
    private int downloadCount = 0;
    @Builder.Default
    private String status = "ACTIVE"; // ACTIVE, DELETED, EXPIRED
}
