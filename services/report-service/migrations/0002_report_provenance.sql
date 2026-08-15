-- Report provenance: which snapshot(s) a report actually describes.
--
-- A report row already carried scan_ids, but generation ignored them and
-- re-resolved "latest scan per cluster" at render time, so a report could
-- silently describe a different snapshot than the one the user had selected —
-- and nothing in the row recorded which snapshot it really used. This column
-- stores the resolved sources (scan id, cluster, capture timestamp, whether it
-- was the latest snapshot, and its own totals) so list views can show
-- provenance without loading the multi-megabyte report_data payload.
--
-- Idempotent, per the migration runner's contract.

ALTER TABLE report.reports
  ADD COLUMN IF NOT EXISTS provenance JSONB;

-- Reports generated before this column existed have no recorded source. They
-- must read as "unknown", never as "the current snapshot" — the UI renders a
-- NULL provenance as "Source snapshot not recorded (generated before provenance
-- tracking)" rather than assuming anything.
COMMENT ON COLUMN report.reports.provenance IS
  'Resolved snapshot sources + scope/filters at generation time. NULL for reports generated before provenance tracking.';
