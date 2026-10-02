package com.qrshare.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String baseUrl = "http://localhost:8080";
    private Storage storage = new Storage();
    private int defaultExpirationMinutes = 30;
    private int maxFileSizeMb = 25;
    private long cleanupIntervalMs = 60000L;
    private String allowedOrigins = "http://localhost:5173";

    @Data
    public static class Storage {
        private String path = "./temp-files";
    }
}
