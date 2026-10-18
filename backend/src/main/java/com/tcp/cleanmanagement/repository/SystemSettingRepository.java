package com.tcp.cleanmanagement.repository;

import com.tcp.cleanmanagement.entity.SystemSetting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SystemSettingRepository extends JpaRepository<SystemSetting, String> {
}
