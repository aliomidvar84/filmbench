-- Sprint 21 — executive report format (csv | pdf)
ALTER TABLE factory_reports
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'csv';

ALTER TABLE factory_reports
  DROP CONSTRAINT IF EXISTS factory_reports_format_check;

ALTER TABLE factory_reports
  ADD CONSTRAINT factory_reports_format_check CHECK (format IN ('csv', 'pdf'));

UPDATE factory_reports
SET format = CASE
  WHEN lower(file_name) LIKE '%.pdf' THEN 'pdf'
  ELSE 'csv'
END
WHERE format IS NULL OR format = 'csv';
