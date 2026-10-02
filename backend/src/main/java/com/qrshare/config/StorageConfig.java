package com.qrshare.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class StorageConfig {

    private final AppProperties appProperties;

    @PostConstruct
    public void initStorageDirectory() {
        try {
            Path storagePath = Path.of(appProperties.getStorage().getPath());
            Files.createDirectories(storagePath);
            log.info("Storage directory initialized at: {}", storagePath.toAbsolutePath());
        } catch (IOException e) {
            throw new RuntimeException("Failed to create storage directory: " + e.getMessage(), e);
        }
    }
}
