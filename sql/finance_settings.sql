-- finance_settings
-- Single-row config table. Always upsert against the existing row (by id).
-- opening_balance: savings accumulated before tracking began (one-time entry).
-- monthly_budget:  spending limit used in the Expenses tab budget bar.
--                  Mirrors the dmico-hub-monthly-budget localStorage key.

create table if not exists finance_settings (
  id               uuid primary key default gen_random_uuid(),
  opening_balance  numeric not null default 0,
  monthly_budget   numeric,
  updated_at       timestamptz not null default now()
);

alter table finance_settings enable row level security;

create policy "authenticated full access"
  on finance_settings for all
  to authenticated
  using (true) with check (true);
