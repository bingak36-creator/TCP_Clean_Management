package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.DeviceSetHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DeviceSetHistoryRepository extends JpaRepository<DeviceSetHistory, Long> {
    Optional<DeviceSetHistory> findFirstByDeviceSetIdOrderByIdDesc(Long deviceSetId);
    List<DeviceSetHistory> findByDeviceSetIdOrderByIdDesc(Long deviceSetId);
}
