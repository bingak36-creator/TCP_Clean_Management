package com.tcp.cleanmanagement.dto;

import com.tcp.cleanmanagement.enums.MetricCode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

@Data
public class SensorDataRequest {
    @NotNull
    @Pattern(regexp = "[A-Za-z0-9._:-]{1,64}")
    private String sampleKey;

    private OffsetDateTime measuredAt;

    @NotEmpty
    private List<@Valid Reading> readings;

    @Data
    public static class Reading {
        @NotNull
        private MetricCode metricCode;

        @NotNull
        @Digits(integer = 12, fraction = 6)
        private BigDecimal measuredValue;
    }
}
