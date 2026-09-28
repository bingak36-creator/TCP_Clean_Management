package com.tcp.cleanmanagement.repository;
import com.tcp.cleanmanagement.entity.Sensor;
import org.springframework.data.jpa.repository.JpaRepository;
public interface SensorRepository extends JpaRepository<Sensor, Long> {}
