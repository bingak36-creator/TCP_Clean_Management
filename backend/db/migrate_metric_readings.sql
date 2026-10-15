-- Run once on an existing v1 database after a backup, with the application stopped.
-- Set this to the timezone used by the old Java process for LocalDateTime.now().
-- The old JDBC serverTimezone setting alone does not establish that timezone.
SET @legacy_offset = '+09:00';
SET time_zone = '+00:00';

RENAME TABLE sensor_data_raw TO sensor_data_raw_legacy,
             sensor_data_aggregated TO sensor_data_aggregated_legacy;

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
    CONSTRAINT ck_metric_unit CHECK ((metric_code = 'TEMPERATURE' AND unit_code = 'CELSIUS') OR
        (metric_code = 'HUMIDITY' AND unit_code = 'PERCENT') OR
        (metric_code = 'CONTACT' AND unit_code = 'BINARY') OR
        (metric_code = 'GAS' AND CHAR_LENGTH(unit_code) > 0)),
    CONSTRAINT ck_metric_thresholds CHECK ((pleasant_threshold IS NULL AND needs_ventilation_threshold IS NULL) OR
        (metric_code = 'GAS' AND unit_code <> 'UNVERIFIED' AND pleasant_threshold IS NOT NULL AND
         needs_ventilation_threshold IS NOT NULL AND pleasant_threshold < needs_ventilation_threshold))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sensor_data_raw (
    id BIGINT NOT NULL AUTO_INCREMENT,
    metric_id BIGINT NOT NULL,
    sample_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    measured_value DECIMAL(18,6) NOT NULL,
    measured_at DATETIME(3) NOT NULL,
    received_at DATETIME(3) NOT NULL,
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
    computed_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_aggregate_bucket (metric_id, granularity, bucket_start),
    KEY ix_aggregate_time (granularity, bucket_start),
    CONSTRAINT fk_aggregate_metric FOREIGN KEY (metric_id) REFERENCES sensor_metrics(id) ON DELETE RESTRICT,
    CONSTRAINT ck_aggregate_count CHECK (sample_count > 0),
    CONSTRAINT ck_aggregate_range CHECK (min_value <= avg_value AND avg_value <= max_value),
    CONSTRAINT ck_aggregate_alignment CHECK (MINUTE(bucket_start) = 0 AND SECOND(bucket_start) = 0 AND
        MICROSECOND(bucket_start) = 0 AND (granularity = 'HOUR' OR HOUR(bucket_start) = 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO sensor_metrics (sensor_id, metric_code, unit_code)
SELECT id, 'GAS', 'UNVERIFIED' FROM sensors WHERE sensor_type = 'GAS';
INSERT INTO sensor_metrics (sensor_id, metric_code, unit_code)
SELECT id, 'TEMPERATURE', 'CELSIUS' FROM sensors WHERE sensor_type = 'TEMP_HUMID';
INSERT INTO sensor_metrics (sensor_id, metric_code, unit_code)
SELECT id, 'HUMIDITY', 'PERCENT' FROM sensors WHERE sensor_type = 'TEMP_HUMID';
INSERT INTO sensor_metrics (sensor_id, metric_code, unit_code)
SELECT id, 'CONTACT', 'BINARY' FROM sensors WHERE sensor_type = 'MAG';

INSERT INTO sensor_data_raw (metric_id, sample_key, measured_value, measured_at, received_at, time_source)
SELECT m.id, CONCAT('legacy:', r.id), r.value1,
       CONVERT_TZ(r.measured_at, @legacy_offset, '+00:00'),
       CONVERT_TZ(r.measured_at, @legacy_offset, '+00:00'), 'LEGACY_SERVER'
FROM sensor_data_raw_legacy r
JOIN sensor_metrics m ON m.sensor_id = r.sensor_id
WHERE m.metric_code IN ('GAS', 'TEMPERATURE') AND r.value1 IS NOT NULL AND r.measured_at IS NOT NULL;

INSERT INTO sensor_data_raw (metric_id, sample_key, measured_value, measured_at, received_at, time_source)
SELECT m.id, CONCAT('legacy:', r.id), r.value2,
       CONVERT_TZ(r.measured_at, @legacy_offset, '+00:00'),
       CONVERT_TZ(r.measured_at, @legacy_offset, '+00:00'), 'LEGACY_SERVER'
FROM sensor_data_raw_legacy r
JOIN sensor_metrics m ON m.sensor_id = r.sensor_id AND m.metric_code = 'HUMIDITY'
WHERE r.value2 IS NOT NULL AND r.measured_at IS NOT NULL;

INSERT INTO sensor_data_aggregated
    (metric_id, granularity, bucket_start, sample_count, sum_value, avg_value, min_value, max_value, computed_at)
SELECT metric_id, 'HOUR', CAST(DATE_FORMAT(measured_at, '%Y-%m-%d %H:00:00') AS DATETIME),
       COUNT(*), SUM(measured_value), AVG(measured_value), MIN(measured_value), MAX(measured_value), UTC_TIMESTAMP(3)
FROM sensor_data_raw
GROUP BY metric_id, CAST(DATE_FORMAT(measured_at, '%Y-%m-%d %H:00:00') AS DATETIME);

INSERT INTO sensor_data_aggregated
    (metric_id, granularity, bucket_start, sample_count, sum_value, avg_value, min_value, max_value, computed_at)
SELECT metric_id, 'DAY', CAST(DATE_FORMAT(measured_at, '%Y-%m-%d 00:00:00') AS DATETIME),
       COUNT(*), SUM(measured_value), AVG(measured_value), MIN(measured_value), MAX(measured_value), UTC_TIMESTAMP(3)
FROM sensor_data_raw
GROUP BY metric_id, CAST(DATE_FORMAT(measured_at, '%Y-%m-%d 00:00:00') AS DATETIME);
