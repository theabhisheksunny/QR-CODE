package com.qrshare.service;

import com.qrshare.config.AppProperties;
import com.qrshare.dto.FileMetadataResponse;
import com.qrshare.dto.FileUploadResponse;
import com.qrshare.exception.FileExpiredException;
import com.qrshare.exception.FileNotFoundException;
import com.qrshare.storage.MetadataStorageService;
import com.qrshare.storage.SharedFileMetadata;
import com.qrshare.storage.FileStorageService;
import com.qrshare.util.TokenUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class FileShareService {

    private final MetadataStorageService metadataStorageService;
    private final FileStorageService fileStorageService;
    private final QrCodeService qrCodeService;
    private final TokenUtil tokenUtil;
    private final AppProperties appProperties;
    private final ShareUrlService shareUrlService;

    public FileUploadResponse uploadFile(MultipartFile file, int expirationMinutes) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File must not be empty");
        }

        // No artificial size cap: arbitrarily large files are supported. A file
        // only fails for genuine environmental reasons (disk full, I/O error,
        // permission denied, cancelled/incomplete upload), which surface as
        // IOExceptions from the streaming store below.
        String storageKey = UUID.randomUUID().toString();
        String rawToken = tokenUtil.generateToken();

        // Store the blob first; persist metadata only after a successful store so
        // a failed/aborted upload never leaves orphaned metadata behind.
        try {
            fileStorageService.store(file.getInputStream(), storageKey, file.getContentType());
        } catch (IOException e) {
            throw new RuntimeException("Failed to store uploaded file: " + e.getMessage(), e);
        }

        Instant now = Instant.now();
        SharedFileMetadata metadata;
        try {
            metadata = SharedFileMetadata.builder()
                .id(UUID.randomUUID())
                .token(rawToken)
                .originalFileName(file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown")
                .storageKey(storageKey)
                .contentType(file.getContentType())
                .fileSize(file.getSize())
                .createdAt(now)
                .expiresAt(now.plus(expirationMinutes, ChronoUnit.MINUTES))
                .downloadCount(0)
                .status("ACTIVE")
                .build();

            metadata = metadataStorageService.save(metadata);
        } catch (RuntimeException e) {
            // Metadata persistence failed after the blob landed: roll back the blob.
            fileStorageService.delete(storageKey);
            throw e;
        }

        String shareUrl = buildShareUrl(rawToken);
        String qrCode = qrCodeService.generateQrCode(shareUrl);

        log.info("File uploaded: id={}, name={}, expires={}", metadata.getId(),
            metadata.getOriginalFileName(), metadata.getExpiresAt());

        return FileUploadResponse.builder()
            .id(metadata.getId())
            .originalFileName(metadata.getOriginalFileName())
            .contentType(metadata.getContentType())
            .fileSize(metadata.getFileSize())
            .shareUrl(shareUrl)
            .qrCode(qrCode)
            .createdAt(metadata.getCreatedAt())
            .expiresAt(metadata.getExpiresAt())
            .downloadCount(metadata.getDownloadCount())
            .build();
    }

    public FileMetadataResponse getFileMetadata(UUID id) {
        SharedFileMetadata metadata = metadataStorageService.findById(id)
            .filter(m -> "ACTIVE".equals(m.getStatus()))
            .orElseThrow(() -> new FileNotFoundException("File not found with id: " + id));

        if (metadata.getExpiresAt().isBefore(Instant.now())) {
            throw new FileExpiredException("File with id " + id + " has expired");
        }

        return mapToMetadataResponse(metadata, null);
    }

    public FileMetadataResponse getFileMetadataByToken(String rawToken) {
        SharedFileMetadata metadata = resolveAndValidateToken(rawToken);
        String shareUrl = buildShareUrl(rawToken);
        return mapToMetadataResponse(metadata, shareUrl);
    }

    public Resource loadFileResource(String rawToken) {
        SharedFileMetadata metadata = resolveAndValidateToken(rawToken);
        try {
            return fileStorageService.load(metadata.getStorageKey());
        } catch (IOException e) {
            throw new FileNotFoundException("Could not load file resource: " + e.getMessage());
        }
    }

    public SharedFileMetadata getSharedFileForStreaming(String rawToken) {
        return resolveAndValidateToken(rawToken);
    }

    public void incrementDownloadCount(UUID id) {
        metadataStorageService.findById(id).ifPresent(m -> {
            m.setDownloadCount(m.getDownloadCount() + 1);
            metadataStorageService.save(m);
        });
    }

    public void deleteFile(UUID id) {
        SharedFileMetadata metadata = metadataStorageService.findById(id)
            .orElseThrow(() -> new FileNotFoundException("File not found with id: " + id));

        fileStorageService.delete(metadata.getStorageKey());
        metadataStorageService.delete(id);
        log.info("File deleted: id={}", id);
    }

    private SharedFileMetadata resolveAndValidateToken(String rawToken) {
        SharedFileMetadata metadata = metadataStorageService.findByToken(rawToken)
            .orElseThrow(() -> new FileNotFoundException("File not found for provided token"));

        if (!"ACTIVE".equals(metadata.getStatus())) {
            throw new FileNotFoundException("File is no longer available");
        }

        if (metadata.getExpiresAt().isBefore(Instant.now())) {
            throw new FileExpiredException("File has expired and is no longer accessible");
        }

        return metadata;
    }

    private String buildShareUrl(String rawToken) {
        return shareUrlService.buildShareUrl(rawToken);
    }

    private FileMetadataResponse mapToMetadataResponse(SharedFileMetadata metadata, String shareUrl) {
        return FileMetadataResponse.builder()
            .id(metadata.getId())
            .originalFileName(metadata.getOriginalFileName())
            .contentType(metadata.getContentType())
            .fileSize(metadata.getFileSize())
            .shareUrl(shareUrl)
            .createdAt(metadata.getCreatedAt())
            .expiresAt(metadata.getExpiresAt())
            .downloadCount(metadata.getDownloadCount())
            .build();
    }
}
