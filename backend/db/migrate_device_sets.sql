-- Apply once to an existing metric-based database after backing it up.
-- Fresh development databases can be created from the updated JPA entities.
CREATE TABLE device_sets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    set_code VARCHAR(64) NOT NULL,
    mac_address VARCHAR(17) NOT NULL,
    zone_id BIGINT NOT NULL,
    installation_label VARCHAR(100) NOT NULL,
    created_at DATETIME(6),
    updated_at DATETIME(6),
    PRIMARY KEY (id),
    CONSTRAINT uq_device_set_code UNIQUE (set_code),
    CONSTRAINT uq_device_set_mac UNIQUE (mac_address),
    CONSTRAINT fk_device_set_zone FOREIGN KEY (zone_id) REFERENCES zones(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE sensors
    ADD COLUMN device_set_id BIGINT NULL,
    ADD COLUMN sensor_model ENUM('DHT22', 'MQ135', 'MQ7') NULL,
    ADD CONSTRAINT uq_sensor_set_model UNIQUE (device_set_id, sensor_model),
    ADD CONSTRAINT fk_sensor_device_set FOREIGN KEY (device_set_id) REFERENCES device_sets(id);

ALTER TABLE alerts
    ADD COLUMN sensor_id BIGINT NULL,
    ADD CONSTRAINT fk_alert_sensor FOREIGN KEY (sensor_id) REFERENCES sensors(id);

-- Existing sensors/readings remain intact. Attach the existing three sensor IDs
-- using POST /api/admin/device-sets with existingSensorIds after starting the new backend.
