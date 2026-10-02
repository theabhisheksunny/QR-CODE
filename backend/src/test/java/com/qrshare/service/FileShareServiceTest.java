package com.qrshare.service;

import com.qrshare.config.AppProperties;
import com.qrshare.dto.FileUploadResponse;
import com.qrshare.exception.FileExpiredException;
import com.qrshare.exception.FileNotFoundException;
import com.qrshare.exception.FileTooLargeException;
import com.qrshare.model.SharedFile;
import com.qrshare.repository.SharedFileRepository;
import com.qrshare.storage.FileStorageService;
import com.qrshare.util.TokenUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class FileShareServiceTest {

    @Mock
    private SharedFileRepository sharedFileRepository;

    @Mock
    private FileStorageService fileStorageService;

    @Mock
    private QrCodeService qrCodeService;

    @Mock
    private TokenUtil tokenUtil;

    @Mock
    private AppProperties appProperties;

    @InjectMocks
    private FileShareService fileShareService;

    private static final UUID FILE_ID = UUID.randomUUID();
    private static final String RAW_TOKEN = "abc123rawtoken456abc123rawtoken4"; // 32 chars
    private static final String TOKEN_HASH = "deadbeef01020304deadbeef01020304deadbeef01020304deadbeef01020304";

    // -------------------------------------------------------------------------
    // uploadFile — success
    // -------------------------------------------------------------------------

    @Test
    void testUploadFile_success() throws IOException {
        when(appProperties.getMaxFileSizeMb()).thenReturn(25);
        when(appProperties.getBaseUrl()).thenReturn("http://localhost:8080");
        when(tokenUtil.generateToken()).thenReturn(RAW_TOKEN);
        when(tokenUtil.hashToken(RAW_TOKEN)).thenReturn(TOKEN_HASH);
        when(qrCodeService.generateQrCode(anyString())).thenReturn("data:image/png;base64,QRDATA");

        MultipartFile mockFile = mock(MultipartFile.class);
        byte[] content = "hello file content".getBytes();
        when(mockFile.isEmpty()).thenReturn(false);
        when(mockFile.getSize()).thenReturn((long) content.length);
        when(mockFile.getOriginalFilename()).thenReturn("test.txt");
        when(mockFile.getContentType()).thenReturn("text/plain");
        when(mockFile.getInputStream()).thenReturn(new ByteArrayInputStream(content));

        SharedFile savedFile = SharedFile.builder()
                .id(FILE_ID)
                .originalFileName("test.txt")
                .contentType("text/plain")
                .fileSize((long) content.length)
                .tokenHash(TOKEN_HASH)
                .storageKey("some-uuid")
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(1800))
                .downloadCount(0)
                .status(SharedFile.FileStatus.ACTIVE)
                .build();

        when(sharedFileRepository.save(any(SharedFile.class))).thenReturn(savedFile);
        when(fileStorageService.store(any(), anyString(), anyString())).thenReturn("some-uuid");

        FileUploadResponse response = fileShareService.uploadFile(mockFile, 30);

        verify(fileStorageService).store(any(), anyString(), anyString());
        verify(sharedFileRepository).save(any(SharedFile.class));
        assertThat(response.getShareUrl()).isNotBlank();
        assertThat(response.getQrCode()).startsWith("data:image/png;base64,");
        assertThat(response.getId()).isEqualTo(FILE_ID);
    }

    // -------------------------------------------------------------------------
    // uploadFile — file too large
    // -------------------------------------------------------------------------

    @Test
    void testUploadFile_fileTooLarge() throws Exception {
        when(appProperties.getMaxFileSizeMb()).thenReturn(25);

        MultipartFile mockFile = mock(MultipartFile.class);
        when(mockFile.isEmpty()).thenReturn(false);
        // 26 MB > 25 MB limit
        long tooBig = 26L * 1024 * 1024;
        when(mockFile.getSize()).thenReturn(tooBig);

        assertThatThrownBy(() -> fileShareService.uploadFile(mockFile, 30))
                .isInstanceOf(FileTooLargeException.class);

        verify(sharedFileRepository, never()).save(any());
        verify(fileStorageService, never()).store(any(), any(), any());
    }

    // -------------------------------------------------------------------------
    // getFileMetadata — not found
    // -------------------------------------------------------------------------

    @Test
    void testGetFileMetadata_notFound() {
        UUID randomId = UUID.randomUUID();
        when(sharedFileRepository.findByIdAndStatus(randomId, SharedFile.FileStatus.ACTIVE))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> fileShareService.getFileMetadata(randomId))
                .isInstanceOf(FileNotFoundException.class);
    }

    // -------------------------------------------------------------------------
    // getFileByToken — expired
    // -------------------------------------------------------------------------

    @Test
    void testGetFileByToken_expired() {
        SharedFile expiredFile = SharedFile.builder()
                .id(FILE_ID)
                .originalFileName("old.txt")
                .storageKey("key-123")
                .tokenHash(TOKEN_HASH)
                .createdAt(Instant.now().minusSeconds(7200))
                .expiresAt(Instant.now().minusSeconds(3600)) // already expired
                .downloadCount(0)
                .status(SharedFile.FileStatus.ACTIVE)
                .build();

        when(tokenUtil.hashToken(RAW_TOKEN)).thenReturn(TOKEN_HASH);
        when(sharedFileRepository.findByTokenHash(TOKEN_HASH)).thenReturn(Optional.of(expiredFile));

        assertThatThrownBy(() -> fileShareService.getFileByToken(RAW_TOKEN))
                .isInstanceOf(FileExpiredException.class);
    }

    // -------------------------------------------------------------------------
    // deleteFile — success
    // -------------------------------------------------------------------------

    @Test
    void testDeleteFile_success() {
        SharedFile activeFile = SharedFile.builder()
                .id(FILE_ID)
                .originalFileName("delete-me.txt")
                .storageKey("key-to-delete")
                .tokenHash(TOKEN_HASH)
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(1800))
                .downloadCount(0)
                .status(SharedFile.FileStatus.ACTIVE)
                .build();

        when(sharedFileRepository.findById(FILE_ID)).thenReturn(Optional.of(activeFile));

        fileShareService.deleteFile(FILE_ID);

        verify(fileStorageService).delete("key-to-delete");

        ArgumentCaptor<SharedFile> captor = ArgumentCaptor.forClass(SharedFile.class);
        verify(sharedFileRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(SharedFile.FileStatus.DELETED);
    }
}
