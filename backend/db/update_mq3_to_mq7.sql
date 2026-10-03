-- Update existing MQ3 sensors to MQ7
ALTER TABLE sensors MODIFY COLUMN sensor_model ENUM('DHT22', 'MQ135', 'MQ3', 'MQ7') NULL;
UPDATE sensors SET sensor_model = 'MQ7' WHERE sensor_model = 'MQ3';
ALTER TABLE sensors MODIFY COLUMN sensor_model ENUM('DHT22', 'MQ135', 'MQ7') NULL;
