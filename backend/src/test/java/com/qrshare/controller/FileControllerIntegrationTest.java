package com.qrshare.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class FileControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    // -------------------------------------------------------------------------
    // POST /api/files — upload
    // -------------------------------------------------------------------------

    @Test
    void testUploadFile_success() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "hello.txt",
                MediaType.TEXT_PLAIN_VALUE,
                "Hello, integration test!".getBytes()
        );

        MvcResult result = mockMvc.perform(multipart("/api/files")
                        .file(file)
                        .param("expirationMinutes", "30"))
                .andExpect(status().isCreated())
                .andReturn();

        String body = result.getResponse().getContentAsString();
        assertThat(body).contains("id");
        assertThat(body).contains("shareUrl");
        assertThat(body).contains("qrCode");
    }

    @Test
    void testUploadFile_noFile() throws Exception {
        // Sending an empty multipart request without a "file" part → 400
        // Spring passes an empty MultipartFile; FileShareService throws IllegalArgumentException
        // which is handled as 400 Bad Request.
        mockMvc.perform(multipart("/api/files"))
                .andExpect(status().isBadRequest());
    }

    // -------------------------------------------------------------------------
    // GET /api/files/{id} — metadata by ID
    // -------------------------------------------------------------------------

    @Test
    void testGetMetadata_notFound() throws Exception {
        mockMvc.perform(get("/api/files/{id}", UUID.randomUUID()))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // DELETE /api/files/{id}
    // -------------------------------------------------------------------------

    @Test
    void testDeleteFile_notFound() throws Exception {
        mockMvc.perform(delete("/api/files/{id}", UUID.randomUUID()))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // GET /api/files/share/{token}/metadata
    // -------------------------------------------------------------------------

    @Test
    void testGetShareMetadata_invalidToken() throws Exception {
        mockMvc.perform(get("/api/files/share/{token}/metadata", "invalidtoken"))
                .andExpect(status().isNotFound());
    }
}
