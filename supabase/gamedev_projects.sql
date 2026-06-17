-- Game Dev: JadeFrog Studio project tracker.
-- Run this in the Supabase SQL Editor.

create table public.gamedev_projects (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  name        text not null,
  status      text default 'active',   -- 'active' | 'on_hold' | 'shipped'
  engine      text,                    -- e.g. Unity, Godot, custom
  platform    text,                    -- e.g. PC, Mobile, WebGL
  pitch       text,                    -- one-line description
  start_date  date,
  notes       text,
  added_via   text default 'web'
);

alter table public.gamedev_projects enable row level security;

create policy "authenticated full access"
on public.gamedev_projects
for all
to authenticated
using (true)
with check (true);
