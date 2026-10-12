package com.tcp.cleanmanagement.config;

import lombok.Data;
import lombok.ToString;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "iot.upstash")
public class UpstashSyncProperties {
    @ToString.Exclude
    private String redisUrl = "";
    @ToString.Exclude
    private String restToken = "";
    private int batchSize = 200;
    private long discoveryIntervalMs = 300000;
}
