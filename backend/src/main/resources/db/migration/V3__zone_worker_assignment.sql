ALTER TABLE zones
    ADD COLUMN assigned_worker_id BIGINT NULL,
    ADD COLUMN assigned_worker_name VARCHAR(50) NULL;
ALTER TABLE sensors MODIFY COLUMN status ENUM('ACTIVE','ERROR','INACTIVE') NULL;
-- Preserve existing worker assignments. The earliest worker wins a pre-existing duplicate zone.
UPDATE zones z
JOIN (SELECT assigned_zone_id,MIN(id) AS worker_id FROM workers
      WHERE assigned_zone_id IS NOT NULL GROUP BY assigned_zone_id) selected ON selected.assigned_zone_id=z.id
JOIN workers w ON w.id=selected.worker_id
SET z.assigned_worker_id=w.id,z.assigned_worker_name=w.name;
