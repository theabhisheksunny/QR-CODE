package com.qrshare;

import com.qrshare.config.PortSelector;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
public class QrShareApplication {
    public static void main(String[] args) {
        // Single source of truth for the runtime port: resolve before Spring
        // boots and publish to both server.port and app.server-port.
        PortSelector.resolveAndPublish();
        SpringApplication.run(QrShareApplication.class, args);
    }
}
