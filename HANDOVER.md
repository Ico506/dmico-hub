# DMICO Life OS — Session Handover

Paste this entire file into a new Claude Cowork session to resume with full context. No re-explanation needed.

---

## Who you are working with

**Damico** (brand: **DMICO**, studio: **JadeFrog Studio** — keep these two identities separate). Malaysian game designer and MPhil candidate at APU, researching nostalgia-driven AR for a retro gaming museum. ~6 years Unity/C# experience. GitHub username: `ico506`. Based in Sibu, Sarawak.

### Non-negotiable working style

- End every reply with 🎩. Never use 🐸 as sign-off.
- No em dashes anywhere (use commas, colons, or parentheses instead).
- Give complete files, not snippets, unless Damico explicitly asks for a partial.
- One clear recommendation over a menu of options.
- No sycophancy. Push back when something is wrong. Flag contradictions before acting.
- Humorous, direct, no fluff.

---

## Project overview

Three surfaces, one Supabase backend:

1. **Life OS hub** (`dmico-hub`, this repo) — private auth-gated web app on GitHub Pages. The primary surface for this session.
2. **Discord bot** (separate repo, Python + discord.py, on Railway) — daily reflection, adherence check-ins, schedule proposals. Not touched in this session.
3. **3D museum** (future, separate public repo, three.js) — portfolio-facing, no private data.

**Live site:** https://ico506.github.io/dmico-hub/
**Repo:** `ico506/dmico-hub` (public — GitHub Pages free tier requires public; safe because no secrets live in the frontend)
**Supabase project ref:** `vlczjdqqpajkggzjlsqe`
**Supabase URL:** `https://vlczjdqqpajkggzjlsqe.supabase.co` (bare host — never append `/rest/v1`)

---

## Security rules (never break these)

- The **publishable key** (`sb_publishable_CF0CgAOY4Ak70NRqILPWlA_IJWWcAuE`) lives in `config.js` as `window.DMICO_CONFIG` and ONLY there. No other file ever holds the key, so file replacements can never accidentally wipe it.
- The **service_role / secret key** NEVER goes in the frontend. Ever.
- All tables use RLS with an "authenticated full access" policy (`using (true) with check (true)`). The publishable key is safe to ship because RLS gates everything.

---

## File map

```
dmico-hub/
├── index.html          — login view + app shell (lantern rail + stage)
├── config.js           — window.DMICO_CONFIG (URL + publishable key). Touch this file last.
├── app.js              — auth, session restore, lantern rail render + drag-to-reorder, openModule router
├── styles.css          — all CSS (~2783 lines). Warm earthy palette. Never touch :root font vars.
├── dashboard.js        — Home module. Parallel fetch of all module signals, rendered as clickable cards.
├── research.js         — Research module (Crossref search, library, tags, BibTeX, related papers)
├── self-study.js       — Self-study module (exam countdown, focus timer)
├── hygiene.js          — Hygiene module (cleaning timers, supply inventory)
├── gamedev.js          — Game Dev module (projects, devlog, milestones, idea board)
├── finance.js          — Finance module (Overview, Expenses, Goals tabs + Wishlist sidebar) — 1119 lines
├── thesis.js           — Thesis module (chapter tracker, writing log)
└── sql/
    ├── finance_income.sql
    ├── finance_settings.sql
    ├── finance_surplus.sql
    ├── finance_wishlist.sql
    ├── finance_expenses_recurring.sql
    ├── gamedev_milestones.sql
    ├── thesis_chapters.sql
    └── thesis_writing_logs.sql
```

Google Fonts loaded in `index.html`:
- **Zen Maru Gothic** (wght 400;500;700) — display / headings, CSS var `--display`
- **Zen Kaku Gothic New** (wght 400;500;700) — body text, CSS var `--body`

Do not change fonts without Damico's explicit instruction. He changed to Trocchi once and immediately reverted.

---

## Design system (styles.css :root)

```css
--paper: #F4EBD2          /* page background, warm cream */
--paper-deep: #EADCBD     /* slightly darker cream, hover states */
--surface: #FEFAE0        /* card surfaces */
--surface-2: #FFFDF4      /* card inner surfaces (fin-ov sections use this) */
--ink: #45301E            /* primary text */
--ink-soft: #7C6A4F       /* secondary text */
--ink-faint: #A89A7C      /* placeholder / muted text */
--line: #E3D7BA           /* borders and dividers */
--accent: #5F6F52         /* olive green — primary action colour */
--accent-deep: #4B5840    /* darker olive for hover */
--accent-wash: rgba(95,111,82,0.14) /* tint for focus rings and selected states */
--lantern: #C4661F        /* alloy orange — active module glow */
--lantern-glow: rgba(196,102,31,0.38)
--clay: #8A3F1E           /* error / destructive / negative */
--radius: 14px
--radius-lg: 22px
--shadow: 0 1px 2px rgba(69,48,30,0.05), 0 8px 24px rgba(69,48,30,0.07)
```

---

## App shell (app.js)

**Pattern:** every module has a `window.renderXxx(container, sb)` function defined as an IIFE in its own file. `openModule(id)` in `app.js` calls the right one and hands it `#stage-body` and the Supabase client.

**Lantern rail:** drag-to-reorder is implemented with the HTML5 Drag-and-Drop API. Order persists to `localStorage` under key `dmico-rail-order` (JSON array of module IDs). All 7 modules are currently `lit: true` (built and ready).

**Tab drag-reorder:** a MutationObserver watches `#stage-body` and auto-attaches drag handlers to any `.r-tabs` bar that appears. Tab order persists per-module under `dmico-tab-order-{moduleId}`.

**MODULES array (current order as shipped):**
```
dashboard, research, selfstudy, hygiene, gamedev, finance, thesis
```

---

## Supabase tables (all migrations run, all verified)

### Tables built before this session

| Table | Purpose |
|---|---|
| `research_papers` | Research library entries |
| `study_exams` | Upcoming exams with countdown |
| `hygiene_items` | Cleaning tasks with interval tracking |
| `hygiene_products` | Supply inventory with low-stock threshold |
| `gamedev_projects` | JadeFrog Studio projects |
| `gamedev_logs` | Devlog entries per project |
| `gamedev_ideas` | Idea backlog |
| `gamedev_milestones` | Per-project milestones (status: open/done) |
| `finance_expenses` | Individual expense entries |
| `finance_goals` | Savings goals with label/target/current |
| `finance_income` | Monthly allowance, one row per year+month (month is 0-indexed) |
| `finance_settings` | Single-row config: opening_balance, monthly_budget |
| `thesis_chapters` | MPhil chapters with word count targets |
| `thesis_writing_logs` | Per-session writing deltas |

### Tables added in THIS session (migrations already run in Supabase)

**`finance_surplus`** — one-off extra income (gifts, freelance, windfalls). Kept separate from `finance_income` so monthly allowance tracking stays clean.
```sql
id uuid PK, amount numeric, description text, logged_at timestamptz (default now())
```

**`finance_wishlist`** — motivation items in the Finance right sidebar.
```sql
id uuid PK, label text, price numeric, url text (nullable), image_url text (nullable), created_at timestamptz
```
Note: `image_url` stores a plain URL (no Supabase Storage). The frontend uses `onerror="this.style.display='none'"` to silently hide broken images.

All tables: RLS enabled, "authenticated full access" policy.

---

## Finance module (finance.js) — detailed state

This was the primary focus of the most recent sessions. It is fully built and working.

### Structure

`renderFinance(container, sb)` renders a two-column layout:
- **Left (`.fin-main`):** tab bar (Overview / Expenses / Goals) + tab content
- **Right (`.fin-sidebar`, 260px fixed):** Wishlist panel (always visible, independent data fetch)

### Overview tab

Renders six sections in this order:
1. **Income panel** (`drawIncomePanel`) — log monthly allowance, view history, edit.
2. **Surplus panel** (`drawSurplusPanel`) — one-off extra income with add form, entry list, delete, past months accordion.
3. **Opening balance + totals strip** — computed from `finance_settings.opening_balance` + all-time net savings from `finance_income`, `finance_surplus`, `finance_expenses`.
4. **50/30/20 rule** (`draw503020`) — budget split against total income (allowance + surplus). Falls back gracefully when income is not yet logged.
5. **6-month savings chart** (`drawSavingsChart`) — canvas bar chart, one bar per month, green positive / clay negative.
6. **Goal projections** (`drawProjections`) — each `finance_goals` row with ETA in months based on `avgMonthlySavings`.

**Key data shape:**
- `finance_income` is queried for the current month (`year = thisYear AND month = thisMonth` — month is 0-indexed).
- `finance_surplus` is queried with `gte/lt` date range for the current month.
- `totalIncomeThisMonth = allowance + surplusThisMonth` — this is what draw503020 and dashboard use.
- `monthlySavings` array: built from 6-month history, each entry `{ year, month, net }` where `net = totalIn - exp` (null if no income logged that month).

### Expenses tab

Month picker (prev/next arrows), category breakdown with percentages, entry list with delete. Recurring expenses badge on entries that have `is_recurring = true`. Add expense form with category dropdown (including Game Dev project costs).

### Goals tab

Savings goals sorted by % funded descending. Progress bars. Add/delete goals. Each goal links to the projections in Overview.

### Wishlist sidebar (right column, always visible)

Independent fetch: settings + income + expenses + surplus + wishlist items, all in parallel. Computes `totalSaved` (opening_balance + all historical net savings) and `avgMonthlySavings` independently.

Cards sorted by % funded descending. Each card shows:
- Thumbnail image (if `image_url` set) — 52×52px, `onerror` hides on broken URL
- Label (linked to `url` if present)
- Price
- Progress bar (fills orange when 100%)
- "% funded · ~N months" or "Can afford now!" label

Add form: label + price + Shopee/Lazada link (optional) + image URL (optional, right-click copy image address from any product page).

### CSS class namespaces

- `.fin-ov-*` — Finance Overview sections, stat rows, income panel, rule bars, projections
- `.fin-rec-*` — Recurring expense entries
- `.fin-wl-*` — Wishlist sidebar and cards
- `.fin-layout` — two-column grid wrapper (`1fr 260px`)
- `.fin-main` — left column
- `.fin-sidebar` — right column

### localStorage keys used by Finance

- `dmico-hub-monthly-budget` — monthly spending limit (synced from finance_settings.monthly_budget, used by dashboard before Finance module loads)

---

## Dashboard module (dashboard.js)

Fetches all module signals in parallel (11 concurrent queries). Finance card shows:
- Primary: `monthSpend of budgetLimit` or `monthSpend this month`
- Secondary: savings rate if income is logged (`Saved RM X · Y% this month`), deficit warning if negative, otherwise budget remaining or top goal progress.

`finance_surplus` is included in the parallel fetch and added to income for savings rate calculation.

---

## What is working (verified in production)

All 7 modules are lit and functional:
- **Home (dashboard):** all 6 signal cards, click to navigate.
- **Research:** Crossref search, library with tags/BibTeX/export, related papers via edge function.
- **Self-study:** exam countdown, focus timer with presets.
- **Hygiene:** cleaning timers, supply inventory.
- **Game Dev:** projects, devlog, milestones, idea board.
- **Finance:** Overview (income, surplus, 50/30/20, chart, projections), Expenses (month picker, breakdown, recurring), Goals, Wishlist sidebar. All styling fixed and verified.
- **Thesis:** chapter tracker, writing sessions.

---

## Known past bugs (resolved, do not reintroduce)

**CSS truncation bug (this session):** styles.css was truncated mid-selector at `.fin-wl-ca` in a prior session. The next session appended the missing `rd-top { ... }` fragment directly, which created two garbage CSS rules (`4px;` orphan, `.fin-wl-ca` broken selector) that invalidated everything after line ~2380 including all `.fin-ov-*` rules. Fixed by removing those 8 broken lines with Python. Always verify appended CSS lands cleanly -- check with `grep -n "selector-name" styles.css` after any append operation.

**Edit tool "file not read yet":** the Edit tool requires the file to be Read first in the same session. If editing two files simultaneously, read both before editing either.

**Supabase URL `/rest/v1` suffix:** if a 404 appears on auth or table queries, check that `SUPABASE_URL` in `config.js` is the bare host with no path suffix.

**Trocchi font incident:** Damico changed the font to Trocchi and immediately reverted. The CSS vars `--display` and `--body` must stay as Zen fonts. Do not change them without explicit instruction.

---

## Deploy workflow

1. Edit files in the `dmico-hub` local clone (Cowork does this directly).
2. Open GitHub Desktop, review changes, commit, push.
3. Wait ~60 seconds for GitHub Pages to deploy.
4. Hard-refresh the live site (Ctrl+Shift+R) to bust cache.

For Supabase table changes: paste the `.sql` file content into the Supabase SQL Editor and run. Keep the `.sql` files in `sql/` updated to match.

---

## Pending and suggested next work

These are not committed to — confirm with Damico before starting any:

1. **Finance polish:** the Overview layout is now fixed. Potential next: expense category tagging for the 50/30/20 needs/wants split (currently shows total spending against the 80% combined limit because categories are untagged).
2. **Finance Goals tab:** the `current` field on `finance_goals` is currently manual. Could be auto-computed from `finance_income - finance_expenses` delta if goals are mapped to saving periods.
3. **Self-study chunk two:** Gemma-powered study plan generator. Needs a new edge function calling the Gemini API (`GEMINI_API_KEY` Supabase secret already exists from the bot). Verify current Gemini endpoint and live model string before building.
4. **3D museum:** separate public repo. three.js, GLB assets, Supabase Storage for models.
5. **Bot bridge:** bot reads hub tables via service_role so exam crunch can factor into the weekly schedule proposal.

---

## Edge functions (Supabase)

**`related-papers`** — proxies OpenAlex for the Research module. Returns related works for a DOI, falls back to title search. `via` field indicates which path was used. OpenAlex requires a free API key since Feb 2026 (stored as Supabase secret `OPENALEX_API_KEY`).

Deploy edge functions via the Supabase Dashboard editor (no CLI needed). Deno/TypeScript. Set "Verify JWT" OFF for public-data proxies. Invoke from the frontend via `sb.functions.invoke(name, { body })` -- this automatically attaches the apikey and JWT.

---

## Quick reference: adding a new module

1. Create `modulename.js` with `window.renderModuleName = function(container, sb) { ... }`.
2. Add a `<script src="modulename.js"></script>` tag to `index.html` before `app.js`.
3. Add an entry to the `MODULES` array in `app.js` with `lit: true`.
4. Add a routing branch in `openModule()` in `app.js`.
5. Add a signal card to `dashboard.js` (add the Supabase query to the `Promise.all`, compute the signal, add a card to the `cards` array).
6. Add a `.sql` file for any new tables to `sql/`, run in Supabase SQL Editor.
7. Add CSS under a new namespace (`.modname-*`) at the bottom of `styles.css`.
