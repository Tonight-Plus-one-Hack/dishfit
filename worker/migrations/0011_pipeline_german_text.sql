-- German user-facing text for dishes. Dish names stay exactly as printed on the menu; descriptions
-- and section headings get a German version for the app (the original stays in description/section).
ALTER TABLE pipeline_dish ADD COLUMN description_de TEXT;
ALTER TABLE pipeline_dish ADD COLUMN section_de TEXT;
