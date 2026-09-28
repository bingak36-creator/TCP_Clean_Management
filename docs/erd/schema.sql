-- Proposed ERD v2. Review schema; NOT an in-place migration for the current JPA model.
-- MySQL >= 8.0.16 / InnoDB. Run in an EMPTY database selected by the caller.
-- Application/JDBC/scheduler must use UTC; DATETIME itself does not convert zones.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('DEVELOPER','ADMIN') NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    CONSTRAINT ck_users_active CHECK (is_active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_devices (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    installation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    platform ENUM('ANDROID','IOS','WEB') NOT NULL,
    fcm_token VARCHAR(1024) CHARACTER SET ascii COLLATE ascii_bin NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_device_installation (user_id, installation_id),
    UNIQUE KEY uq_device_token (fcm_token),
    CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT ck_device_active CHECK (is_active IN (0,1) AND (is_active = 0 OR fcm_token IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE zones (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(10,6) NOT NULL,
    zone_type ENUM('TOILET','SMOKING') NOT NULL,
    is_our_solution BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY ix_zone_public (zone_type, is_active),
    CONSTRAINT ck_zone_latitude CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT ck_zone_longitude CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT ck_zone_flags CHECK (is_our_solution IN (0,1) AND is_active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE zone_permissions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    zone_id BIGINT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_permission_user_zone (user_id, zone_id),
    KEY ix_permission_zone_user (zone_id, user_id),
    CONSTRAINT fk_permission_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_permission_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sensors (
    id BIGINT NOT NULL AUTO_INCREMENT,
    zone_id BIGINT NOT NULL,
    device_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sensor_type ENUM('GAS','TEMP_HUMID','MAG') NOT NULL,
    status ENUM('ACTIVE','ERROR','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    last_seen_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_sensor_device_key (device_key),
    KEY ix_sensor_zone_status (zone_id, status),
    CONSTRAINT fk_sensor_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sensor_metrics (
    id BIGINT NOT NULL AUTO_INCREMENT,
    sensor_id BIGINT NOT NULL,
    metric_code ENUM('GAS','TEMPERATURE','HUMIDITY','CONTACT') NOT NULL,
    unit_code VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    pleasant_threshold DECIMAL(18,6) NULL,
    needs_ventilation_threshold DECIMAL(18,6) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_metric_sensor_code (sensor_id, metric_code),
    CONSTRAINT fk_metric_sensor FOREIGN KEY (sensor_id) REFERENCES sensors(id) ON DELETE RESTRICT,
    CONSTRAINT ck_metric_unit CHECK ((metric_code = 'TEMPERATURE' AND unit_code = 'CELSIUS') OR (metric_code = 'HUMIDITY' AND unit_code = 'PERCENT') OR (metric_code = 'CONTACT' AND unit_code = 'BINARY') OR (metric_code = 'GAS' AND CHAR_LENGTH(unit_code) > 0)),
    CONSTRAINT ck_metric_thresholds CHECK ((pleasant_threshold IS NULL AND needs_ventilation_threshold IS NULL) OR (metric_code = 'GAS' AND unit_code <> 'UNVERIFIED' AND pleasant_threshold IS NOT NULL AND needs_ventilation_threshold IS NOT NULL AND pleasant_threshold < needs_ventilation_threshold))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sensor_data_raw (
    id BIGINT NOT NULL AUTO_INCREMENT,
    metric_id BIGINT NOT NULL,
    sample_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    measured_value DECIMAL(18,6) NOT NULL,
    measured_at DATETIME(3) NOT NULL,
    received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    time_source ENUM('DEVICE','SERVER','LEGACY_SERVER') NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_raw_metric_sample (metric_id, sample_key),
    KEY ix_raw_metric_time (metric_id, measured_at, id),
    KEY ix_raw_cleanup (measured_at),
    CONSTRAINT fk_raw_metric FOREIGN KEY (metric_id) REFERENCES sensor_metrics(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sensor_data_aggregated (
    id BIGINT NOT NULL AUTO_INCREMENT,
    metric_id BIGINT NOT NULL,
    granularity ENUM('HOUR','DAY') NOT NULL,
    bucket_start DATETIME(3) NOT NULL,
    sample_count BIGINT NOT NULL,
    sum_value DECIMAL(28,6) NOT NULL,
    avg_value DECIMAL(20,8) NOT NULL,
    min_value DECIMAL(18,6) NOT NULL,
    max_value DECIMAL(18,6) NOT NULL,
    computed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_aggregate_bucket (metric_id, granularity, bucket_start),
    KEY ix_aggregate_time (granularity, bucket_start),
    CONSTRAINT fk_aggregate_metric FOREIGN KEY (metric_id) REFERENCES sensor_metrics(id) ON DELETE RESTRICT,
    CONSTRAINT ck_aggregate_count CHECK (sample_count > 0),
    CONSTRAINT ck_aggregate_range CHECK (min_value <= avg_value AND avg_value <= max_value),
    CONSTRAINT ck_aggregate_alignment CHECK (MINUTE(bucket_start) = 0 AND SECOND(bucket_start) = 0 AND MICROSECOND(bucket_start) = 0 AND (granularity = 'HOUR' OR HOUR(bucket_start) = 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE alerts (
    id BIGINT NOT NULL AUTO_INCREMENT,
    zone_id BIGINT NOT NULL,
    trigger_reading_id BIGINT NULL,
    alert_type ENUM('SMOKING','FREEZE','WINDOW') NOT NULL,
    status ENUM('UNRESOLVED','RESOLVED') NOT NULL DEFAULT 'UNRESOLVED',
    message VARCHAR(500) NOT NULL,
    detector_version VARCHAR(64) NOT NULL,
    evidence JSON NOT NULL,
    first_detected_at DATETIME(3) NOT NULL,
    last_detected_at DATETIME(3) NOT NULL,
    occurrence_count BIGINT NOT NULL DEFAULT 1,
    resolved_at DATETIME(3) NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    open_zone_id BIGINT GENERATED ALWAYS AS (CASE WHEN status = 'UNRESOLVED' THEN zone_id ELSE NULL END) VIRTUAL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_alert_open_zone_type (open_zone_id, alert_type),
    KEY ix_alert_zone_status_time (zone_id, status, created_at),
    KEY ix_alert_status_time (status, created_at),
    KEY ix_alert_reading (trigger_reading_id),
    CONSTRAINT fk_alert_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE RESTRICT,
    CONSTRAINT fk_alert_reading FOREIGN KEY (trigger_reading_id) REFERENCES sensor_data_raw(id) ON DELETE SET NULL,
    CONSTRAINT ck_alert_status_time CHECK ((status = 'UNRESOLVED' AND resolved_at IS NULL) OR (status = 'RESOLVED' AND resolved_at IS NOT NULL AND resolved_at >= first_detected_at)),
    CONSTRAINT ck_alert_detection_time CHECK (last_detected_at >= first_detected_at),
    CONSTRAINT ck_alert_count CHECK (occurrence_count > 0 AND version >= 0),
    CONSTRAINT ck_alert_evidence CHECK (JSON_TYPE(evidence) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE action_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    alert_id BIGINT NOT NULL,
    admin_id BIGINT NOT NULL,
    action_type ENUM('NOTE','RESOLVE') NOT NULL,
    action_detail TEXT NOT NULL,
    request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_action_request (alert_id, request_key),
    KEY ix_action_alert_time (alert_id, created_at),
    KEY ix_action_admin_time (admin_id, created_at),
    CONSTRAINT fk_action_alert FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_action_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT ck_action_detail CHECK (CHAR_LENGTH(TRIM(action_detail)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_deliveries (
    id BIGINT NOT NULL AUTO_INCREMENT,
    alert_id BIGINT NOT NULL,
    user_device_id BIGINT NOT NULL,
    status ENUM('PENDING','SENDING','SENT','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    lease_token VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    locked_until DATETIME(3) NULL,
    sent_at DATETIME(3) NULL,
    provider_message_id VARCHAR(255) NULL,
    last_error VARCHAR(500) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_delivery_alert_device (alert_id, user_device_id),
    KEY ix_delivery_pending (status, next_attempt_at),
    KEY ix_delivery_lease (status, locked_until),
    KEY ix_delivery_device (user_device_id, created_at),
    CONSTRAINT fk_delivery_alert FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_delivery_device FOREIGN KEY (user_device_id) REFERENCES user_devices(id) ON DELETE RESTRICT,
    CONSTRAINT ck_delivery_attempt CHECK (attempt_count >= 0),
    CONSTRAINT ck_delivery_sent CHECK ((status = 'SENT' AND sent_at IS NOT NULL) OR (status <> 'SENT' AND sent_at IS NULL)),
    CONSTRAINT ck_delivery_lease CHECK ((status = 'SENDING' AND lease_token IS NOT NULL AND locked_until IS NOT NULL) OR (status <> 'SENDING' AND lease_token IS NULL AND locked_until IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
