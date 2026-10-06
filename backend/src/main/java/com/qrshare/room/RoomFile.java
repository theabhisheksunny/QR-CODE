package com.qrshare.room;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * A file shared into a {@link Room}. The physical bytes are stored via the
 * existing {@link com.qrshare.storage.FileStorageService} under a random
 * {@link #storageKey} (never the original filename, never a path), exactly like
 * direct shares — so room uploads reuse the validated streaming store and the
 * download path reuses streaming + HTTP Range.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoomFile {

    private String id;

    /** Secure token used in the per-file download URL within the room. */
    private String fileToken;

    private String originalFileName;
    private String contentType;
    private Long fileSize;

    /** Random key = physical filename in storage/files/. Not a path. */
    private String storageKey;

    /** Participant id of the uploader. */
    private String ownerParticipantId;
    private String ownerDisplayName;

    private Instant createdAt;

    /** ACTIVE | DELETED */
    @Builder.Default
    private String status = "ACTIVE";
}
