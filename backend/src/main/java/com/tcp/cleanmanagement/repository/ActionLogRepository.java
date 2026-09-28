package com.tcp.cleanmanagement.repository;
import com.tcp.cleanmanagement.entity.ActionLog;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ActionLogRepository extends JpaRepository<ActionLog, Long> {}
