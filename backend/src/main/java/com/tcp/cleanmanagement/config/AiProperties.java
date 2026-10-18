package com.tcp.cleanmanagement.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "restroom-ai")
public class AiProperties {
    private boolean enabled = true;
    private String directory = "ai";
    private String python = "";
    private int timeoutSeconds = 30;
    private int batchSize = 50;
    private int inputWaitSeconds = 300;
    private int backfillHours = 4;
}
