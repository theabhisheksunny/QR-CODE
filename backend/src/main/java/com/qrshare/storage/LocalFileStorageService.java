package com.qrshare.storage;

import com.qrshare.config.AppProperties;
import com.qrshare.config.RuntimePaths;
import com.qrshare.config.StorageConfig;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;
import java.util.stream.Stream;

@Service
@Slf4j
@RequiredArgsConstructor
public class LocalFileStorageService implements FileStorageService {

    private final AppProperties appProperties;
    private final RuntimePaths runtimePaths;

    private Path filesDir() {
        return StorageConfig.resolveFilesDir(appProperties, runtimePaths);
    }

    private Path tempDir() {
        String explicit = appProperties.getStorage().getPath();
        // When an explicit storage path is configured (dev/test), keep the temp
        // staging area alongside it so atomic moves stay on the same filesystem.
        return (explicit != null && !explicit.isBlank())
            ? Path.of(explicit).resolve("temp")
            : runtimePaths.tempDir();
    }

    private Path resolveStoragePath(String storageKey) {
        return filesDir().resolve(storageKey);
    }

    /**
     * On startup, remove any stale {@code *.part} files left behind by a crash
     * mid-upload. This is the crash-recovery sweep.
     */
    @PostConstruct
    public void sweepStaleParts() {
        Path temp = tempDir();
        try {
            Files.createDirectories(temp);
        } catch (IOException e) {
            log.warn("Could not ensure temp directory {}: {}", temp, e.getMessage());
            return;
        }
        try (Stream<Path> parts = Files.list(temp)) {
            int[] removed = {0};
            parts.filter(p -> p.toString().endsWith(".part")).forEach(p -> {
                try {
                    if (Files.deleteIfExists(p)) {
                        removed[0]++;
                    }
                } catch (IOException e) {
                    log.warn("Could not delete stale part file {}: {}", p, e.getMessage());
                }
            });
            if (removed[0] > 0) {
                log.info("Startup sweep removed {} stale .part file(s) from {}", removed[0], temp);
            }
        } catch (IOException e) {
            log.warn("Could not sweep temp directory {}: {}", temp, e.getMessage());
        }
    }

    @Override
    public String store(InputStream inputStream, String storageKey, String contentType) throws IOException {
        Path temp = tempDir();
        Files.createDirectories(temp);
        Files.createDirectories(filesDir());

        Path partFile = temp.resolve(UUID.randomUUID() + ".part");
        Path targetPath = resolveStoragePath(storageKey);
        try {
            Files.copy(inputStream, partFile, StandardCopyOption.REPLACE_EXISTING);
            try {
                Files.move(partFile, targetPath, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(partFile, targetPath, StandardCopyOption.REPLACE_EXISTING);
            }
            log.debug("Stored file with key: {}", storageKey);
            return storageKey;
        } catch (IOException e) {
            try {
                Files.deleteIfExists(partFile);
            } catch (IOException cleanup) {
                log.warn("Could not delete temp part after failed store {}: {}", partFile, cleanup.getMessage());
            }
            throw e;
        }
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
