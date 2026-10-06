package com.qrshare.room;

import com.qrshare.service.ShareUrlService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Builds the outward-facing room join URL. Reuses {@link ShareUrlService} (the
 * single source of truth for the LAN IP + runtime port), so room QRs always use
 * a LAN-accessible address and never localhost/127.0.0.1 for remote devices.
 */
@Service
@RequiredArgsConstructor
public class RoomUrlService {

    private final ShareUrlService shareUrlService;

    /** e.g. {@code http://192.168.1.25:8787/room/<roomToken>}. */
    public String buildRoomUrl(String roomToken) {
        return shareUrlService.baseUrl() + "/room/" + roomToken;
    }
}
