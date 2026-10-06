package com.qrshare.room;

import com.qrshare.exception.FileExpiredException;
import com.qrshare.exception.FileNotFoundException;
import com.qrshare.service.QrCodeService;
import com.qrshare.storage.FileStorageService;
import com.qrshare.util.TokenUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * RoomService lifecycle/isolation/expiry tests. Uses a lightweight in-memory
 * fake RoomStore so no disk is touched.
 */
class RoomServiceTest {

    private RoomStore roomStore;
    private FileStorageService fileStorageService;
    private RoomService roomService;

    @BeforeEach
    void setUp() {
        // In-memory fake store backed by a map.
        roomStore = mock(RoomStore.class);
        var backing = new java.util.concurrent.ConcurrentHashMap<String, Room>();
        var byToken = new java.util.concurrent.ConcurrentHashMap<String, String>();
        when(roomStore.save(any(Room.class))).thenAnswer(inv -> {
            Room r = inv.getArgument(0);
            backing.put(r.getId(), r);
            if (r.getRoomToken() != null) byToken.put(r.getRoomToken(), r.getId());
            return r;
        });
        when(roomStore.findByToken(anyString())).thenAnswer(inv -> {
            String id = byToken.get(inv.getArgument(0, String.class));
            return java.util.Optional.ofNullable(id == null ? null : backing.get(id));
        });
        when(roomStore.findById(anyString())).thenAnswer(inv ->
            java.util.Optional.ofNullable(backing.get(inv.getArgument(0, String.class))));
        doAnswer(inv -> { Room r = backing.remove(inv.getArgument(0, String.class)); if (r != null && r.getRoomToken()!=null) byToken.remove(r.getRoomToken()); return null; })
            .when(roomStore).delete(anyString());

        fileStorageService = mock(FileStorageService.class);
        QrCodeService qr = mock(QrCodeService.class);
        when(qr.generateQrCode(anyString())).thenReturn("data:image/png;base64,QR");
        RoomUrlService urls = mock(RoomUrlService.class);
        when(urls.buildRoomUrl(anyString())).thenAnswer(inv -> "http://192.168.1.9:8787/room/" + inv.getArgument(0));

        // Real TokenUtil for genuinely random, distinct tokens.
        TokenUtil tokenUtil = new TokenUtil();

        roomService = new RoomService(roomStore, fileStorageService, qr, urls, tokenUtil);
    }

    @Test
    void createRoom_setsSecureTokenAndExpiry() {
        Room r = roomService.createRoom("Family Trip", 120);
        assertThat(r.getRoomToken()).isNotBlank().hasSizeGreaterThan(20);
        assertThat(r.getName()).isEqualTo("Family Trip");
        assertThat(r.getStatus()).isEqualTo("ACTIVE");
        assertThat(r.getExpiresAt()).isAfter(Instant.now());
    }

    @Test
    void join_assignsDistinctSessionTokens() {
        Room r = roomService.createRoom("Trip", 60);
        Participant a = roomService.join(r.getRoomToken(), "Rahul");
        Participant b = roomService.join(r.getRoomToken(), "Priya");
        assertThat(a.getSessionToken()).isNotEqualTo(b.getSessionToken());
        assertThat(roomService.listParticipants(r.getRoomToken())).hasSize(2);
    }

    @Test
    void addFile_requiresValidSessionAndPublishesToRoom() throws Exception {
        when(fileStorageService.store(any(), anyString(), any())).thenReturn("key");
        Room r = roomService.createRoom("Trip", 60);
        Participant a = roomService.join(r.getRoomToken(), "Rahul");

        var file = mock(org.springframework.web.multipart.MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[]{1,2,3}));
        when(file.getOriginalFilename()).thenReturn("clip.mp4");
        when(file.getContentType()).thenReturn("video/mp4");
        when(file.getSize()).thenReturn(3L);

        RoomFile rf = roomService.addFile(r.getRoomToken(), a.getSessionToken(), file);
        assertThat(rf.getFileToken()).isNotBlank();
        assertThat(rf.getOwnerDisplayName()).isEqualTo("Rahul");

        // Visible to another member.
        Participant b = roomService.join(r.getRoomToken(), "Priya");
        assertThat(roomService.listFiles(r.getRoomToken(), b.getSessionToken())).hasSize(1);
    }

    @Test
    void addFile_rejectsUnknownSessionToken() {
        Room r = roomService.createRoom("Trip", 60);
        var file = mock(org.springframework.web.multipart.MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        assertThatThrownBy(() -> roomService.addFile(r.getRoomToken(), "not-a-member", file))
            .isInstanceOf(FileNotFoundException.class);
    }

    @Test
    void roomIsolation_fileTokenFromAnotherRoomRejected() throws Exception {
        when(fileStorageService.store(any(), anyString(), any())).thenReturn("key");
        Room r1 = roomService.createRoom("Room1", 60);
        Participant p1 = roomService.join(r1.getRoomToken(), "A");
        var file = mock(org.springframework.web.multipart.MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[]{1}));
        when(file.getOriginalFilename()).thenReturn("a.bin");
        when(file.getContentType()).thenReturn(null);
        when(file.getSize()).thenReturn(1L);
        RoomFile rf = roomService.addFile(r1.getRoomToken(), p1.getSessionToken(), file);

        Room r2 = roomService.createRoom("Room2", 60);
        // r1's file token must NOT resolve within r2.
        assertThatThrownBy(() -> roomService.requireFile(r2.getRoomToken(), rf.getFileToken()))
            .isInstanceOf(FileNotFoundException.class);
        // but resolves within its own room
        assertThat(roomService.requireFile(r1.getRoomToken(), rf.getFileToken())).isNotNull();
    }

    @Test
    void expiredRoom_rejectsAccess() {
        Room r = roomService.createRoom("Trip", 60);
        // Force expiry in the past and persist.
        r.setExpiresAt(Instant.now().minus(1, ChronoUnit.MINUTES));
        roomStore.save(r);
        assertThatThrownBy(() -> roomService.getRoom(r.getRoomToken()))
            .isInstanceOf(FileExpiredException.class);
    }

    @Test
    void closeRoom_purgesAndRejectsFurtherAccess() throws Exception {
        when(fileStorageService.store(any(), anyString(), any())).thenReturn("key");
        Room r = roomService.createRoom("Trip", 60);
        Participant a = roomService.join(r.getRoomToken(), "Rahul");
        var file = mock(org.springframework.web.multipart.MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[]{1}));
        when(file.getOriginalFilename()).thenReturn("x.bin");
        when(file.getContentType()).thenReturn(null);
        when(file.getSize()).thenReturn(1L);
        RoomFile rf = roomService.addFile(r.getRoomToken(), a.getSessionToken(), file);

        roomService.closeRoom(r.getRoomToken());

        // blob deleted
        verify(fileStorageService, atLeastOnce()).delete(rf.getStorageKey());
        // room gone
        assertThatThrownBy(() -> roomService.getRoom(r.getRoomToken()))
            .isInstanceOf(FileNotFoundException.class);
    }
}
