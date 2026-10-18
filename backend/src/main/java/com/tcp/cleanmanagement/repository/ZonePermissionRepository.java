package com.tcp.cleanmanagement.repository;
import com.tcp.cleanmanagement.entity.ZonePermission;
import org.springframework.data.jpa.repository.*;
import java.util.List;
public interface ZonePermissionRepository extends JpaRepository<ZonePermission,Long> {
    @EntityGraph(attributePaths="zone") List<ZonePermission> findByUserId(Long userId);
    void deleteByUserId(Long userId);
}
