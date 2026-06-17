-- Game Dev: devlog entries linked to projects.
-- Run this in the Supabase SQL Editor.

create table public.gamedev_logs (
  id           uuid primary key default gen_random_uuid(),
  logged_at    timestamptz default now(),
  project_id   uuid references public.gamedev_projects(id) on delete set null,
  project_name text,                   -- denormalised for display; filled on insert
  content      text not null,
  added_via    text default 'web'
);

alter table public.gamedev_logs enable row level security;

create policy "authenticated full access"
on public.gamedev_logs
for all
to authenticated
using (true)
with check (true);
