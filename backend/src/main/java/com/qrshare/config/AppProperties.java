package com.qrshare.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private int serverPort = 8787;
    private Storage storage = new Storage();
    private String metadataStoragePath = "";
    private int defaultExpirationMinutes = 30;
    private long cleanupIntervalMs = 60000L;
    private String allowedOrigins = "*";
    private String appVersion = "1.0.0";
    private boolean autoOpenBrowser = true;

    @Data
    public static class Storage {
        private String path = "";
    }
}
