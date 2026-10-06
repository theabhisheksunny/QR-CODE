package com.qrshare.controller;

import com.qrshare.config.AppProperties;
import com.qrshare.config.RuntimePaths;
import com.qrshare.config.StorageConfig;
import com.qrshare.room.Participant;
import com.qrshare.room.Room;
import com.qrshare.room.RoomDtos.*;
import com.qrshare.room.RoomFile;
import com.qrshare.room.RoomService;
import com.qrshare.util.FileStreamer;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * REST API for Local Sharing Rooms. Device A hosts; LAN browsers join and relay
 * files through the host. Reuses the streaming store (uploads) and the shared
 * {@link FileStreamer} (downloads with Range) — no large-file regression.
 *
 * <p>The participant {@code sessionToken} is supplied via the
 * {@code X-Room-Session} header for member-only operations.</p>
 */
@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Local Sharing Rooms", description = "Multi-device LAN rooms relayed through the host")
public class RoomController {

    private static final String SESSION_HEADER = "X-Room-Session";

    private final RoomService roomService;
    private final AppProperties appProperties;
    private final RuntimePaths runtimePaths;
    private final FileStreamer fileStreamer;

    // ---- lifecycle --------------------------------------------------------

    @PostMapping
    @Operation(summary = "Create a Local Sharing Room (host/Device A)")
    public ResponseEntity<CreateRoomResponse> createRoom(@RequestBody Map<String, Object> body) {
        String name = body.get("name") != null ? body.get("name").toString() : null;
        int minutes = body.get("expirationMinutes") != null
            ? Integer.parseInt(body.get("expirationMinutes").toString())
            : 120;
        Room room = roomService.createRoom(name, minutes);
        CreateRoomResponse resp = new CreateRoomResponse(
            room.getRoomToken(), room.getName(), room.getCreatedAt(), room.getExpiresAt(),
            room.getStatus(), roomService.roomUrl(room.getRoomToken()), roomService.roomQrCode(room.getRoomToken()));
        return ResponseEntity.status(HttpStatus.CREATED).body(resp);
    }

    @GetMapping("/{roomToken}")
    @Operation(summary = "Public room info (for the join screen)")
    public ResponseEntity<RoomInfoResponse> getRoom(@PathVariable String roomToken) {
        Room room = roomService.getRoom(roomToken);
        return ResponseEntity.ok(new RoomInfoResponse(
            room.getRoomToken(), room.getName(), room.getCreatedAt(), room.getExpiresAt(),
            room.getStatus(), room.getParticipants().size(),
            roomService.roomUrl(room.getRoomToken())));
    }

    @PostMapping("/{roomToken}/join")
    @Operation(summary = "Join a room (no app required)")
    public ResponseEntity<JoinResponse> join(@PathVariable String roomToken, @RequestBody Map<String, Object> body) {
        String displayName = body.get("displayName") != null ? body.get("displayName").toString() : null;
        Room room = roomService.getRoom(roomToken);
        Participant p = roomService.join(roomToken, displayName);
        return ResponseEntity.status(HttpStatus.CREATED).body(new JoinResponse(
            p.getId(), p.getSessionToken(), p.getDisplayName(), room.getName(), room.getExpiresAt()));
    }

    @PostMapping("/{roomToken}/heartbeat")
    @Operation(summary = "Refresh participant presence")
    public ResponseEntity<Void> heartbeat(@PathVariable String roomToken,
                                          @RequestHeader(SESSION_HEADER) String sessionToken) {
        roomService.heartbeat(roomToken, sessionToken);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{roomToken}/participants")
    @Operation(summary = "List participants with presence")
    public ResponseEntity<ParticipantListResponse> participants(@PathVariable String roomToken) {
        List<Participant> ps = roomService.listParticipants(roomToken);
        List<ParticipantResponse> dtos = ps.stream()
            .map(p -> new ParticipantResponse(p.getId(), p.getDisplayName(), p.getStatus(), p.getJoinedAt(), p.getLastSeenAt()))
            .toList();
        long online = dtos.stream().filter(d -> "ONLINE".equals(d.status())).count();
        return ResponseEntity.ok(new ParticipantListResponse((int) online, dtos));
    }

    // ---- files ------------------------------------------------------------

    @PostMapping(value = "/{roomToken}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload a file into the room (streaming, any size/type)")
    public ResponseEntity<RoomFileResponse> uploadFile(@PathVariable String roomToken,
                                                        @RequestHeader(SESSION_HEADER) String sessionToken,
                                                        @RequestParam("file") MultipartFile file) {
        RoomFile rf = roomService.addFile(roomToken, sessionToken, file);
        return ResponseEntity.status(HttpStatus.CREATED).body(toDto(rf));
    }

    @GetMapping("/{roomToken}/files")
    @Operation(summary = "List room files")
    public ResponseEntity<List<RoomFileResponse>> listFiles(@PathVariable String roomToken,
                                                            @RequestHeader(SESSION_HEADER) String sessionToken) {
        List<RoomFileResponse> dtos = roomService.listFiles(roomToken, sessionToken).stream()
            .map(this::toDto).toList();
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/{roomToken}/files/{fileToken}")
    @Operation(summary = "Download a room file (streaming + HTTP Range)")
    public void downloadFile(@PathVariable String roomToken,
                             @PathVariable String fileToken,
                             HttpServletRequest request,
                             HttpServletResponse response) throws IOException {
        // Room isolation: the file must belong to THIS room (and be ACTIVE).
        RoomFile rf = roomService.requireFile(roomToken, fileToken);
        Path filePath = StorageConfig
            .resolveFilesDir(appProperties, runtimePaths)
            .resolve(rf.getStorageKey());
        log.info("Streaming room file: room={}, name={}", roomToken, rf.getOriginalFileName());
        fileStreamer.stream(filePath, rf.getContentType(), rf.getOriginalFileName(), request, response);
    }

    @GetMapping("/{roomToken}/files/{fileToken}/download")
    @Operation(summary = "Download a room file (forces attachment/save, supports Range)")
    public void downloadRoomFile(@PathVariable String roomToken,
                                 @PathVariable String fileToken,
                                 HttpServletRequest request,
                                 HttpServletResponse response) throws IOException {
        RoomFile rf = roomService.requireFile(roomToken, fileToken);
        Path filePath = StorageConfig
            .resolveFilesDir(appProperties, runtimePaths)
            .resolve(rf.getStorageKey());
        log.info("Downloading room file (attachment): room={}, name={}", roomToken, rf.getOriginalFileName());
        fileStreamer.stream(filePath, rf.getContentType(), rf.getOriginalFileName(), request, response, true);
    }

    @DeleteMapping("/{roomToken}/files/{fileToken}")
    @Operation(summary = "Remove a file from the room")
    public ResponseEntity<Void> deleteFile(@PathVariable String roomToken,
                                           @PathVariable String fileToken,
                                           @RequestHeader(SESSION_HEADER) String sessionToken) {
        roomService.deleteFile(roomToken, sessionToken, fileToken);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{roomToken}/close")
    @Operation(summary = "Close the room and remove its files (host)")
    public ResponseEntity<Void> close(@PathVariable String roomToken) {
        roomService.closeRoom(roomToken);
        return ResponseEntity.noContent().build();
    }

    private RoomFileResponse toDto(RoomFile rf) {
        return new RoomFileResponse(
            rf.getFileToken(), rf.getOriginalFileName(), rf.getContentType(), rf.getFileSize(),
            rf.getOwnerParticipantId(), rf.getOwnerDisplayName(), rf.getCreatedAt());
    }
}
