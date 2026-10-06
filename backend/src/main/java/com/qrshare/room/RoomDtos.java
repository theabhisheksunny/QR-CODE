package com.qrshare.room;

import java.time.Instant;
import java.util.List;

/**
 * API response DTOs for the room feature. Deliberately exclude internal secrets:
 * participant {@code sessionToken} and file {@code storageKey} are never
 * serialized to other participants.
 */
public final class RoomDtos {

    private RoomDtos() {}

    /** Returned to the room owner right after creation (includes QR + URL). */
    public record CreateRoomResponse(
        String roomToken,
        String name,
        Instant createdAt,
        Instant expiresAt,
        String status,
        String roomUrl,
        String qrCode
    ) {}

    /** Public room info (safe for the join screen). */
    public record RoomInfoResponse(
        String roomToken,
        String name,
        Instant createdAt,
        Instant expiresAt,
        String status,
        int participantCount,
        String roomUrl
    ) {}

    /** Returned to a participant after a successful join — contains THEIR token. */
    public record JoinResponse(
        String participantId,
        String sessionToken,
        String displayName,
        String roomName,
        Instant expiresAt
    ) {}

    public record ParticipantResponse(
        String id,
        String displayName,
        String status,
        Instant joinedAt,
        Instant lastSeenAt
    ) {}

    public record RoomFileResponse(
        String fileToken,
        String originalFileName,
        String contentType,
        Long fileSize,
        String ownerParticipantId,
        String ownerDisplayName,
        Instant createdAt
    ) {}

    public record ParticipantListResponse(
        int onlineCount,
        List<ParticipantResponse> participants
    ) {}
}
