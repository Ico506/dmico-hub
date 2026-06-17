-- Game Dev: ideas scratch-pad with Kanban status.
-- Run this in the Supabase SQL Editor.

create table public.gamedev_ideas (
  id        uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title     text not null,
  genre     text,                      -- e.g. platformer, puzzle, narrative
  hook      text,                      -- one-line concept pitch
  status    text default 'seed',       -- 'seed' | 'exploring' | 'shelved'
  notes     text,
  added_via text default 'web'
);

alter table public.gamedev_ideas enable row level security;

create policy "authenticated full access"
on public.gamedev_ideas
for all
to authenticated
using (true)
with check (true);
