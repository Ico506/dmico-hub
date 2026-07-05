-- Smart Groceries: inventory + freshness + cook log (PRD-smart-groceries).
-- Run this in the Supabase SQL Editor.

-- ── Inventory ────────────────────────────────────────────────
create table public.groceries_items (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  name            text not null,
  category        text not null default 'other',   -- keys into groceries_shelf_defaults
  priority        boolean not null default false,  -- manual "cook this first" flag
  track_mode      text not null default 'status',  -- 'status' | 'count' | 'level'
  status          text default 'have',             -- status: have|low|out · level: full|half|low|out
  count           integer,                         -- count mode only; 0 => out
  bought_on       date not null default current_date,
  shelf_life_days integer not null default 7,
  storage         text not null default 'fridge',  -- 'fridge' | 'freezer' | 'pantry'
  note            text,
  added_via       text default 'web'               -- 'web' | 'capture'
);

alter table public.groceries_items enable row level security;

create policy "authenticated full access"
on public.groceries_items
for all
to authenticated
using (true)
with check (true);

-- ── Shelf-life defaults per category ─────────────────────────
create table public.groceries_shelf_defaults (
  category           text primary key,
  label              text not null,
  default_track_mode text not null default 'status',  -- 'status' | 'count' | 'level'
  fridge_days        integer,   -- null = storage not applicable
  freezer_days       integer,
  pantry_days        integer
);

alter table public.groceries_shelf_defaults enable row level security;

create policy "authenticated full access"
on public.groceries_shelf_defaults
for all
to authenticated
using (true)
with check (true);

-- ── Cook log (the personal cookbook, Phase 2 writes into this) ──
create table public.cook_log (
  id         uuid primary key default gen_random_uuid(),
  cooked_on  date not null default current_date,
  dish       text not null,
  source     text not null default 'original',  -- 'gemma' | 'original' | 'internet'
  link       text,                              -- internet finds
  note       text,
  liked      boolean,                           -- true 👍 / false 👎 / null unrated
  added_via  text default 'web'
);

alter table public.cook_log enable row level security;

create policy "authenticated full access"
on public.cook_log
for all
to authenticated
using (true)
with check (true);

-- ── Seed: shelf-life defaults ─────────────────────────────────
-- Days are conservative home-fridge values; per-item override exists in the hub.
insert into public.groceries_shelf_defaults
  (category, label, default_track_mode, fridge_days, freezer_days, pantry_days) values
  -- vegetables
  ('leafy_greens',   'Leafy greens (spinach, kangkung, bok choy)', 'status', 4,   60,  null),
  ('herbs',          'Fresh herbs (coriander, spring onion)',      'status', 5,   90,  null),
  ('root_veg',       'Root veg (carrot, radish, beetroot)',        'status', 21,  180, 7),
  ('onions_garlic',  'Onions, garlic, shallots',                   'status', 30,  null, 30),
  ('potatoes',       'Potatoes, sweet potatoes',                   'status', null, null, 21),
  ('tomatoes',       'Tomatoes',                                   'status', 7,   60,  4),
  ('cabbage_family', 'Cabbage, broccoli, cauliflower',             'status', 10,  90,  null),
  ('beans_pods',     'Long beans, okra, capsicum',                 'status', 7,   90,  null),
  ('mushrooms',      'Mushrooms',                                  'status', 5,   30,  null),
  ('chilies',        'Chilies (fresh)',                            'status', 10,  90,  null),
  ('bean_sprouts',   'Bean sprouts, tofu-adjacent fresh veg',      'status', 2,   null, null),
  -- fruit
  ('citrus',         'Citrus (lime, lemon, orange)',               'status', 21,  null, 7),
  ('bananas',        'Bananas',                                    'status', null, 60,  5),
  ('apples_pears',   'Apples, pears',                              'status', 30,  null, 7),
  ('tropical_fruit', 'Tropical fruit (mango, papaya, pineapple)',  'status', 5,   60,  3),
  ('berries_grapes', 'Berries, grapes',                            'status', 4,   90,  null),
  -- protein
  ('chicken',        'Chicken (raw)',                              'status', 2,   90,  null),
  ('beef_lamb',      'Beef, lamb (raw)',                           'status', 3,   120, null),
  ('pork',           'Pork (raw)',                                 'status', 3,   120, null),
  ('fish_seafood',   'Fish, seafood (raw)',                        'status', 1,   90,  null),
  ('minced_meat',    'Minced meat (any, raw)',                     'status', 1,   90,  null),
  ('processed_meat', 'Sausages, ham, bacon (opened)',              'status', 7,   60,  null),
  ('eggs',           'Eggs',                                       'count',  28,  null, 7),
  ('tofu_tempeh',    'Tofu, tempeh (opened/fresh)',                'status', 3,   60,  null),
  -- dairy
  ('milk',           'Milk (opened)',                              'level',  5,   null, null),
  ('yogurt',         'Yogurt',                                     'status', 10,  null, null),
  ('cheese_hard',    'Hard cheese (opened)',                       'status', 21,  120, null),
  ('cheese_soft',    'Soft cheese, cream (opened)',                'status', 7,   null, null),
  ('butter',         'Butter',                                     'level',  60,  180, null),
  -- cooked & leftovers
  ('leftovers',      'Cooked leftovers (rice, dishes)',            'status', 3,   60,  null),
  ('cooked_rice',    'Cooked rice',                                'status', 3,   30,  null),
  -- staples & liquids
  ('rice_dry',       'Rice (dry)',                                 'level',  null, null, 365),
  ('noodles_pasta',  'Noodles, pasta (dry)',                       'status', null, null, 365),
  ('flour_baking',   'Flour, baking supplies',                     'level',  null, null, 240),
  ('cooking_oil',    'Cooking oil',                                'level',  null, null, 365),
  ('soy_sauces',     'Soy sauce, oyster sauce, fish sauce',        'level',  180, null, 365),
  ('vinegar',        'Vinegar',                                    'level',  null, null, 720),
  ('condiments',     'Sambal, chili sauce, ketchup (opened)',      'level',  90,  null, null),
  ('pastes',         'Curry pastes, belacan (opened)',             'status', 30,  120, null),
  ('canned',         'Canned goods (unopened)',                    'count',  null, null, 720),
  ('sugar_salt',     'Sugar, salt',                                'level',  null, null, 999),
  ('spices_dry',     'Dried spices',                               'status', null, null, 365),
  ('coconut_milk',   'Coconut milk (opened)',                      'status', 3,   60,  null),
  -- bread & breakfast
  ('bread',          'Bread',                                      'status', 7,   90,  4),
  ('cereal_oats',    'Cereal, oats (opened)',                      'status', null, null, 90),
  ('spreads',        'Jam, peanut butter, kaya (opened)',          'level',  60,  null, 30),
  -- drinks & frozen
  ('juice',          'Juice (opened)',                             'level',  7,   null, null),
  ('frozen_food',    'Frozen food (dumplings, nuggets, etc.)',     'status', null, 120, null),
  ('ice_cream',      'Ice cream',                                  'status', null, 90,  null),
  -- fallback
  ('other',          'Other',                                      'status', 7,   90,  30)
on conflict (category) do nothing;
