package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.AiPrediction;
import com.tcp.cleanmanagement.enums.AiPredictionStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface AiPredictionRepository extends JpaRepository<AiPrediction, Long> {
    boolean existsByDeviceSetHistoryDeviceSetId(Long deviceSetId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM AiPrediction p WHERE p.id = :id")
    Optional<AiPrediction> findLocked(@Param("id") Long id);
    List<AiPrediction> findByStatusInAndNextAttemptAtLessThanEqualOrderByMeasuredAtAscIdAsc(
            List<AiPredictionStatus> statuses, LocalDateTime now, Pageable page);
    List<AiPrediction> findByZoneIdInOrderByMeasuredAtDescIdDesc(java.util.Collection<Long> zoneIds, Pageable page);
    List<AiPrediction> findAllByOrderByMeasuredAtDescIdDesc(Pageable page);
    Optional<AiPrediction> findFirstBySensorIdOrderByMeasuredAtDescIdDesc(Long sensorId);
    List<AiPrediction> findByDeviceIdAndStatusAndMeasuredAtGreaterThanEqualAndMeasuredAtLessThanOrderByMeasuredAtAscIdAsc(
            String deviceId, AiPredictionStatus status, LocalDateTime from, LocalDateTime until, Pageable page);
    @Query("SELECT CASE WHEN COUNT(p) > 0 THEN true ELSE false END FROM AiPrediction p " +
           "WHERE p.sensor.id = :sensorId AND p.status IN :states AND " +
           "(p.measuredAt < :at OR (p.measuredAt = :at AND p.id < :id))")
    boolean hasEarlierWork(@Param("sensorId") Long sensorId, @Param("at") LocalDateTime at,
            @Param("id") Long id, @Param("states") List<AiPredictionStatus> states);
    long countByStatus(AiPredictionStatus status);
}
