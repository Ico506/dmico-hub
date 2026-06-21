-- hygiene_routines — per-body-area routine for the Hygiene "Routine" tab.
-- Each row is a clickable zone on the anatomy figure (face, scalp, mouth, ...),
-- plus a special area_key '__global__' row holding the pinned key reminders.
-- side = which figure view ('front' | 'back'). Seeded from Damico's routine MD;
-- editable in-app. (Seed rows inserted via the hygiene_routines_seed migration.)

CREATE TABLE IF NOT EXISTS public.hygiene_routines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_key    text NOT NULL,
  label       text NOT NULL,
  side        text DEFAULT 'front',          -- 'front' | 'back'
  sort_order  integer NOT NULL DEFAULT 0,
  products    jsonb NOT NULL DEFAULT '[]',    -- array of strings
  steps       jsonb NOT NULL DEFAULT '[]',    -- array of {phase?, action, notes?}
  frequency   text,
  when_to     text,
  reminders   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hygiene_routines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated full access" ON public.hygiene_routines;
CREATE POLICY "authenticated full access" ON public.hygiene_routines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
