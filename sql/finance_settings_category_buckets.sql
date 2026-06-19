-- 50/30/20 needs-vs-wants split.
-- A category -> bucket map lives as a JSON blob on the single finance_settings
-- row. Keys are lowercased category names, values are 'need' | 'want'.
-- Anything not in the map renders as "unsorted" in the 50/30/20 panel.

ALTER TABLE public.finance_settings
  ADD COLUMN IF NOT EXISTS category_buckets jsonb NOT NULL DEFAULT '{}'::jsonb;
