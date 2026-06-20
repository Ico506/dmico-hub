-- Budget rule presets. The selected rule lives as a JSON blob on the single
-- finance_settings row: {id, needs, wants, savings} percentages. v1 keeps the
-- three buckets as needs/wants/savings and just varies the percentages; presets
-- with no wants bucket (e.g. 80/20) store wants:0 and the Wants bar is hidden.

ALTER TABLE public.finance_settings
  ADD COLUMN IF NOT EXISTS budget_rule jsonb NOT NULL
  DEFAULT '{"id":"50/30/20","needs":50,"wants":30,"savings":20}'::jsonb;
