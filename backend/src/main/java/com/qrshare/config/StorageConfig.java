package com.qrshare.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class StorageConfig {

    private final AppProperties appProperties;
    private final RuntimePaths runtimePaths;

    @PostConstruct
    public void initStorageDirectories() {
        createDir(resolveFilesDir(appProperties, runtimePaths), "files storage");
        createDir(resolveMetadataDir(appProperties, runtimePaths), "metadata storage");
    }

    /**
     * Effective files directory: explicit {@code app.storage.path} if non-blank
     * (dev/test back-compat) else the dynamic {@link RuntimePaths#filesDir()}.
     */
    public static Path resolveFilesDir(AppProperties appProperties, RuntimePaths runtimePaths) {
        String explicit = appProperties.getStorage().getPath();
        return (explicit != null && !explicit.isBlank())
            ? Path.of(explicit)
            : runtimePaths.filesDir();
    }

    /**
     * Effective metadata directory: explicit {@code app.metadata-storage-path}
     * if non-blank (dev/test back-compat) else {@link RuntimePaths#metadataDir()}.
     */
    public static Path resolveMetadataDir(AppProperties appProperties, RuntimePaths runtimePaths) {
        String explicit = appProperties.getMetadataStoragePath();
        return (explicit != null && !explicit.isBlank())
            ? Path.of(explicit)
            : runtimePaths.metadataDir();
    }

    private void createDir(Path path, String label) {
        try {
            Files.createDirectories(path);
            log.info("{} directory initialized at: {}", label, path.toAbsolutePath());
        } catch (IOException e) {
            throw new RuntimeException("Failed to create " + label + " directory: " + e.getMessage(), e);
        }
    }

    @Bean
    @Primary
    public ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return mapper;
    }
}
