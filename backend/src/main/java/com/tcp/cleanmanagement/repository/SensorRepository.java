package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.Sensor;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.List;

public interface SensorRepository extends JpaRepository<Sensor, Long> {
    List<Sensor> findByDeviceSetIdOrderByIdAsc(Long deviceSetId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Sensor s WHERE s.deviceSet.id = :setId ORDER BY s.id")
    List<Sensor> findByDeviceSetIdForUpdate(@Param("setId") Long deviceSetId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Sensor s WHERE s.id = :id")
    Optional<Sensor> findByIdForUpdate(@Param("id") Long id);
}
