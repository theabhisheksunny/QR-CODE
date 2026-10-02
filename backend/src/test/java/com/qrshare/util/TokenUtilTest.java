package com.qrshare.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Plain unit tests for TokenUtil — no Spring context required.
 */
class TokenUtilTest {

    private TokenUtil tokenUtil;

    @BeforeEach
    void setUp() {
        tokenUtil = new TokenUtil();
    }

    @Test
    void testGenerateTokenNotNull() {
        String token = tokenUtil.generateToken();
        assertThat(token).isNotNull().isNotBlank();
    }

    @Test
    void testGenerateTokenLength() {
        // 24 random bytes Base64url-encoded without padding = 32 characters
        String token = tokenUtil.generateToken();
        assertThat(token).hasSize(32);
    }

    @Test
    void testGenerateTokenUniqueness() {
        Set<String> tokens = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            tokens.add(tokenUtil.generateToken());
        }
        assertThat(tokens).hasSize(1000);
    }

    @Test
    void testHashTokenConsistency() {
        String token = "test-token-abc-123";
        String hash1 = tokenUtil.hashToken(token);
        String hash2 = tokenUtil.hashToken(token);
        assertThat(hash1).isEqualTo(hash2);
    }

    @Test
    void testHashTokenDifference() {
        String hash1 = tokenUtil.hashToken("tokenAlpha");
        String hash2 = tokenUtil.hashToken("tokenBeta");
        assertThat(hash1).isNotEqualTo(hash2);
    }

    @Test
    void testHashTokenIsHex() {
        String token = tokenUtil.generateToken();
        String hash = tokenUtil.hashToken(token);
        // SHA-256 produces a 64-character lowercase hex string
        assertThat(hash).hasSize(64).matches("[0-9a-f]+");
    }
}
