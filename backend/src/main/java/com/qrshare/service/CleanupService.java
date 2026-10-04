package com.qrshare.service;

import com.qrshare.storage.MetadataStorageService;
import com.qrshare.storage.SharedFileMetadata;
import com.qrshare.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

@Service
@Slf4j
@RequiredArgsConstructor
public class CleanupService {

    private final MetadataStorageService metadataStorageService;
    private final FileStorageService fileStorageService;

    /** Epoch seconds of the last cleanup run; 0 until the first run completes. */
    private final AtomicLong lastRunEpoch = new AtomicLong(0L);

    /** Exposes the epoch-seconds timestamp of the last cleanup run (0 if never). */
    public long getLastRunEpoch() {
        return lastRunEpoch.get();
    }

    @Scheduled(fixedRateString = "${app.cleanup-interval-ms:60000}")
    public void cleanupExpiredFiles() {
        Instant now = Instant.now();
        lastRunEpoch.set(now.getEpochSecond());
        List<SharedFileMetadata> expired = metadataStorageService.findExpired(now);

        if (expired.isEmpty()) {
            log.debug("Cleanup: no expired files found");
            return;
        }

        log.info("Cleanup: found {} expired file(s) to clean up", expired.size());

        for (SharedFileMetadata m : expired) {
            try {
                fileStorageService.delete(m.getStorageKey());
                log.debug("Cleanup: deleted physical file for id={}", m.getId());
            } catch (Exception e) {
                log.warn("Cleanup: could not delete physical file for id={}: {}", m.getId(), e.getMessage());
            }
            metadataStorageService.delete(m.getId());
        }

        log.info("Cleanup: removed {} expired file(s)", expired.size());
    }
}
