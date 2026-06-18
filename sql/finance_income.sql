-- finance_income
-- One row per calendar month. month is 0-indexed to match JS Date.getMonth()
-- (0 = January, 11 = December). The unique index enforces one entry per month;
-- use upsert with onConflict:"year,month" to edit rather than duplicate.

create table if not exists finance_income (
  id         uuid primary key default gen_random_uuid(),
  year       int  not null,
  month      int  not null,  -- 0-indexed (0=Jan, 11=Dec)
  amount     numeric not null default 0,
  notes      text,
  created_at timestamptz not null default now()
);

create unique index if not exists finance_income_year_month_idx
  on finance_income (year, month);

alter table finance_income enable row level security;

create policy "authenticated full access"
  on finance_income for all
  to authenticated
  using (true) with check (true);
