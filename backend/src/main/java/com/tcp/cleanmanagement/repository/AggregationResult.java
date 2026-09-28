package com.tcp.cleanmanagement.repository;

import java.math.BigDecimal;

public interface AggregationResult {
    Long getMetricId();
    Long getSampleCount();
    BigDecimal getSumValue();
    BigDecimal getMinValue();
    BigDecimal getMaxValue();
}
