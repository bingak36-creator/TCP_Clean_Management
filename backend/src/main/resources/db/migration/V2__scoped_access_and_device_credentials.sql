-- Additive upgrade: preserves all measurements, installations, accounts and AI results.
ALTER TABLE users MODIFY role ENUM('ADMIN','CLEANER','DEVELOPER') NOT NULL;
ALTER TABLE sensor_data_raw ADD device_mac VARCHAR(17) NULL, ADD ingest_source VARCHAR(16) NOT NULL DEFAULT 'sensor_api';
ALTER TABLE upstash_devices ADD mq7_sensor_id BIGINT NULL, ADD CONSTRAINT fk_upstash_mq7_sensor FOREIGN KEY(mq7_sensor_id) REFERENCES sensors(id);
ALTER TABLE cleaning_records ADD created_by BIGINT NULL;
ALTER TABLE alerts ADD resolution_source VARCHAR(16) NULL;
CREATE TABLE device_credentials (
    mac_address VARCHAR(17) NOT NULL PRIMARY KEY,
    key_hash VARCHAR(64) NOT NULL,
    enabled BIT NOT NULL,
    rotated_at DATETIME(6) NOT NULL,
    rotated_by BIGINT NOT NULL
) ENGINE=InnoDB;
UPDATE sensor_data_raw r
JOIN sensor_metrics m ON m.id=r.metric_id
JOIN sensors s ON s.id=m.sensor_id
LEFT JOIN device_set_history h ON h.id=r.device_set_history_id
LEFT JOIN device_sets ds ON ds.id=s.device_set_id
LEFT JOIN upstash_devices u ON u.gas_sensor_id=s.id OR u.temperature_humidity_sensor_id=s.id
SET r.device_mac=COALESCE(h.mac_address,ds.mac_address,u.mac_address);
UPDATE sensor_data_raw r
JOIN upstash_imported_samples a ON a.mac_address=r.device_mac AND a.sample_key=r.sample_key
SET r.ingest_source=a.ingest_source;
CREATE INDEX ix_raw_device_packet ON sensor_data_raw(device_mac,measured_at,sample_key);
-- Keep one copy of an existing grant before enforcing uniqueness.
DELETE duplicate_grant FROM zone_permissions duplicate_grant
JOIN zone_permissions original_grant
ON duplicate_grant.user_id=original_grant.user_id AND duplicate_grant.zone_id=original_grant.zone_id AND duplicate_grant.id>original_grant.id;
ALTER TABLE zone_permissions ADD CONSTRAINT uq_user_zone UNIQUE(user_id,zone_id);
-- This old UI-only setting was never a device authentication credential.
DELETE FROM system_settings WHERE setting_key='device_key';
