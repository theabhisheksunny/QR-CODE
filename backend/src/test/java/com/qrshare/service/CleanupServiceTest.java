package com.qrshare.service;

import com.qrshare.storage.MetadataStorageService;
import com.qrshare.storage.SharedFileMetadata;
import com.qrshare.storage.FileStorageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CleanupServiceTest {

    @Mock
    private MetadataStorageService metadataStorageService;

    @Mock
    private FileStorageService fileStorageService;

    @InjectMocks
    private CleanupService cleanupService;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private SharedFileMetadata activeExpiredFile(String storageKey) {
        return SharedFileMetadata.builder()
                .id(UUID.randomUUID())
                .originalFileName("file.txt")
                .storageKey(storageKey)
                .token("sometoken")
                .createdAt(Instant.now().minusSeconds(7200))
                .expiresAt(Instant.now().minusSeconds(3600))
                .downloadCount(0)
                .status("ACTIVE")
                .build();
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    @Test
    void testCleanup_deletesExpiredFiles() {
        SharedFileMetadata f1 = activeExpiredFile("key-1");
        SharedFileMetadata f2 = activeExpiredFile("key-2");
        SharedFileMetadata f3 = activeExpiredFile("key-3");
        List<SharedFileMetadata> expired = List.of(f1, f2, f3);

        when(metadataStorageService.findExpired(any(Instant.class))).thenReturn(expired);

        cleanupService.cleanupExpiredFiles();

        verify(fileStorageService).delete("key-1");
        verify(fileStorageService).delete("key-2");
        verify(fileStorageService).delete("key-3");

        verify(metadataStorageService).delete(f1.getId());
        verify(metadataStorageService).delete(f2.getId());
        verify(metadataStorageService).delete(f3.getId());
    }

    @Test
    void testCleanup_noExpiredFiles() {
        when(metadataStorageService.findExpired(any(Instant.class))).thenReturn(Collections.emptyList());

        cleanupService.cleanupExpiredFiles();

        verify(fileStorageService, never()).delete(anyString());
        verify(metadataStorageService, never()).delete(any(UUID.class));
    }

    @Test
    void testCleanup_gracefulIfFileNotExists() {
        SharedFileMetadata f1 = activeExpiredFile("key-ok");
        SharedFileMetadata f2 = activeExpiredFile("key-missing");
        SharedFileMetadata f3 = activeExpiredFile("key-also-ok");
        List<SharedFileMetadata> expired = List.of(f1, f2, f3);

        when(metadataStorageService.findExpired(any(Instant.class))).thenReturn(expired);

        // Simulate RuntimeException for f2's storage key
        doThrow(new RuntimeException("File missing on disk")).when(fileStorageService).delete("key-missing");

        // Should not propagate — cleanup must continue for remaining files
        cleanupService.cleanupExpiredFiles();

        // All three attempted
        verify(fileStorageService).delete("key-ok");
        verify(fileStorageService).delete("key-missing");
        verify(fileStorageService).delete("key-also-ok");

        // All three metadata entries should be deleted regardless of physical file errors
        verify(metadataStorageService).delete(f1.getId());
        verify(metadataStorageService).delete(f2.getId());
        verify(metadataStorageService).delete(f3.getId());
    }
}
