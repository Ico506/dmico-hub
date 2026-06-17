-- Hygiene: cleaning and personal care supplies inventory.
-- Run this in the Supabase SQL Editor.

create table public.hygiene_products (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  name          text not null,
  category      text,
  quantity      numeric,
  unit          text,             -- e.g. "bottles", "bars", "rolls"
  low_threshold numeric,          -- quantity below which status flips to 'low'
  status        text default 'ok', -- 'ok' | 'low' | 'out'
  notes         text,
  added_via     text default 'web'
);

alter table public.hygiene_products enable row level security;

create policy "authenticated full access"
on public.hygiene_products
for all
to authenticated
using (true)
with check (true);
