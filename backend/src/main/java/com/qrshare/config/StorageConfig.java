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

    @PostConstruct
    public void initStorageDirectories() {
        createDir(Path.of(appProperties.getStorage().getPath()), "files storage");
        createDir(Path.of(appProperties.getMetadataStoragePath()), "metadata storage");
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
