-- The exact first-party menu document for new extractions. Older rows fall back to the menu's primary URL.
ALTER TABLE pipeline_dish ADD COLUMN source_url TEXT;
