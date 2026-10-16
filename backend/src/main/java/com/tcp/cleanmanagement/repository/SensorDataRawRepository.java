package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.DeviceSetHistory;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.SensorModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface SensorDataRawRepository extends JpaRepository<SensorDataRaw, Long> {
    Optional<SensorDataRaw> findByMetricIdAndSampleKey(Long metricId, String sampleKey);

    @Modifying
    @Query("UPDATE SensorDataRaw d SET d.deviceSetHistory = :history " +
           "WHERE d.deviceSetHistory IS NULL AND d.metric.id IN " +
           "(SELECT m.id FROM SensorMetric m WHERE m.sensor.deviceSet.id = :setId)")
    int linkUnassignedHistory(@Param("setId") Long deviceSetId,
                              @Param("history") DeviceSetHistory history);

    @Query("SELECT d.metric.id as metricId, COUNT(d) as sampleCount, " +
           "SUM(d.measuredValue) as sumValue, MIN(d.measuredValue) as minValue, MAX(d.measuredValue) as maxValue " +
           "FROM SensorDataRaw d " +
           "WHERE d.measuredAt >= :startTime AND d.measuredAt < :endTime " +
           "GROUP BY d.metric.id")
    List<AggregationResult> aggregateDataByTimeRange(@Param("startTime") LocalDateTime startTime,
                                                      @Param("endTime") LocalDateTime endTime);

    @Modifying
    @Query("DELETE FROM SensorDataRaw d WHERE d.measuredAt < :cutoffTime")
    int deleteOlderThan(@Param("cutoffTime") LocalDateTime cutoffTime);

    Optional<SensorDataRaw> findFirstByMetricSensorZoneIdAndMetricMetricCodeOrderByMeasuredAtDescIdDesc(
            Long zoneId, MetricCode metricCode);

    Optional<SensorDataRaw> findFirstByMetricSensorZoneIdAndMetricSensorSensorModelOrderByMeasuredAtDescIdDesc(
            Long zoneId, SensorModel sensorModel);
}
