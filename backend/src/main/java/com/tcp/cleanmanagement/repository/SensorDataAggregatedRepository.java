package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.SensorDataAggregated;
import com.tcp.cleanmanagement.enums.AggregationGranularity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

public interface SensorDataAggregatedRepository extends JpaRepository<SensorDataAggregated, Long> {
    Optional<SensorDataAggregated> findByMetricIdAndGranularityAndBucketStart(
            Long metricId, AggregationGranularity granularity, LocalDateTime bucketStart);
}
