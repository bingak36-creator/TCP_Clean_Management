-- Preserve unknown legacy metadata as NULL instead of guessing a floor or gender.
ALTER TABLE zones ADD COLUMN floor VARCHAR(8) NULL, ADD COLUMN gender VARCHAR(8) NULL;
