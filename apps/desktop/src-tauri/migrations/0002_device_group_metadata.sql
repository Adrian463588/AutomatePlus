ALTER TABLE device_groups ADD COLUMN description TEXT;
ALTER TABLE device_groups ADD COLUMN primary_device_id TEXT;
ALTER TABLE device_groups ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE device_groups SET updated_at = created_at WHERE updated_at = 0;
