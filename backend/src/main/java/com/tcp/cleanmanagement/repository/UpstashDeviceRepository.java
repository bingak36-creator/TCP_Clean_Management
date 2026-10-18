package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.UpstashDevice;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface UpstashDeviceRepository extends JpaRepository<UpstashDevice, String> {
    Optional<UpstashDevice> findByGasSensorId(Long sensorId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM UpstashDevice d WHERE d.macAddress = :mac")
    Optional<UpstashDevice> findLockedByMac(@Param("mac") String mac);
}
