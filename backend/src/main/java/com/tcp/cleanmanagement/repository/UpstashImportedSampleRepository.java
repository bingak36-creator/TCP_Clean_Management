package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.UpstashImportedSample;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UpstashImportedSampleRepository extends JpaRepository<UpstashImportedSample, Long> {
    Optional<UpstashImportedSample> findByMacAddressAndSampleKey(String macAddress, String sampleKey);
}
