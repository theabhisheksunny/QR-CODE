package com.qrshare.room;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qrshare.config.RuntimePaths;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

/**
 * Persistence for Local Sharing Rooms. One JSON document per room under
 * {@code <data-root>/rooms/<roomId>.json}, with an in-memory cache and a
 * {@code roomToken -> id} index — the same proven pattern used by
 * {@link com.qrshare.storage.LocalMetadataStorageService} for direct shares.
 *
 * <p>Survives application restart: on startup every room JSON is reloaded, so an
 * unexpired room (and its files) becomes available again when Device A restarts.
 * No database is introduced.</p>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class RoomStore {

    private final RuntimePaths runtimePaths;
    private final ObjectMapper objectMapper;

    private final ConcurrentHashMap<String, Room> cache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> tokenToId = new ConcurrentHashMap<>();

    private Path roomsDir() {
        return runtimePaths.roomsDir();
    }

    @PostConstruct
    public void loadAll() {
        Path dir = roomsDir();
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new RuntimeException("Failed to create rooms directory: " + dir, e);
        }
        try (Stream<Path> files = Files.list(dir)) {
            files.filter(p -> p.toString().endsWith(".json")).forEach(p -> {
                try {
                    Room r = objectMapper.readValue(p.toFile(), Room.class);
                    cache.put(r.getId(), r);
                    if (r.getRoomToken() != null) {
                        tokenToId.put(r.getRoomToken(), r.getId());
                    }
                } catch (IOException e) {
                    log.warn("Could not load room file {}: {}", p, e.getMessage());
                }
            });
        } catch (IOException e) {
            log.warn("Could not list rooms directory {}: {}", dir, e.getMessage());
        }
        log.info("Loaded {} room(s) from {}", cache.size(), dir);
    }

    public Optional<Room> findByToken(String roomToken) {
        String id = tokenToId.get(roomToken);
        if (id == null) return Optional.empty();
        return Optional.ofNullable(cache.get(id));
    }

    public Optional<Room> findById(String id) {
        return Optional.ofNullable(cache.get(id));
    }

    public List<Room> findAll() {
        return new ArrayList<>(cache.values());
    }

    /** Rooms that are expired (by {@code expiresAt}) but not yet cleaned. */
    public List<Room> findExpired(Instant now) {
        List<Room> result = new ArrayList<>();
        for (Room r : cache.values()) {
            if (!"CLOSED".equals(r.getStatus())
                && r.getExpiresAt() != null
                && r.getExpiresAt().isBefore(now)) {
                result.add(r);
            }
        }
        return result;
    }

    public Room save(Room room) {
        Path file = roomPath(room.getId());
        // Serialize under the room's own monitor so a concurrent mutation on
        // another thread (e.g. a simultaneous upload adding to files) cannot
        // interleave with Jackson's traversal of the embedded lists.
        synchronized (room) {
            try {
                objectMapper.writeValue(file.toFile(), room);
            } catch (IOException e) {
                throw new RuntimeException("Failed to persist room id=" + room.getId(), e);
            }
        }
        cache.put(room.getId(), room);
        if (room.getRoomToken() != null) {
            tokenToId.put(room.getRoomToken(), room.getId());
        }
        return room;
    }

    public synchronized void delete(String id) {
        Room r = cache.remove(id);
        if (r != null && r.getRoomToken() != null) {
            tokenToId.remove(r.getRoomToken());
        }
        try {
            Files.deleteIfExists(roomPath(id));
        } catch (IOException e) {
            log.warn("Could not delete room file id={}: {}", id, e.getMessage());
        }
    }

    private Path roomPath(String id) {
        return roomsDir().resolve(id + ".json");
    }
}
