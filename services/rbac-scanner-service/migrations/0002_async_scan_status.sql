-- Async (SQS-driven) scan intake. SubmitScan persists the raw snapshot bytes
-- and a 'pending' row; the SQS consumer runs the engine and completes the row.
--
-- status defaults to 'completed' so every pre-existing row (all written by the
-- synchronous ScanSnapshot path) stays valid without a backfill.
-- raw_snapshot is only populated while a scan is pending — it is cleared once
-- the row reaches a terminal state so the table doesn't retain large blobs.

ALTER TABLE scanner.scans ALTER COLUMN scan_data DROP NOT NULL;
ALTER TABLE scanner.scans ALTER COLUMN cluster_name SET DEFAULT '';

ALTER TABLE scanner.scans
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS raw_snapshot BYTEA,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scans_status_check' AND conrelid = 'scanner.scans'::regclass
  ) THEN
    ALTER TABLE scanner.scans
      ADD CONSTRAINT scans_status_check CHECK (status IN ('pending', 'completed', 'failed'));
  END IF;
END $$;
