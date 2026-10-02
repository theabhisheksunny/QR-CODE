package com.qrshare.storage;

import org.springframework.core.io.Resource;

import java.io.IOException;
import java.io.InputStream;

public interface FileStorageService {

    /**
     * Stores the provided input stream under the given storage key.
     *
     * @param inputStream  the file data to store
     * @param storageKey   unique key used as the physical filename
     * @param contentType  MIME type (informational)
     * @return the storageKey used for storage
     * @throws IOException if writing fails
     */
    String store(InputStream inputStream, String storageKey, String contentType) throws IOException;

    /**
     * Loads the file associated with the given storage key as a Spring Resource.
     *
     * @param storageKey unique key of the file
     * @return Resource pointing to the stored file
     * @throws IOException if the file cannot be loaded
     */
    Resource load(String storageKey) throws IOException;

    /**
     * Deletes the file associated with the given storage key.
     * Silently ignores if the file does not exist.
     *
     * @param storageKey unique key of the file to delete
     */
    void delete(String storageKey);

    /**
     * Checks whether a file with the given storage key exists.
     *
     * @param storageKey unique key to check
     * @return true if the file exists, false otherwise
     */
    boolean exists(String storageKey);
}
