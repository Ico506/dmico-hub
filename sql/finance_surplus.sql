-- finance_surplus
-- One-off extra income entries (gifts, freelance, windfalls, etc.).
-- Separate from finance_income (monthly allowance) so they don't pollute
-- the recurring income tracking. Scoped to a point in time via logged_at.
-- When computing savings, sum this table per month and add to allowance.

create table if not exists finance_surplus (
  id          uuid primary key default gen_random_uuid(),
  amount      numeric not null,
  description text,
  logged_at   timestamptz not null default now()
);

alter table finance_surplus enable row level security;

create policy "authenticated full access"
  on finance_surplus for all
  to authenticated
  using (true) with check (true);
