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
    List<Alert> findByStatus(AlertStatus status);

    @Modifying
    @Query("UPDATE Alert a SET a.deviceSetHistory = :history " +
           "WHERE a.deviceSetHistory IS NULL AND a.zone.id = :zoneId AND a.sensor.id IN " +
           "(SELECT s.id FROM Sensor s WHERE s.deviceSet.id = :setId)")
    int linkUnassignedHistory(@Param("setId") Long deviceSetId,
                              @Param("zoneId") Long zoneId,
                              @Param("history") DeviceSetHistory history);
}
