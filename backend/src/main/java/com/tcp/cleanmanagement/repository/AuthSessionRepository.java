package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.AuthSession;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.Optional;

public interface AuthSessionRepository extends JpaRepository<AuthSession, String> {
    @EntityGraph(attributePaths = "user")
    Optional<AuthSession> findByTokenHash(String tokenHash);
    @Modifying
    @Query("DELETE FROM AuthSession s WHERE s.expiresAt <= :now")
    int deleteExpired(@Param("now") LocalDateTime now);
    void deleteByUserId(Long userId);
}
