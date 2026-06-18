-- thesis_chapters
-- One row per MPhil chapter. Word counts are updated in-place whenever
-- the user logs a writing session. status: 'drafting' | 'revising' | 'done'.

create table if not exists thesis_chapters (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  target_words  int  not null default 0,
  current_words int  not null default 0,
  status        text not null default 'drafting',
  due_date      date,
  notes         text,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

alter table thesis_chapters enable row level security;

create policy "authenticated full access"
  on thesis_chapters
  for all
  to authenticated
  using (true)
  with check (true);
