-- finance_wishlist
-- Motivation sidebar in the Finance module. Each row is something the user
-- is saving towards. "months away" is computed in the frontend from the user's
-- average monthly savings rate vs. the item price.
-- url is optional — when present, the item name becomes a link (Shopee, Lazada, etc.)

create table if not exists finance_wishlist (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  price      numeric not null,
  url        text,
  created_at timestamptz not null default now()
);

alter table finance_wishlist enable row level security;

create policy "authenticated full access"
  on finance_wishlist for all
  to authenticated
  using (true) with check (true);
