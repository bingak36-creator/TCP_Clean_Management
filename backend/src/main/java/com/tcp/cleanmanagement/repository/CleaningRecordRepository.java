package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.CleaningRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CleaningRecordRepository extends JpaRepository<CleaningRecord, Long> {
    List<CleaningRecord> findAllByOrderByCreatedAtDesc();
    List<CleaningRecord> findByZoneIdOrderByCreatedAtDesc(Long zoneId);
    java.util.Optional<CleaningRecord> findFirstByZoneIdOrderByCreatedAtDescIdDesc(Long id);
}
