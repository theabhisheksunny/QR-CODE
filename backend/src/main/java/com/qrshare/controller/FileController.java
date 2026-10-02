package com.qrshare.controller;

import com.qrshare.dto.FileMetadataResponse;
import com.qrshare.dto.FileUploadResponse;
import com.qrshare.service.FileShareService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "File Sharing", description = "Upload files and generate shareable QR codes")
public class FileController {

    private final FileShareService fileShareService;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload a file and receive a shareable QR code")
    public ResponseEntity<FileUploadResponse> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "expirationMinutes", defaultValue = "30") int expirationMinutes) {

        log.info("File upload request: name={}, size={}, expiration={}min",
            file.getOriginalFilename(), file.getSize(), expirationMinutes);

        FileUploadResponse response = fileShareService.uploadFile(file, expirationMinutes);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Retrieve metadata for a shared file by its ID")
    public ResponseEntity<FileMetadataResponse> getFileMetadata(@PathVariable UUID id) {
        log.debug("Metadata request for file id={}", id);
        FileMetadataResponse response = fileShareService.getFileMetadata(id);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a shared file by its ID")
    public ResponseEntity<Void> deleteFile(@PathVariable UUID id) {
        log.info("Delete request for file id={}", id);
        fileShareService.deleteFile(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/share/{token}/metadata")
    @Operation(summary = "Retrieve metadata for a shared file using its access token (no download count increment)")
    public ResponseEntity<FileMetadataResponse> getFileMetadataByToken(@PathVariable String token) {
        log.debug("Metadata-by-token request");
        FileMetadataResponse response = fileShareService.getFileMetadataByToken(token);
        return ResponseEntity.ok(response);
    }
}
