-- Finance: savings goals tracker.
-- Run this in the Supabase SQL Editor.

create table public.finance_goals (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  label      text not null,
  target     numeric not null,
  current    numeric not null default 0,
  updated_at timestamptz default now(),
  added_via  text default 'web'
);

alter table public.finance_goals enable row level security;

create policy "authenticated full access"
on public.finance_goals
for all
to authenticated
using (true)
with check (true);
