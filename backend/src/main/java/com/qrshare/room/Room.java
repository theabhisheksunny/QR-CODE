package com.qrshare.room;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * A Local Sharing Room hosted by Device A. All participants (browsers on the
 * same LAN) join this room and relay file transfers through the host.
 *
 * <p>Persistence model mirrors the existing direct-share approach: one JSON
 * document per room under {@code <data-root>/rooms/}, with an in-memory cache in
 * {@link RoomStore}. Participants and files are embedded so the whole room is a
 * single atomic record (simple, no DB, survives restart until expiry).</p>
 *
 * <p>Status values: {@code ACTIVE}, {@code CLOSED}, {@code EXPIRED}.</p>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Room {

    /** Internal UUID (also the JSON filename). Never exposed in URLs. */
    private String id;

    /** Cryptographically secure token used in the join URL / QR. */
    private String roomToken;

    private String name;

    private Instant createdAt;
    private Instant expiresAt;

    /** ACTIVE | CLOSED | EXPIRED */
    @Builder.Default
    private String status = "ACTIVE";

    @Builder.Default
    private List<Participant> participants = new ArrayList<>();

    @Builder.Default
    private List<RoomFile> files = new ArrayList<>();
}
