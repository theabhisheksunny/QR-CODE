package com.qrshare.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "shared_files")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SharedFile {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String originalFileName;

    @Column(nullable = false, unique = true)
    private String storageKey;

    private String contentType;

    private Long fileSize;

    @Column(nullable = false)
    private String tokenHash;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    @Builder.Default
    private int downloadCount = 0;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private FileStatus status;

    public enum FileStatus {
        ACTIVE, DELETED, EXPIRED
    }

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (status == null) {
            status = FileStatus.ACTIVE;
        }
        if (downloadCount < 0) {
            downloadCount = 0;
        }
    }
}
