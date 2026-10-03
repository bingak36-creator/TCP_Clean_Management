-- Apply once to a metric/device-set database BEFORE starting the updated backend.
-- Back up the database first. This records the currently known installation;
-- installation changes made before this migration cannot be reconstructed.
CREATE TABLE device_set_history (
    id BIGINT NOT NULL AUTO_INCREMENT,
    device_set_id BIGINT NOT NULL,
    zone_id BIGINT NOT NULL,
    zone_name VARCHAR(255),
    set_code VARCHAR(64) NOT NULL,
    mac_address VARCHAR(17) NOT NULL,
    installation_label VARCHAR(100) NOT NULL,
    changed_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_set_history_set_id (device_set_id, id),
    CONSTRAINT fk_set_history_device_set FOREIGN KEY (device_set_id) REFERENCES device_sets(id),
    CONSTRAINT fk_set_history_zone FOREIGN KEY (zone_id) REFERENCES zones(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE sensor_data_raw
    ADD COLUMN device_set_history_id BIGINT NULL,
    ADD CONSTRAINT fk_raw_set_history FOREIGN KEY (device_set_history_id) REFERENCES device_set_history(id);
ALTER TABLE alerts
    ADD COLUMN device_set_history_id BIGINT NULL,
    ADD CONSTRAINT fk_alert_set_history FOREIGN KEY (device_set_history_id) REFERENCES device_set_history(id);

INSERT INTO device_set_history
    (device_set_id, zone_id, zone_name, set_code, mac_address, installation_label, changed_at)
SELECT ds.id, ds.zone_id, z.name, ds.set_code, ds.mac_address, ds.installation_label, UTC_TIMESTAMP(6)
FROM device_sets ds JOIN zones z ON z.id = ds.zone_id;

UPDATE sensor_data_raw r
JOIN sensor_metrics m ON m.id = r.metric_id
JOIN sensors s ON s.id = m.sensor_id
JOIN device_set_history h ON h.device_set_id = s.device_set_id
SET r.device_set_history_id = h.id
WHERE r.device_set_history_id IS NULL;

UPDATE alerts a
JOIN sensors s ON s.id = a.sensor_id
JOIN device_set_history h ON h.device_set_id = s.device_set_id AND h.zone_id = a.zone_id
SET a.device_set_history_id = h.id
WHERE a.device_set_history_id IS NULL;
