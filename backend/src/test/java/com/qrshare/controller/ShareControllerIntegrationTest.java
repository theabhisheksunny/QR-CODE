package com.qrshare.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.qrshare.dto.FileUploadResponse;
import com.qrshare.service.FileShareService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class ShareControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private FileShareService fileShareService;

    // -------------------------------------------------------------------------
    // GET /api/files/share/{token} — invalid token
    // -------------------------------------------------------------------------

    @Test
    void testShareFile_invalidToken() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/files/share/{token}", "notarealtoken"))
                .andExpect(status().isNotFound())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        JsonNode json = objectMapper.readTree(body);
        assertThat(json.get("error").asText()).isEqualTo("FILE_NOT_FOUND");
    }

    // -------------------------------------------------------------------------
    // GET /api/files/share/{token}/metadata — invalid token
    // -------------------------------------------------------------------------

    @Test
    void testShareFileMetadata_invalidToken() throws Exception {
        mockMvc.perform(get("/api/files/share/{token}/metadata", "notarealtoken"))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // Full streaming test — upload then stream
    // -------------------------------------------------------------------------

    @Test
    void testStreamFile_afterUpload_returnsCorrectContentType() throws Exception {
        // Step 1: upload a file via the HTTP endpoint to get rawToken from shareUrl
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "stream-test.txt",
                MediaType.TEXT_PLAIN_VALUE,
                "Streaming content here".getBytes()
        );

        MvcResult uploadResult = mockMvc.perform(multipart("/api/files")
                        .file(file)
                        .param("expirationMinutes", "30"))
                .andExpect(status().isCreated())
                .andReturn();

        String uploadBody = uploadResult.getResponse().getContentAsString();
        FileUploadResponse uploadResponse = objectMapper.readValue(uploadBody, FileUploadResponse.class);

        // shareUrl = http://localhost:8080/api/files/share/{rawToken}
        String shareUrl = uploadResponse.getShareUrl();
        assertThat(shareUrl).isNotBlank();

        // Extract raw token: last path segment of the shareUrl
        String rawToken = shareUrl.substring(shareUrl.lastIndexOf('/') + 1);
        assertThat(rawToken).isNotBlank();

        // Step 2: stream via the share endpoint
        MvcResult streamResult = mockMvc.perform(get("/api/files/share/{token}", rawToken))
                .andExpect(status().isOk())
                .andReturn();

        String contentType = streamResult.getResponse().getContentType();
        assertThat(contentType).isNotNull();
        assertThat(contentType).contains("text/plain");
    }
}
