package com.tcp.cleanmanagement.repository;
import com.tcp.cleanmanagement.entity.Alert;
import com.tcp.cleanmanagement.entity.DeviceSetHistory;
import com.tcp.cleanmanagement.enums.AlertStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
public interface AlertRepository extends JpaRepository<Alert, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM Alert a WHERE a.id=:id")
    java.util.Optional<Alert> findByIdForUpdate(@Param("id") Long id);
    boolean existsByDeviceSetHistoryDeviceSetId(Long deviceSetId);

    boolean existsBySensorIdAndAlertTypeAndStatusAndDetectionSourceAndDeviceSetHistoryId(
            Long sensorId, com.tcp.cleanmanagement.enums.AlertType type, AlertStatus status,
            String detectionSource, Long historyId);
    List<Alert> findBySensorIdAndAlertTypeAndDetectionSourceAndDeviceSetHistoryId(Long sensorId, com.tcp.cleanmanagement.enums.AlertType type,String source,Long historyId);
    List<Alert> findByStatus(AlertStatus status);

    @Modifying
    @Query("UPDATE Alert a SET a.deviceSetHistory = :history " +
           "WHERE a.deviceSetHistory IS NULL AND a.zone.id = :zoneId AND a.sensor.id IN " +
           "(SELECT s.id FROM Sensor s WHERE s.deviceSet.id = :setId)")
    int linkUnassignedHistory(@Param("setId") Long deviceSetId,
                              @Param("zoneId") Long zoneId,
                              @Param("history") DeviceSetHistory history);
}
