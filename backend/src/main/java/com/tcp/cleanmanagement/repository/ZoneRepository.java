package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.ZoneType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ZoneRepository extends JpaRepository<Zone, Long> {
    
    // Haversine formula
    @Query(value = "SELECT * FROM zones z WHERE (6371 * acos(cos(radians(:lat)) * cos(radians(z.latitude)) * cos(radians(z.longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(z.latitude)))) <= :radius", nativeQuery = true)
    List<Zone> findZonesWithinRadius(@Param("lat") Double lat, @Param("lng") Double lng, @Param("radius") Double radius);

    @Query(value = "SELECT * FROM zones z WHERE z.zone_type = :type AND (6371 * acos(cos(radians(:lat)) * cos(radians(z.latitude)) * cos(radians(z.longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(z.latitude)))) <= :radius", nativeQuery = true)
    List<Zone> findZonesByTypeAndRadius(@Param("type") String type, @Param("lat") Double lat, @Param("lng") Double lng, @Param("radius") Double radius);
    
    List<Zone> findByZoneType(ZoneType zoneType);
}
