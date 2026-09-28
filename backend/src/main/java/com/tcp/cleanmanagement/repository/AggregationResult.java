package com.tcp.cleanmanagement.repository;

public interface AggregationResult {
    Long getSensorId();
    Double getAvgValue1();
    Double getMaxValue1();
    Double getAvgValue2();
    Double getMaxValue2();
}
