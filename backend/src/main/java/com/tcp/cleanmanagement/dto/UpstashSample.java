package com.tcp.cleanmanagement.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;

@JsonIgnoreProperties(ignoreUnknown = true)
public record UpstashSample(
        String source,
        @JsonProperty("mac_address") String macAddress,
        @JsonProperty("sample_key") String sampleKey,
        @JsonProperty("measured_at") String measuredAt,
        @JsonProperty("dht_ok") Boolean dhtOk,
        @JsonProperty("temperature_c") BigDecimal temperatureC,
        @JsonProperty("humidity_percent") BigDecimal humidityPercent,
        @JsonProperty("mq135_adc") BigDecimal mq135Adc) {}
