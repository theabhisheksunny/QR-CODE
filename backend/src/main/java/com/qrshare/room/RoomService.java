package com.qrshare.room;

import com.qrshare.exception.FileExpiredException;
import com.qrshare.exception.FileNotFoundException;
import com.qrshare.service.QrCodeService;
import com.qrshare.storage.FileStorageService;
import com.qrshare.util.TokenUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Business logic for Local Sharing Rooms. Device A hosts the room; browsers join
 * over the LAN and relay files through this host.
 *
 * <p>Reuse (no duplication, no regression of large-file support):</p>
 * <ul>
 *   <li>{@link TokenUtil} — secure random room/session/file tokens.</li>
 *   <li>{@link FileStorageService#store(java.io.InputStream, String, String)} —
 *       the validated streaming store (temp {@code .part} → atomic move, bounded
 *       memory, arbitrary size/extension). Room uploads go through it unchanged;
 *       the actual byte streaming is driven by the controller passing
 *       {@code MultipartFile.getInputStream()}.</li>
 *   <li>{@link QrCodeService} — room QR encodes only the join URL.</li>
 *   <li>{@link RoomUrlService} — LAN-accessible URL (never localhost).</li>
 * </ul>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class RoomService {

    /** A participant is OFFLINE if no heartbeat within this window. */
    public static final Duration PRESENCE_TIMEOUT = Duration.ofSeconds(30);

    private final RoomStore roomStore;
    private final FileStorageService fileStorageService;
    private final QrCodeService qrCodeService;
    private final RoomUrlService roomUrlService;
    private final TokenUtil tokenUtil;

    // ---- lifecycle --------------------------------------------------------

    public Room createRoom(String name, int expirationMinutes) {
        if (expirationMinutes <= 0) {
            throw new IllegalArgumentException("expirationMinutes must be positive");
        }
        String safeName = (name == null || name.isBlank()) ? "Local Sharing Room" : name.trim();
        Instant now = Instant.now();
        Room room = Room.builder()
            .id(UUID.randomUUID().toString())
            .roomToken(tokenUtil.generateToken())
            .name(safeName)
            .createdAt(now)
            .expiresAt(now.plus(expirationMinutes, ChronoUnit.MINUTES))
            .status("ACTIVE")
            .build();
        roomStore.save(room);
        log.info("Room created: id={} name='{}' expires={}", room.getId(), safeName, room.getExpiresAt());
        return room;
    }

    /** Resolves + validates a room is joinable/usable (ACTIVE and not expired). */
    public Room requireActiveRoom(String roomToken) {
        Room room = roomStore.findByToken(roomToken)
            .orElseThrow(() -> new FileNotFoundException("Room not found"));
        if ("CLOSED".equals(room.getStatus())) {
            throw new FileNotFoundException("Room has been closed");
        }
        if (room.getExpiresAt() != null && room.getExpiresAt().isBefore(Instant.now())) {
            room.setStatus("EXPIRED");
            roomStore.save(room);
            throw new FileExpiredException("Room has expired");
        }
        return room;
    }

    public Room getRoom(String roomToken) {
        return requireActiveRoom(roomToken);
    }

    public Participant join(String roomToken, String displayName) {
        Room room = requireActiveRoom(roomToken);
        synchronized (room) {
            String name = (displayName == null || displayName.isBlank())
                ? "Guest-" + (room.getParticipants().size() + 1)
                : displayName.trim();
            Instant now = Instant.now();
            Participant p = Participant.builder()
                .id(UUID.randomUUID().toString())
                .sessionToken(tokenUtil.generateToken())
                .displayName(name)
                .joinedAt(now)
                .lastSeenAt(now)
                .status("ONLINE")
                .build();
            room.getParticipants().add(p);
            roomStore.save(room);
            log.info("Participant joined room {}: {} ({})", room.getId(), name, p.getId());
            return p;
        }
    }

    /** Validates the session token belongs to the room and refreshes presence. */
    public Participant authorizeAndTouch(String roomToken, String sessionToken) {
        Room room = requireActiveRoom(roomToken);
        synchronized (room) {
            Participant p = room.getParticipants().stream()
                .filter(x -> x.getSessionToken() != null && x.getSessionToken().equals(sessionToken))
                .findFirst()
                .orElseThrow(() -> new FileNotFoundException("Not a member of this room"));
            p.setLastSeenAt(Instant.now());
            p.setStatus("ONLINE");
            roomStore.save(room);
            return p;
        }
    }

    /** Lightweight presence refresh. */
    public void heartbeat(String roomToken, String sessionToken) {
        authorizeAndTouch(roomToken, sessionToken);
    }

    /** Returns participants with ONLINE/OFFLINE derived from the presence window. */
    public List<Participant> listParticipants(String roomToken) {
        Room room = requireActiveRoom(roomToken);
        Instant cutoff = Instant.now().minus(PRESENCE_TIMEOUT);
        synchronized (room) {
            for (Participant p : room.getParticipants()) {
                boolean online = p.getLastSeenAt() != null && p.getLastSeenAt().isAfter(cutoff);
                p.setStatus(online ? "ONLINE" : "OFFLINE");
            }
            // Return a snapshot copy so callers iterate safely off-lock.
            return new java.util.ArrayList<>(room.getParticipants());
        }
    }

    // ---- files ------------------------------------------------------------

    /**
     * Streams an uploaded file into room storage and publishes it to the room.
     * The physical bytes stream through {@link FileStorageService#store} (temp
     * {@code .part} → atomic move); room metadata is only recorded after a
     * successful store, so an aborted/failed upload leaves nothing behind.
     */
    public RoomFile addFile(String roomToken, String sessionToken, MultipartFile file) {
        Room room = requireActiveRoom(roomToken);
        Participant owner = authorizeAndTouch(roomToken, sessionToken);

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File must not be empty");
        }

        String storageKey = UUID.randomUUID().toString();
        try {
            fileStorageService.store(file.getInputStream(), storageKey, file.getContentType());
        } catch (IOException e) {
            // store() already cleans its temp .part on failure.
            throw new RuntimeException("Failed to store uploaded file: " + e.getMessage(), e);
        }

        RoomFile rf = RoomFile.builder()
            .id(UUID.randomUUID().toString())
            .fileToken(tokenUtil.generateToken())
            .originalFileName(file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown")
            .contentType(file.getContentType())
            .fileSize(file.getSize())
            .storageKey(storageKey)
            .ownerParticipantId(owner.getId())
            .ownerDisplayName(owner.getDisplayName())
            .createdAt(Instant.now())
            .status("ACTIVE")
            .build();

        synchronized (room) {
            room.getFiles().add(rf);
            roomStore.save(room);
        }
        log.info("Room {} file added: {} ({} bytes) by {}", room.getId(),
            rf.getOriginalFileName(), rf.getFileSize(), owner.getDisplayName());
        return rf;
    }

    public List<RoomFile> listFiles(String roomToken, String sessionToken) {
        authorizeAndTouch(roomToken, sessionToken);
        Room room = requireActiveRoom(roomToken);
        synchronized (room) {
            return room.getFiles().stream().filter(f -> "ACTIVE".equals(f.getStatus())).toList();
        }
    }

    /** Resolves an ACTIVE file within the room, enforcing room isolation. */
    public RoomFile requireFile(String roomToken, String fileToken) {
        Room room = requireActiveRoom(roomToken);
        synchronized (room) {
            return room.getFiles().stream()
                .filter(f -> "ACTIVE".equals(f.getStatus())
                    && f.getFileToken() != null && f.getFileToken().equals(fileToken))
                .findFirst()
                .orElseThrow(() -> new FileNotFoundException("File not found in this room"));
        }
    }

    public void deleteFile(String roomToken, String sessionToken, String fileToken) {
        Room room = requireActiveRoom(roomToken);
        Participant p = authorizeAndTouch(roomToken, sessionToken);
        synchronized (room) {
            RoomFile rf = room.getFiles().stream()
                .filter(f -> f.getFileToken() != null && f.getFileToken().equals(fileToken) && "ACTIVE".equals(f.getStatus()))
                .findFirst()
                .orElseThrow(() -> new FileNotFoundException("File not found in this room"));
            // Phase 1: any member may remove a file (share-with-everyone model).
            fileStorageService.delete(rf.getStorageKey());
            rf.setStatus("DELETED");
            roomStore.save(room);
            log.info("Room {} file deleted: {} by {}", room.getId(), rf.getOriginalFileName(), p.getDisplayName());
        }
    }

    /** Closes the room and removes its files + metadata. */
    public synchronized void closeRoom(String roomToken) {
        Room room = roomStore.findByToken(roomToken)
            .orElseThrow(() -> new FileNotFoundException("Room not found"));
        purge(room);
        log.info("Room closed: id={}", room.getId());
    }

    /** Deletes all blobs for a room and removes its persistence record. */
    public void purge(Room room) {
        for (RoomFile f : room.getFiles()) {
            if (f.getStorageKey() != null) {
                fileStorageService.delete(f.getStorageKey());
            }
        }
        roomStore.delete(room.getId());
    }

    public String roomQrCode(String roomToken) {
        return qrCodeService.generateQrCode(roomUrlService.buildRoomUrl(roomToken));
    }

    public String roomUrl(String roomToken) {
        return roomUrlService.buildRoomUrl(roomToken);
    }

    public Optional<Room> rawRoom(String roomToken) {
        return roomStore.findByToken(roomToken);
    }
}
