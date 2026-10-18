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
    String CURRENT_INSTALLATION =
        " s.status=com.tcp.cleanmanagement.enums.SensorStatus.ACTIVE AND (" +
        "(ds.id IS NULL AND rh.id IS NULL AND s.zone.id=:zone) OR " +
        "(ds.id IS NOT NULL AND ds.zone.id=:zone AND rh.zone.id=:zone " +
        "AND rh.macAddress=ds.macAddress AND r.deviceMac=ds.macAddress " +
        "AND rh.id>COALESCE((SELECT MAX(h.id) FROM DeviceSetHistory h WHERE h.deviceSet.id=ds.id " +
        "AND (h.zone.id<>:zone OR h.macAddress<>ds.macAddress)),0))) ";
    @Query("SELECT r FROM SensorDataRaw r JOIN r.metric m JOIN m.sensor s LEFT JOIN s.deviceSet ds LEFT JOIN r.deviceSetHistory rh WHERE "+CURRENT_INSTALLATION+" AND m.metricCode=:code ORDER BY r.measuredAt DESC,r.id DESC")
    List<SensorDataRaw> latestCurrentMetric(@Param("zone") Long zone,@Param("code") MetricCode code,org.springframework.data.domain.Pageable page);
    @Query("SELECT r FROM SensorDataRaw r JOIN r.metric m JOIN m.sensor s LEFT JOIN s.deviceSet ds LEFT JOIN r.deviceSetHistory rh WHERE "+CURRENT_INSTALLATION+" AND s.sensorModel=:model ORDER BY r.measuredAt DESC,r.id DESC")
    List<SensorDataRaw> latestCurrentModel(@Param("zone") Long zone,@Param("model") SensorModel model,org.springframework.data.domain.Pageable page);
    @Query("SELECT r.sampleKey FROM SensorDataRaw r JOIN r.metric m JOIN m.sensor s LEFT JOIN s.deviceSet ds LEFT JOIN r.deviceSetHistory rh WHERE "+CURRENT_INSTALLATION+" AND r.deviceMac=:mac AND r.measuredAt>=:from GROUP BY r.sampleKey ORDER BY MAX(r.measuredAt) DESC,r.sampleKey DESC")
    List<String> currentSampleKeys(@Param("mac") String mac,@Param("zone") Long zone,@Param("from") LocalDateTime from,org.springframework.data.domain.Pageable page);
    @Query("SELECT r FROM SensorDataRaw r JOIN r.metric m JOIN m.sensor s LEFT JOIN s.deviceSet ds LEFT JOIN r.deviceSetHistory rh WHERE "+CURRENT_INSTALLATION+" AND r.deviceMac=:mac AND r.sampleKey IN :keys")
    List<SensorDataRaw> currentReadings(@Param("mac") String mac,@Param("zone") Long zone,@Param("keys") java.util.Collection<String> keys);
    @Query("SELECT r.sampleKey FROM SensorDataRaw r LEFT JOIN r.deviceSetHistory rh WHERE r.deviceMac=:mac AND r.measuredAt>=:from " +
        "AND ((rh.id IS NOT NULL AND rh.zone.id IN :zones) OR " +
        "(rh.id IS NULL AND r.metric.sensor.zone.id IN :zones)) " +
        "GROUP BY r.sampleKey ORDER BY MAX(r.measuredAt) DESC,r.sampleKey DESC")
    List<String> authorizedSampleKeys(@Param("mac") String mac,@Param("zones") java.util.Collection<Long> zones,@Param("from") LocalDateTime from,org.springframework.data.domain.Pageable page);
    @Query("SELECT r.sampleKey FROM SensorDataRaw r WHERE r.deviceMac=:mac AND r.measuredAt>=:from GROUP BY r.sampleKey ORDER BY MAX(r.measuredAt) DESC,r.sampleKey DESC")
    List<String> recentSampleKeys(@Param("mac") String mac,@Param("from") LocalDateTime from,org.springframework.data.domain.Pageable page);
    List<SensorDataRaw> findByDeviceMacAndSampleKeyIn(String mac,java.util.Collection<String> keys);
    boolean existsByDeviceSetHistoryDeviceSetId(Long deviceSetId);

    Optional<SensorDataRaw> findByMetricSensorIdAndMetricMetricCodeAndSampleKey(Long sensorId, MetricCode code, String sampleKey);

    @Query("SELECT d FROM SensorDataRaw d WHERE d.metric.metricCode = :code " +
           "AND (d.metric.sensor.sensorModel IS NULL OR d.metric.sensor.sensorModel <> :excluded) " +
           "AND d.measuredAt >= :from AND NOT EXISTS (SELECT p.id FROM AiPrediction p WHERE p.id = d.id) " +
           "ORDER BY d.measuredAt, d.id")
    List<SensorDataRaw> findAiBackfill(@Param("code") MetricCode code, @Param("excluded") SensorModel excluded,
            @Param("from") LocalDateTime from, org.springframework.data.domain.Pageable page);

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
