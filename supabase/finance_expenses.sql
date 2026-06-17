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
