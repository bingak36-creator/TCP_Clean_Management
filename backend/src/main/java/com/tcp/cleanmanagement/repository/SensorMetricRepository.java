package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.SensorMetric;
import com.tcp.cleanmanagement.enums.MetricCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SensorMetricRepository extends JpaRepository<SensorMetric, Long> {
    Optional<SensorMetric> findBySensorIdAndMetricCode(Long sensorId, MetricCode metricCode);
}
