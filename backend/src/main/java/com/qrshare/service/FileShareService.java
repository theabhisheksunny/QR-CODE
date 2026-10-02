package com.qrshare.service;

import com.qrshare.config.AppProperties;
import com.qrshare.dto.FileMetadataResponse;
import com.qrshare.dto.FileUploadResponse;
import com.qrshare.exception.FileExpiredException;
import com.qrshare.exception.FileNotFoundException;
import com.qrshare.exception.FileTooLargeException;
import com.qrshare.model.SharedFile;
import com.qrshare.repository.SharedFileRepository;
import com.qrshare.storage.FileStorageService;
import com.qrshare.util.TokenUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
public class FileShareService {

    private final SharedFileRepository sharedFileRepository;
    private final FileStorageService fileStorageService;
    private final QrCodeService qrCodeService;
    private final TokenUtil tokenUtil;
    private final AppProperties appProperties;

    @Transactional
    public FileUploadResponse uploadFile(MultipartFile file, int expirationMinutes) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File must not be empty");
        }

        long maxBytes = (long) appProperties.getMaxFileSizeMb() * 1024 * 1024;
        if (file.getSize() > maxBytes) {
            throw new FileTooLargeException(
                "File size " + file.getSize() + " bytes exceeds maximum allowed size of "
                + appProperties.getMaxFileSizeMb() + " MB");
        }

        String storageKey = UUID.randomUUID().toString();
        String rawToken = tokenUtil.generateToken();
        String tokenHash = tokenUtil.hashToken(rawToken);

        try {
            fileStorageService.store(file.getInputStream(), storageKey, file.getContentType());
        } catch (IOException e) {
            throw new RuntimeException("Failed to store uploaded file: " + e.getMessage(), e);
        }

        Instant now = Instant.now();
        SharedFile sharedFile = SharedFile.builder()
            .originalFileName(file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown")
            .storageKey(storageKey)
            .contentType(file.getContentType())
            .fileSize(file.getSize())
            .tokenHash(tokenHash)
            .createdAt(now)
            .expiresAt(now.plus(expirationMinutes, ChronoUnit.MINUTES))
            .downloadCount(0)
            .status(SharedFile.FileStatus.ACTIVE)
            .build();

        sharedFile = sharedFileRepository.save(sharedFile);

        String shareUrl = buildShareUrl(rawToken);
        String qrCode = qrCodeService.generateQrCode(shareUrl);

        log.info("File uploaded: id={}, name={}, expires={}", sharedFile.getId(),
            sharedFile.getOriginalFileName(), sharedFile.getExpiresAt());

        return FileUploadResponse.builder()
            .id(sharedFile.getId())
            .originalFileName(sharedFile.getOriginalFileName())
            .contentType(sharedFile.getContentType())
            .fileSize(sharedFile.getFileSize())
            .shareUrl(shareUrl)
            .qrCode(qrCode)
            .createdAt(sharedFile.getCreatedAt())
            .expiresAt(sharedFile.getExpiresAt())
            .downloadCount(sharedFile.getDownloadCount())
            .build();
    }

    @Transactional(readOnly = true)
    public FileMetadataResponse getFileMetadata(UUID id) {
        SharedFile sharedFile = sharedFileRepository.findByIdAndStatus(id, SharedFile.FileStatus.ACTIVE)
            .orElseThrow(() -> new FileNotFoundException("File not found with id: " + id));

        if (sharedFile.getExpiresAt().isBefore(Instant.now())) {
            throw new FileExpiredException("File with id " + id + " has expired");
        }

        return mapToMetadataResponse(sharedFile, null);
    }

    @Transactional
    public FileMetadataResponse getFileByToken(String rawToken) {
        SharedFile sharedFile = resolveAndValidateToken(rawToken);

        sharedFile.setDownloadCount(sharedFile.getDownloadCount() + 1);
        sharedFileRepository.save(sharedFile);

        String shareUrl = buildShareUrl(rawToken);
        return mapToMetadataResponse(sharedFile, shareUrl);
    }

    @Transactional(readOnly = true)
    public FileMetadataResponse getFileMetadataByToken(String rawToken) {
        SharedFile sharedFile = resolveAndValidateToken(rawToken);
        String shareUrl = buildShareUrl(rawToken);
        return mapToMetadataResponse(sharedFile, shareUrl);
    }

    @Transactional(readOnly = true)
    public Resource loadFileResource(String rawToken) {
        SharedFile sharedFile = resolveAndValidateToken(rawToken);
        try {
            return fileStorageService.load(sharedFile.getStorageKey());
        } catch (IOException e) {
            throw new FileNotFoundException("Could not load file resource: " + e.getMessage());
        }
    }

    @Transactional
    public SharedFile getSharedFileForStreaming(String rawToken) {
        return resolveAndValidateToken(rawToken);
    }

    @Transactional
    public void incrementDownloadCount(UUID id) {
        sharedFileRepository.findById(id).ifPresent(file -> {
            file.setDownloadCount(file.getDownloadCount() + 1);
            sharedFileRepository.save(file);
        });
    }

    @Transactional
    public void deleteFile(UUID id) {
        SharedFile sharedFile = sharedFileRepository.findById(id)
            .orElseThrow(() -> new FileNotFoundException("File not found with id: " + id));

        fileStorageService.delete(sharedFile.getStorageKey());
        sharedFile.setStatus(SharedFile.FileStatus.DELETED);
        sharedFileRepository.save(sharedFile);
        log.info("File deleted: id={}", id);
    }

    private SharedFile resolveAndValidateToken(String rawToken) {
        String tokenHash = tokenUtil.hashToken(rawToken);
        SharedFile sharedFile = sharedFileRepository.findByTokenHash(tokenHash)
            .orElseThrow(() -> new FileNotFoundException("File not found for provided token"));

        if (sharedFile.getStatus() != SharedFile.FileStatus.ACTIVE) {
            throw new FileNotFoundException("File is no longer available");
        }

        if (sharedFile.getExpiresAt().isBefore(Instant.now())) {
            throw new FileExpiredException("File has expired and is no longer accessible");
        }

        return sharedFile;
    }

    private String buildShareUrl(String rawToken) {
        return appProperties.getBaseUrl() + "/api/files/share/" + rawToken;
    }

    private FileMetadataResponse mapToMetadataResponse(SharedFile sharedFile, String shareUrl) {
        return FileMetadataResponse.builder()
            .id(sharedFile.getId())
            .originalFileName(sharedFile.getOriginalFileName())
            .contentType(sharedFile.getContentType())
            .fileSize(sharedFile.getFileSize())
            .shareUrl(shareUrl)
            .createdAt(sharedFile.getCreatedAt())
            .expiresAt(sharedFile.getExpiresAt())
            .downloadCount(sharedFile.getDownloadCount())
            .build();
    }
}
