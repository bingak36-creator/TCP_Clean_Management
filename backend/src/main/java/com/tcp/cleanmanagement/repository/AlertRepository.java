package com.tcp.cleanmanagement.repository;
import com.tcp.cleanmanagement.entity.Alert;
import com.tcp.cleanmanagement.enums.AlertStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface AlertRepository extends JpaRepository<Alert, Long> {
    List<Alert> findByStatus(AlertStatus status);
}
