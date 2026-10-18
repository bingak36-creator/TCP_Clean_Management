package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.Worker;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WorkerRepository extends JpaRepository<Worker, Long> {
    List<Worker> findByStatus(String status);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("SELECT w FROM Worker w WHERE w.id=:id")
    java.util.Optional<Worker> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") Long id);
    List<Worker> findByAssignedZoneId(Long zoneId);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("SELECT w FROM Worker w ORDER BY w.id")
    List<Worker> findAllForUpdate();
}
