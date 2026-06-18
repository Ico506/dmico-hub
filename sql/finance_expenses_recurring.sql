-- finance_expenses: recurring columns
-- Added to the existing finance_expenses table. Run once only.
-- is_recurring flags an expense as a standing bill.
-- recur_label is the dedup key (e.g. "Spotify", "Rent").

alter table finance_expenses
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recur_label  text;
