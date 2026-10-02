package com.qrshare.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qrshare.config.AppProperties;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@Slf4j
@RequiredArgsConstructor
public class LocalMetadataStorageService implements MetadataStorageService {

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    // In-memory cache: id (string) -> metadata
    private final ConcurrentHashMap<String, SharedFileMetadata> cache = new ConcurrentHashMap<>();
    // Fast token lookup: raw token -> id (string)
    private final ConcurrentHashMap<String, String> tokenToId = new ConcurrentHashMap<>();

    @PostConstruct
    public void loadAll() {
        Path metaDir = Path.of(appProperties.getMetadataStoragePath());
        try {
            Files.createDirectories(metaDir);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create metadata directory: " + metaDir, e);
        }
        try (Stream<Path> files = Files.list(metaDir)) {
            files.filter(p -> p.toString().endsWith(".json")).forEach(p -> {
                try {
                    SharedFileMetadata m = objectMapper.readValue(p.toFile(), SharedFileMetadata.class);
                    cache.put(m.getId().toString(), m);
                    if (m.getToken() != null) tokenToId.put(m.getToken(), m.getId().toString());
                } catch (IOException e) {
                    log.warn("Could not load metadata file {}: {}", p, e.getMessage());
                }
            });
        } catch (IOException e) {
            log.warn("Could not list metadata directory {}: {}", metaDir, e.getMessage());
        }
        log.info("Loaded {} metadata file(s) from {}", cache.size(), metaDir);
    }

    @Override
    public Optional<SharedFileMetadata> findByToken(String token) {
        String id = tokenToId.get(token);
        if (id == null) return Optional.empty();
        return Optional.ofNullable(cache.get(id));
    }

    @Override
    public Optional<SharedFileMetadata> findById(UUID id) {
        return Optional.ofNullable(cache.get(id.toString()));
    }

    @Override
    public synchronized SharedFileMetadata save(SharedFileMetadata metadata) {
        if (metadata.getId() == null) {
            metadata.setId(UUID.randomUUID());
        }
        if (metadata.getCreatedAt() == null) {
            metadata.setCreatedAt(Instant.now());
        }
        if (metadata.getStatus() == null) {
            metadata.setStatus("ACTIVE");
        }
        Path file = metadataPath(metadata.getId());
        try {
            objectMapper.writeValue(file.toFile(), metadata);
        } catch (IOException e) {
            throw new RuntimeException("Failed to persist metadata for id=" + metadata.getId(), e);
        }
        cache.put(metadata.getId().toString(), metadata);
        if (metadata.getToken() != null) tokenToId.put(metadata.getToken(), metadata.getId().toString());
        return metadata;
    }

    @Override
    public synchronized void delete(UUID id) {
        SharedFileMetadata m = cache.remove(id.toString());
        if (m != null && m.getToken() != null) {
            tokenToId.remove(m.getToken());
        }
        Path file = metadataPath(id);
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            log.warn("Could not delete metadata file for id={}: {}", id, e.getMessage());
        }
    }

    @Override
    public List<SharedFileMetadata> findExpired(Instant now) {
        return cache.values().stream()
            .filter(m -> "ACTIVE".equals(m.getStatus()) && m.getExpiresAt() != null && m.getExpiresAt().isBefore(now))
            .collect(Collectors.toList());
    }

    @Override
    public List<SharedFileMetadata> findAll() {
        return new ArrayList<>(cache.values());
    }

    private Path metadataPath(UUID id) {
        return Path.of(appProperties.getMetadataStoragePath()).resolve(id.toString() + ".json");
    }
}
