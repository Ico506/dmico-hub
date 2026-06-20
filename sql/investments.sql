-- Investments tab: manually-entered holdings with an allocation donut.
-- v1 keeps the bot's crypto separate; this is hub-entered holdings only.
-- Allocation is computed by `type`; current_value is optional (manual) and
-- drives a gain/loss readout when set.

CREATE TABLE IF NOT EXISTS public.investments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  type            text,                       -- allocation category (Stocks, Crypto, Gold, Funds, ...)
  amount_invested numeric NOT NULL DEFAULT 0,
  current_value   numeric,                    -- nullable, manual
  notes           text,
  added_via       text DEFAULT 'web',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated full access" ON public.investments;
CREATE POLICY "authenticated full access" ON public.investments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
