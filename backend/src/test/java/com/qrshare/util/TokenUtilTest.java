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

}
