-- Finance: expense log.
-- Run this in the Supabase SQL Editor.

create table public.finance_expenses (
  id         uuid primary key default gen_random_uuid(),
  logged_at  timestamptz default now(),
  amount     numeric not null,
  category   text,
  note       text,
  added_via  text default 'web'
);

alter table public.finance_expenses enable row level security;

create policy "authenticated full access"
on public.finance_expenses
for all
to authenticated
using (true)
with check (true);

-- ── Project budget link (run this separately if table already exists) ──
-- Links an expense to a Game Dev project for per-project spending totals.
-- Run this block in the Supabase SQL Editor if the table was already created:
--
--   alter table public.finance_expenses
--     add column if not exists project_id uuid
--     references public.gamedev_projects(id) on delete set null;

