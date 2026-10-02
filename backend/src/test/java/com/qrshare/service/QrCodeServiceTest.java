package com.qrshare.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Plain unit tests for QrCodeService — no Spring context required.
 */
class QrCodeServiceTest {

    private QrCodeService qrCodeService;

    @BeforeEach
    void setUp() {
        qrCodeService = new QrCodeService();
    }

    // -------------------------------------------------------------------------
    // generateQrCode tests
    // -------------------------------------------------------------------------

    @Test
    void testGenerateQrCodeForText() {
        String result = qrCodeService.generateQrCode("hello world");
        assertThat(result).startsWith("data:image/png;base64,");
    }

    @Test
    void testGenerateQrCodeForUrl() {
        String result = qrCodeService.generateQrCode("https://example.com");
        assertThat(result).startsWith("data:image/png;base64,");
    }

    @Test
    void testGenerateQrCodeForJson() {
        String result = qrCodeService.generateQrCode("{\"key\":\"value\"}");
        assertThat(result).startsWith("data:image/png;base64,");
    }

    @Test
    void testGenerateQrCodeForNumber() {
        String result = qrCodeService.generateQrCode("123456789");
        assertThat(result).startsWith("data:image/png;base64,");
    }

    // -------------------------------------------------------------------------
    // detectType tests
    // -------------------------------------------------------------------------

    @Test
    void testDetectTypeUrl() {
        assertThat(qrCodeService.detectType("https://example.com")).isEqualTo("URL");
    }

    @Test
    void testDetectTypeUrlHttp() {
        assertThat(qrCodeService.detectType("http://example.com/path?q=1")).isEqualTo("URL");
    }

    @Test
    void testDetectTypeJson() {
        assertThat(qrCodeService.detectType("{\"a\":1}")).isEqualTo("JSON");
    }

    @Test
    void testDetectTypeNumber() {
        assertThat(qrCodeService.detectType("42")).isEqualTo("NUMBER");
    }

    @Test
    void testDetectTypeText() {
        assertThat(qrCodeService.detectType("hello world")).isEqualTo("TEXT");
    }
}
