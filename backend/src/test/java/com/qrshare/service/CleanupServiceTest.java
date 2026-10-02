package com.qrshare.service;

import com.qrshare.model.SharedFile;
import com.qrshare.repository.SharedFileRepository;
import com.qrshare.storage.FileStorageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CleanupServiceTest {

    @Mock
    private SharedFileRepository sharedFileRepository;

    @Mock
    private FileStorageService fileStorageService;

    @InjectMocks
    private CleanupService cleanupService;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private SharedFile activeExpiredFile(String storageKey) {
        return SharedFile.builder()
                .id(UUID.randomUUID())
                .originalFileName("file.txt")
                .storageKey(storageKey)
                .tokenHash("somehash")
                .createdAt(Instant.now().minusSeconds(7200))
                .expiresAt(Instant.now().minusSeconds(3600))
                .downloadCount(0)
                .status(SharedFile.FileStatus.ACTIVE)
                .build();
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    @Test
    void testCleanup_deletesExpiredFiles() {
        SharedFile f1 = activeExpiredFile("key-1");
        SharedFile f2 = activeExpiredFile("key-2");
        SharedFile f3 = activeExpiredFile("key-3");
        List<SharedFile> expired = List.of(f1, f2, f3);

        when(sharedFileRepository.findByStatusAndExpiresAtBefore(
                eq(SharedFile.FileStatus.ACTIVE), any(Instant.class)))
                .thenReturn(expired);

        cleanupService.cleanupExpiredFiles();

        verify(fileStorageService).delete("key-1");
        verify(fileStorageService).delete("key-2");
        verify(fileStorageService).delete("key-3");

        assertThat(f1.getStatus()).isEqualTo(SharedFile.FileStatus.EXPIRED);
        assertThat(f2.getStatus()).isEqualTo(SharedFile.FileStatus.EXPIRED);
        assertThat(f3.getStatus()).isEqualTo(SharedFile.FileStatus.EXPIRED);

        verify(sharedFileRepository).saveAll(expired);
    }

    @Test
    void testCleanup_noExpiredFiles() {
        when(sharedFileRepository.findByStatusAndExpiresAtBefore(
                eq(SharedFile.FileStatus.ACTIVE), any(Instant.class)))
                .thenReturn(Collections.emptyList());

        cleanupService.cleanupExpiredFiles();

        verify(fileStorageService, never()).delete(anyString());
        verify(sharedFileRepository, never()).saveAll(any());
    }

    @Test
    void testCleanup_gracefulIfFileNotExists() {
        SharedFile f1 = activeExpiredFile("key-ok");
        SharedFile f2 = activeExpiredFile("key-missing");
        SharedFile f3 = activeExpiredFile("key-also-ok");
        List<SharedFile> expired = List.of(f1, f2, f3);

        when(sharedFileRepository.findByStatusAndExpiresAtBefore(
                eq(SharedFile.FileStatus.ACTIVE), any(Instant.class)))
                .thenReturn(expired);

        // Simulate IOException for f2's storage key
        doThrow(new RuntimeException("File missing on disk")).when(fileStorageService).delete("key-missing");

        // Should not propagate — cleanup must continue for remaining files
        cleanupService.cleanupExpiredFiles();

        // All three attempted
        verify(fileStorageService).delete("key-ok");
        verify(fileStorageService).delete("key-missing");
        verify(fileStorageService).delete("key-also-ok");

        // All three should still be marked EXPIRED (set before/after delete attempt)
        assertThat(f1.getStatus()).isEqualTo(SharedFile.FileStatus.EXPIRED);
        assertThat(f2.getStatus()).isEqualTo(SharedFile.FileStatus.EXPIRED);
        assertThat(f3.getStatus()).isEqualTo(SharedFile.FileStatus.EXPIRED);

        verify(sharedFileRepository).saveAll(expired);
    }
}
