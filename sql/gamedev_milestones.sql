-- gamedev_milestones
-- Per-project milestones. Cascades on project delete so no orphan rows.
-- status: 'open' | 'done'.

create table if not exists gamedev_milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references gamedev_projects(id) on delete cascade,
  title       text not null,
  status      text not null default 'open',
  due_date    date,
  added_via   text,
  created_at  timestamptz not null default now()
);

alter table gamedev_milestones enable row level security;

create policy "authenticated full access"
  on gamedev_milestones
  for all
  to authenticated
  using (true)
  with check (true);
