package com.qrshare.repository;

import com.qrshare.model.SharedFile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SharedFileRepository extends JpaRepository<SharedFile, UUID> {

    Optional<SharedFile> findByTokenHash(String tokenHash);

    List<SharedFile> findByStatusAndExpiresAtBefore(SharedFile.FileStatus status, Instant now);

    Optional<SharedFile> findByIdAndStatus(UUID id, SharedFile.FileStatus status);
}
