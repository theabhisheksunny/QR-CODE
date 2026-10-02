package com.qrshare.service;

import com.qrshare.model.SharedFile;
import com.qrshare.repository.SharedFileRepository;
import com.qrshare.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@Slf4j
@RequiredArgsConstructor
public class CleanupService {

    private final SharedFileRepository sharedFileRepository;
    private final FileStorageService fileStorageService;

    @Scheduled(fixedRateString = "${app.cleanup-interval-ms:60000}")
    @Transactional
    public void cleanupExpiredFiles() {
        Instant now = Instant.now();
        List<SharedFile> expiredFiles = sharedFileRepository
            .findByStatusAndExpiresAtBefore(SharedFile.FileStatus.ACTIVE, now);

        if (expiredFiles.isEmpty()) {
            log.debug("Cleanup: no expired files found");
            return;
        }

        log.info("Cleanup: found {} expired file(s) to clean up", expiredFiles.size());

        for (SharedFile file : expiredFiles) {
            try {
                fileStorageService.delete(file.getStorageKey());
                log.debug("Cleanup: deleted physical file for id={}", file.getId());
            } catch (Exception e) {
                // Gracefully handle missing physical files
                log.warn("Cleanup: could not delete physical file for id={}: {}", file.getId(), e.getMessage());
            }
            file.setStatus(SharedFile.FileStatus.EXPIRED);
        }

        sharedFileRepository.saveAll(expiredFiles);
        log.info("Cleanup: marked {} file(s) as EXPIRED", expiredFiles.size());
    }
}
