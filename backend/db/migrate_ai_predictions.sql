-- Back up the DB and stop the application. Apply once BEFORE deploying with ddl-auto=validate.
-- Development ddl-auto=update creates the equivalent structures from JPA.
ALTER TABLE alerts
    MODIFY COLUMN alert_type ENUM('SMOKING','FREEZE','WINDOW','LEAK') NULL,
    ADD COLUMN detection_source VARCHAR(16) NOT NULL DEFAULT 'RULE',
    ADD COLUMN model_version VARCHAR(64) NULL,
    ADD COLUMN level VARCHAR(32) NULL;

CREATE TABLE ai_predictions (
    id BIGINT NOT NULL,
    version BIGINT,
    sensor_id BIGINT NOT NULL,
    zone_id BIGINT NOT NULL,
    device_set_history_id BIGINT NULL,
    sample_key VARCHAR(64) NOT NULL,
    device_id VARCHAR(128),
    sensor_model VARCHAR(8),
    measured_at DATETIME(6) NOT NULL,
    queued_at DATETIME(6) NOT NULL,
    gas_value DECIMAL(18,6) NOT NULL,
    temperature DECIMAL(18,6),
    humidity DECIMAL(18,6),
    status ENUM('PENDING','RUNNING','RETRY','COMPLETE','SKIPPED') NOT NULL,
    attempts INT NOT NULL,
    next_attempt_at DATETIME(6) NOT NULL,
    level VARCHAR(32),
    headline VARCHAR(255),
    model_version VARCHAR(64),
    error VARCHAR(255),
    predicted_at DATETIME(6),
    result_json LONGTEXT,
    PRIMARY KEY (id),
    INDEX ix_ai_work (status, next_attempt_at, measured_at),
    INDEX ix_ai_sensor_time (sensor_id, measured_at, id),
    INDEX ix_ai_device_time (device_id, measured_at, id),
    CONSTRAINT fk_ai_sensor FOREIGN KEY (sensor_id) REFERENCES sensors(id),
    CONSTRAINT fk_ai_zone FOREIGN KEY (zone_id) REFERENCES zones(id),
    CONSTRAINT fk_ai_installation FOREIGN KEY (device_set_history_id) REFERENCES device_set_history(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- id is the source gas reading ID, deliberately without a FK: raw readings have a 7-day retention.
