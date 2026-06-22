-- Exercise module: weight tracking + a healthy goal/calorie corner.
-- weight_logs: time series of weigh-ins. exercise_profile: single-row stats +
-- goal used for the Mifflin-St Jeor calorie estimate (sustainable rate + floor).
-- v1 has no food diary. The bot nudges a weekly weigh-in off weight_logs.

CREATE TABLE IF NOT EXISTS public.weight_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weight_kg  numeric NOT NULL,
  note       text,
  logged_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated full access" ON public.weight_logs;
CREATE POLICY "authenticated full access" ON public.weight_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.exercise_profile (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  height_cm       numeric,
  age             integer,
  sex             text,            -- 'male' | 'female' | 'other'
  activity        text,            -- sedentary | light | moderate | active | very_active
  goal_weight_kg  numeric,
  goal_type       text,            -- 'lose' | 'maintain' | 'gain'
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exercise_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated full access" ON public.exercise_profile;
CREATE POLICY "authenticated full access" ON public.exercise_profile
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
