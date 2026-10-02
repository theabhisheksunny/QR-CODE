package com.qrshare.storage;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MetadataStorageService {
    Optional<SharedFileMetadata> findByToken(String token);
    Optional<SharedFileMetadata> findById(UUID id);
    SharedFileMetadata save(SharedFileMetadata metadata);
    void delete(UUID id);
    List<SharedFileMetadata> findExpired(Instant now);
    List<SharedFileMetadata> findAll();
}
