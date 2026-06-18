-- thesis_writing_logs
-- Every writing session. chapter_id is nullable so logs survive chapter
-- deletion (set null on delete). words_written is the delta for that session.

create table if not exists thesis_writing_logs (
  id            uuid primary key default gen_random_uuid(),
  chapter_id    uuid references thesis_chapters(id) on delete set null,
  words_written int  not null default 0,
  duration_mins int,
  notes         text,
  added_via     text,
  logged_at     timestamptz not null default now()
);

alter table thesis_writing_logs enable row level security;

create policy "authenticated full access"
  on thesis_writing_logs
  for all
  to authenticated
  using (true)
  with check (true);
