package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.UpstashImportedSample;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.List;
import java.time.LocalDateTime;
import org.springframework.data.domain.Pageable;

public interface UpstashImportedSampleRepository extends JpaRepository<UpstashImportedSample, Long> {
    Optional<UpstashImportedSample> findByMacAddressAndSampleKey(String macAddress, String sampleKey);
    Optional<UpstashImportedSample> findFirstByMacAddressOrderByMeasuredAtDescIdDesc(String macAddress);
    List<UpstashImportedSample> findByMacAddressAndMeasuredAtGreaterThanEqualOrderByMeasuredAtDescIdDesc(
            String macAddress, LocalDateTime from, Pageable pageable);
}
