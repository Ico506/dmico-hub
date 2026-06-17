-- Self-study: exams you're preparing for, plus a slot for the generated plan.
-- Run this in the Supabase SQL Editor.

create table public.study_exams (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  title         text not null,
  exam_date     date,
  topics        text,
  hours_per_day numeric,
  notes         text,
  plan          jsonb,          -- filled by the study-plan generator (next build)
  added_via     text default 'web'
);

alter table public.study_exams enable row level security;

create policy "authenticated full access"
on public.study_exams
for all
to authenticated
using (true)
with check (true);
