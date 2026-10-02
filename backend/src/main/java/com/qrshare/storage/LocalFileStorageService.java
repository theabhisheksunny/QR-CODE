package com.qrshare.storage;

import com.qrshare.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@Service
@Slf4j
@RequiredArgsConstructor
public class LocalFileStorageService implements FileStorageService {

    private final AppProperties appProperties;

    private Path resolveStoragePath(String storageKey) {
        return Path.of(appProperties.getStorage().getPath()).resolve(storageKey);
    }

    @Override
    public String store(InputStream inputStream, String storageKey, String contentType) throws IOException {
        Path targetPath = resolveStoragePath(storageKey);
        Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
        log.debug("Stored file with key: {}", storageKey);
        return storageKey;
    }

    @Override
    public Resource load(String storageKey) throws IOException {
        Path filePath = resolveStoragePath(storageKey);
        if (!Files.exists(filePath)) {
            throw new IOException("File not found in storage: " + storageKey);
        }
        return new FileSystemResource(filePath);
    }

    @Override
    public void delete(String storageKey) {
        try {
            Path filePath = resolveStoragePath(storageKey);
            boolean deleted = Files.deleteIfExists(filePath);
            if (deleted) {
                log.debug("Deleted stored file with key: {}", storageKey);
            } else {
                log.warn("File not found during delete, skipping: {}", storageKey);
            }
        } catch (IOException e) {
            log.error("Failed to delete file with key {}: {}", storageKey, e.getMessage());
        }
    }

    @Override
    public boolean exists(String storageKey) {
        return Files.exists(resolveStoragePath(storageKey));
    }
}
