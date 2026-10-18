package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.DailyChecklist;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DailyChecklistRepository extends JpaRepository<DailyChecklist, Long> {
    List<DailyChecklist> findByZoneIdAndCheckDate(Long zoneId, LocalDate checkDate);
    Optional<DailyChecklist> findByZoneIdAndCheckDateAndItemKey(Long zoneId, LocalDate checkDate, String itemKey);
}
