-- Hygiene: cleaning chores with an interval tracker.
-- Run this in the Supabase SQL Editor.

create table public.hygiene_items (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  name          text not null,
  category      text,
  last_done     timestamptz,
  interval_days integer,          -- how often this chore should be done
  notes         text,
  added_via     text default 'web'
);

alter table public.hygiene_items enable row level security;

create policy "authenticated full access"
on public.hygiene_items
for all
to authenticated
using (true)
with check (true);
