package com.tcp.cleanmanagement.repository;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface SensorDataRawRepository extends JpaRepository<SensorDataRaw, Long> {
    @Query("SELECT d FROM SensorDataRaw d WHERE d.sensor.id = :sensorId AND d.measuredAt >= :since ORDER BY d.measuredAt ASC")
    List<SensorDataRaw> findRecentDataBySensorId(@Param("sensorId") Long sensorId, @Param("since") LocalDateTime since);

    @Query("SELECT d.sensor.id as sensorId, " +
           "AVG(d.value1) as avgValue1, MAX(d.value1) as maxValue1, " +
           "AVG(d.value2) as avgValue2, MAX(d.value2) as maxValue2 " +
           "FROM SensorDataRaw d " +
           "WHERE d.measuredAt >= :startTime AND d.measuredAt < :endTime " +
           "GROUP BY d.sensor.id")
    List<AggregationResult> aggregateDataByTimeRange(@Param("startTime") LocalDateTime startTime, @Param("endTime") LocalDateTime endTime);

    @Modifying
    @Query("DELETE FROM SensorDataRaw d WHERE d.measuredAt < :cutoffTime")
    void deleteOlderThan(@Param("cutoffTime") LocalDateTime cutoffTime);
}
