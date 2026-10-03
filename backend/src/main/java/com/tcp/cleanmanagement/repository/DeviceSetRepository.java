package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.DeviceSet;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DeviceSetRepository extends JpaRepository<DeviceSet, Long> {
    Optional<DeviceSet> findByMacAddress(String macAddress);
    boolean existsBySetCode(String setCode);
    List<DeviceSet> findAllByOrderByIdAsc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT ds FROM DeviceSet ds WHERE ds.id = :id")
    Optional<DeviceSet> findByIdForUpdate(@Param("id") Long id);
}
