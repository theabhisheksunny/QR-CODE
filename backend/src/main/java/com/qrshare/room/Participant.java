package com.qrshare.room;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * A participant (a browser/device) that joined a {@link Room}. Identified to the
 * client only by {@link #sessionToken} (secure, unpredictable); the server uses
 * it to authorize room file operations and to track presence via heartbeats.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Participant {

    private String id;

    /** Secure random token the client sends on every room request. */
    private String sessionToken;

    private String displayName;

    private Instant joinedAt;
    private Instant lastSeenAt;

    /** ONLINE | OFFLINE (derived from lastSeenAt vs a timeout). */
    @Builder.Default
    private String status = "ONLINE";
}
