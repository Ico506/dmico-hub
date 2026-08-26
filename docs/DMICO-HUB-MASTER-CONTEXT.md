# DMICO-HUB — Master Context (paste-in primer for a fresh Claude Cowork chat)

Last updated: 2026-07-12. This single file gives a new chat full context on Damico's
personal "life OS" (the hub) and its Discord bot. Read it top to bottom before doing
anything. It supersedes the older `dmico-hub/PROJECT-CONTEXT.md` (which is stale on
feature status but still correct on coordinates + deploy mechanics).

---

## 1. Who this is for (and how to work)

Damico (brand **DMICO**). Malaysian game designer and MPhil researcher (AR/VR + game
studies) at APU, ~6 years Unity/C#. Studio identity: **JadeFrog Studio** (keep
separate from the DMICO personal brand). Based in Sibu, Sarawak. GitHub user `ico506`.
Aesthetic: Muji + Ghibli, intentional living, warm earthy palette.

Working style (honor every reply):
- Deliver **complete files** (he drops them in and pushes via GitHub Desktop). No
  partial snippets. With folder access, edit files in place; that counts as complete.
- **Never use em dashes** (reads as AI-written). Use commas, periods, parentheses.
- End replies with the top-hat emoji. Never use the frog emoji as a sign-off.
- Humorous, direct, no fluff. No bullet walls in chat. One clear recommendation with
  reasoning, not a menu. No sycophancy; push back on weak ideas honestly.
- **Write a PRD before building anything non-trivial and get sign-off.** PRDs live in
  `PRD_Claude/dmico-hub_PRD/`.
- **Fact-check before committing** to architecture / model / API choices. Verify a
  live model string / endpoint before building on it.
- Explicit approval required for: DB schema changes, switching AI model/provider,
  modifying Google Calendar beyond what's specified, production data, deleting/
  overwriting unconfirmed files. Reversibility gate: show the plan, flag irreversible
  steps, wait for "proceed."

---

## 2. Architecture (the mental model)

**The hub is the cockpit; Discord is the voice.** Two surfaces, one shared backend.

1. **`dmico-hub`** — static HTML/JS single-page app on GitHub Pages. Auth-gated
   (Supabase email/password). A "lantern rail" of module tabs. This is the visual,
   browse-and-edit cockpit.
2. **`jadefrog-scheduler`** — Python + discord.py bot on Railway. The proactive voice:
   scheduled nudges, digests, reflections, NL capture, and it holds the credentials
   the frontend can't (Google Calendar, API keys). Runs a **singleton lock** so an
   overlapping redeploy can't double-fire loops.
3. **Supabase (`vlczjdqqpajkggzjlsqe`)** is the shared nervous system. Both read/write
   it. **Most personal data lives in `kv_store` (JSONB blobs by key), not the legacy
   Postgres tables.** Some domains still use dedicated tables (finance, research, etc.).

### Key patterns
- **Hub writes kv directly.** `window.dmicoKvGet(key)` / `window.dmicoKvSet(key, value)`
  in `app.js`. `kv_store` has an `authenticated full access` RLS policy, so the logged-in
  hub can read/write with no schema change. The bot reads the same keys live via
  `db.py` `kv_get` / `kv_set`.
- **Hub queues bot-side actions.** For anything needing bot credentials (calendar,
  RAWG/TMDb, running a curator, etc.), the hub calls `window.dmicoEnqueue(action)` which
  appends to kv key `hub_actions`. `hub_actions_service.py` drains that queue every ~30s
  server-side and applies each action, then refreshes snapshots. Action types include:
  `calendar_add/edit/delete`, `library_add/status/remove/plan`, `routine_save`,
  `ripple_apply`, `run_finance_review`, `run_plan/crunch/funweek`, `settings_save`,
  `run_curator` (domain: content|research|markets).
- **AI / model routing (important):**
  - New AI narration/curation uses **Gemma 4**, model string `gemma-4-26b-a4b-it`
    (env `GEMMA_MODEL`). The `-4b-it` bare variant 404s.
  - `GEMINI_MODEL` env routes the whole "Gemini 2.5" layer (~25 code paths: intent
    router, jade chat/voice, daily summary, reflections, journal summary, news). Keep
    it a **real Gemini model** (`gemini-2.5-flash`). It was once mis-set to a Gemma
    variant in Railway and silently broke that layer; now `gemini-2.5-flash`.
  - Curators use a decoupled `CURATOR_FALLBACK_MODEL` (default `gemini-2.5-flash`) so
    a Gemma failure recovers reliably regardless of `GEMINI_MODEL`.
  - All AI is Gemini API (Google AI Studio), one `GEMINI_API_KEY`.

### CRITICAL dev gotcha
The Cowork **sandbox bash mount serves STALE, TRUNCATED copies of edited files.**
`py_compile` / `node --check` on a freshly edited file often fails at a phantom EOF.
Do NOT trust those failures. Verify against true file state (the Read tool / editor)
plus isolated-copy compiles / unit tests of the new logic.

---

## 3. Project coordinates

- Hub repo: `ico506/dmico-hub` (public; GitHub Pages needs public, safe because no
  secrets ship in the frontend). Live: https://ico506.github.io/dmico-hub/
- Bot repo: `jadefrog-scheduler` (Python, deploys to Railway with full env).
- Supabase ref: `vlczjdqqpajkggzjlsqe` · URL `https://vlczjdqqpajkggzjlsqe.supabase.co`
  (bare host, never append `/rest/v1`).
- Hub Supabase publishable key lives once in `config.js` (`window.DMICO_CONFIG`);
  RLS-gated, safe to ship. Service_role key never goes in the frontend.
- Login email prefix: `damianyong506`.
- Edge functions: deploy from the Supabase Dashboard editor (Deno/TS, no CLI). Set
  "Verify JWT" OFF for public-data proxies.
- PWA: the hub is installable (manifest + `sw.js`). VAPID public key in `config.js`;
  private key + `VAPID_SUBJECT` are Railway env vars on the bot (it sends web push).

---

## 4. Repo file maps

### Hub (`dmico-hub`) — module render files, each exposes `window.render<Name>`
`index.html` (shell + script load order), `app.js` (shell: auth, lantern rail,
`openModule` router, `dmicoKvGet/Set/Enqueue`, NFC `#do=` dispatch, nudge init),
`config.js` (Supabase + VAPID public key), `styles.css`.
Modules: `dashboard.js` (Home), `week.js` (calendar week), `command.js` +
`interactions.js` (Control cockpit tab), `life.js` (mood/journal/reflections),
`research.js`, `curators.js` (Content/Research/Markets curator surface),
`self-study.js`, `hygiene.js`, `gamedev.js`, `finance.js` (big: Overview/Expenses/
Goals/Savings/Investments/Subscriptions/Review), `thesis.js`, `exercise.js`,
`entertainment.js`, `photos.js`, `groceries.js`, `ripple.js`.
PWA/nudge: `manifest.json`, `sw.js` (push + notificationclick), `push.js` (opt-in
subscribe), `nudge.js` (in-hub "what needs you" banner + tab count), `icon-192/512.png`.

### Bot (`jadefrog-scheduler`) — key files
Core: `bot.py` (commands, events, wiring, channel env reads), `scheduler.py` (daily
loops), `db.py` (pool + `kv_get/kv_set` + table DDL), `singleton_lock.py`,
`error_reporter.py`.
Calendar vNext: `calendar_service.py`, `routine_service.py`, `schedule_core.py`,
`schedule_proposal_service.py`, `smart_scheduler_service.py`, `crunch_planner.py`,
`ripple_service.py`, `week_snapshot.py`, `event_notifier_service.py`,
`event_nudge_service.py`, `hub_actions_service.py`.
Life/reflection: `life_service.py`, `journal_service.py`, `reflection_storage.py`,
`reflect_service.py`, `wellness_service.py`, `resurfacing_service.py`,
`hub_pulse_service.py` (morning brief), `hub_review.py`, `capture_service.py` (#capture NL).
AI/voice: `jade_chat.py` (`!jade` chat), `jade_voice.py` (persona voice),
`gemma_narrate.py`, `gemini_service.py`, `intelligence_service.py`,
`intent_router_service.py` (NL → classified intent → confirm → execute; the big one),
`profile_service.py`, `analyze_service.py`.
Curators: `curator_core.py` (engine), `content_curator.py`, `research_curator.py`,
`markets_curator.py`.
Finance: `finance_hub.py`, `finance_review.py`. Health: `workout_service.py`,
`weighin_nudge.py`, `hygiene_nudge.py`, `phone_check_service.py`. Domains:
`groceries_service.py`, `cook_service.py`, `games_service.py`, `entertainment_service.py`,
`news_service.py`, `research_service.py`, `mphil_service.py`, `hub_academics.py`,
`creative_service.py` (incl. `!crypto`), `tracker_service.py`, `notebook_service.py`,
`checklist_service.py`, `habit_service.py`, `pomodoro_service.py`, `reminder_service.py`,
`remind_service.py`, `utility_service.py`, `adherence_service.py`. Push: `web_push_service.py`.

---

## 5. Data model

### Supabase tables (Postgres, public schema)
`kv_store` (THE main store: key TEXT PK, value JSONB). Domain tables: `finance_expenses`,
`finance_income` (monthly allowance), `finance_surplus` (extra income), `finance_goals`,
`finance_settings` (opening_balance, monthly_budget, category_buckets), `finance_wishlist`,
`investments`, `crypto` (legacy; live crypto is kv `crypto_data`), `research_papers`,
`study_exams`, `thesis_chapters`, `thesis_writing_logs`, `gamedev_projects/ideas/logs/
milestones`, `museum_exhibits`, `groceries_items`, `groceries_shelf_defaults`,
`hygiene_items/products/routines`, `dashboard_photos`, `weight_logs`, `exercise_profile`,
`mood_logs`, `journal`, `reflections`, `gratitude`, `vents`, `wins`, `learn_entries`,
`notebook`, `devlog`, `media`, `birthdays`, `countdowns`, `cook_log`, plus bot state
tables (`pending_actions`, `phone_check_state`, `smart_scheduler_state`,
`resurfacing_state`, `week_wrap_state`).

### kv_store keys (the live personal data)
Shared hub+bot: `curator_profiles`, `curator_digest`, `curator_seen`(bot-only),
`finance_subscriptions`, `finance_savings`(hub), `finance_review_cfg/last`,
`hub_actions`, `week_calendar`(+`_next`), `routine_anchors`, `mood_data`, `journal_data`,
`reflections_data`, `profile_data`, `countdown_data`, `crypto_data`, `bot_settings`,
`push_subscriptions`, `hub_last_seen`, `focus_log`, `grocery_shopping_list`,
`nudge_seen`, and many bot domain blobs (`habits_data`, `workout_data`, `wins_data`,
`media_data`, `mphil_data`, `planning_data`, `pending_*`, etc.).

---

## 6. Feature inventory (current, working)

- **Calendar vNext:** routine-anchor backbone, unified planner, hub week view, ripple
  reschedule (a sudden event pushes the day's movable blocks forward; entertainment
  yields first; hub instant-preview + Discord `!ripple`), crunch planner, weekly
  proposal from reflections, nightly week snapshot.
- **Hub-as-cockpit (Control tab):** anchors editor, planning triggers, bot settings.
- **Life tab:** mood, prompt-driven journal, reflections (dual-surface hub+Discord).
- **Finance:** Overview (income allowance panel, Extra Income panel, 50/30/20 budget
  rule computed on ALLOWANCE ONLY, 6-month savings chart, projections), Expenses
  (smart-default category recall + autocomplete), Goals (with confetti on reach +
  "Log as expense" button), **Savings** (kv `finance_savings`: named pools, deposit/
  withdraw, targets; Extra Income can deposit straight into a pool), Investments,
  Subscriptions (kv; monthly total draws a faint "reserve for subs" marker on the
  Needs bar), Review (scheduled finance review). Financial rule: TRACK + INFORM ONLY,
  never trades or buy/sell advice.
- **Curators (Content/Research/Markets):** see section 8.
- **QoL batch:** subscriptions w/ auto-charge, finance review, focus log, Health/
  metabolism AM/PM, next-week toggle, Discord layer (#capture NL logging + `!jade`
  + nudges), NFC tap-action handler.
- **Smart Groceries:** inventory + freshness + Gemma "cook" button + cookbook +
  Sunday sweep (`!cook`, groceries.js, kv `grocery_shopping_list`).
- **Hub nudge (PWA):** installable app + ONE gentle 7pm web-push ("what's waiting":
  fresh digests + subs renewing within 2 days + pending actions) + in-hub banner +
  app-icon badge. Android, opt-in via the bell in the rail.
- **NFC:** `window.dmicoHandleNfc` dispatches `#do=<action>` (tab:<id>, focus, weighin,
  mood, reflect, expense, ripple, workout). Handler built; Damico has no chips yet —
  teach him to program tags when they arrive.

---

## 7. Bot commands + channels + env

Commands (`!`): calendar/schedule (`schedule`, `plan`, `propose`, `crunch`, `ripple`,
`routine`, `funweek`), reflection/life (`reflect`, `savereflection`, `reflectsummary`,
`streak`, `mood` via #mood, `grateful`, `wins`, `think`, `vibe`), curators (`scout`,
`rscout`, `market`), nudge (`nudge`), finance (`crypto`, `spendingsummary`), research/
academia (`mphil`, `paper`, `research`, `gdctalk`), games/media (`game`, `play`, `watch`,
`library`, `itch`, `deals`, `assets`, `gameidea`, `media`), focus (`focus`, `stopfocus`,
`pickup`), health (`workout`, `done`, `wstreak`, `progress`), utility (`remind`,
`reminders`, `countdown`, `birthday`, `learn`, `note`, `devlog`, `checklist`, `resurface`,
`intelligence`, `analyze`, `profile`, `news`, `cook`, `jade`, `jaderefresh`, `jadefrog`,
`help`, `test`).
Channels are env-driven `*_CHANNEL_ID` (SCHEDULER, DAILY_SUMMARY, HABIT, REFLECT,
NOTIFICATION, FINANCE, MOOD, CAPTURE=1521400173627179050, CONTENT=1521527256470786088,
RESEARCH_DIGEST=1521535390627004546, MARKETS=1521707718782619758, etc.).
Env highlights: `DISCORD_TOKEN`, `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL=
gemini-2.5-flash`, `GEMMA_MODEL=gemma-4-26b-a4b-it`, `CURATOR_FALLBACK_MODEL`,
`VAPID_PRIVATE_KEY`+`VAPID_SUBJECT`, calendar/RAWG/TMDb keys.

---

## 8. The Curator system (recent major build)

Proactive, taste-tuned agents. Reusable engine `curator_core.py`: fetch → dedupe (kv
`curator_seen`, FIFO 400) → curate (Gemma 4 primary + Gemini fallback, strict `<n>|<why>`
output, candidate cap 40) → deliver (Discord header + one msg per item so 👍/👎 maps to
one item; kv `curator_digest`) → learn (👍/👎 folds item gist into
`curator_profiles[domain].liked/disliked`). A "curator" is a dict config; each domain
is a small module.
- **Content** (`content_curator.py`): Reddit, Hacker News, Game Developer RSS, itch.io,
  arXiv, YouTube RSS. Daily 08:00. `!scout`.
- **Research** (`research_curator.py`): arXiv (cs.HC+cs.GR) + Crossref (keyless,
  `sort=relevance` + date filter to avoid future "Title Pending" junk). Daily 07:00.
  `!rscout`.
- **Markets** (`markets_curator.py`): portfolio snapshot (crypto via CoinGecko MYR +
  stocks/indices via Yahoo chart API + USD/MYR FX, unified MYR) + guardrailed market
  news. Weekday 07:30. `!market`. TRACK + INFORM ONLY, no advice.
Hub surface: `curators.js` multi-domain (Content/Research/Markets switcher, per-domain
taste editor + latest-digest card + 👍/👎). CRITICAL reliability fix: on LLM failure the
engine keeps items (doesn't mark seen) so nothing is silently lost.

---

## 9. Deploy + gotchas

- Hub: edit files in the local clone, review, push via GitHub Desktop, ~1 min for
  Pages, hard-refresh (favicons cache hard). Bot: push → Railway auto-deploys.
- kv/cache resets (e.g. clearing a polluted `curator_seen[domain]`) are done via the
  Supabase MCP `execute_sql` with explicit approval (production data gate).
- Known gotchas: stale bash mount (section 2); a `/rest/v1/auth/v1/token` 404 means
  `/rest/v1` got appended to the Supabase URL (use bare host); httplib2 (Google
  Calendar) is not thread-safe — the calendar service caches creds with a lock-guarded
  refresh but builds a fresh service per call, `static_discovery=True`.

---

## 10. Where the docs + memory live

- PRDs: `PRD_Claude/dmico-hub_PRD/` (curator-agents, research-curator, markets-curator,
  hub-nudge, smart-groceries, calendar-routine, hub-command-center, etc.).
- Persistent memory files (auto-loaded each session) capture the project state:
  bot-hub-bridge, curator-agents, hub-nudge, hygiene-supplies, calendar-routine,
  hub-command-center, ripple-reschedule, hub-qol-batch, smart-groceries, nfc-teaching,
  railway-env-vars, gemma4-model-preference, prd-file-location.

---

## 11. NEXT / forward direction — "Jarvis" voice assistant

Damico wants a Jarvis-style voice assistant built on the EXISTING hub + Discord. The
building blocks already exist, so this is a voice LAYER, not a rebuild:
- **Voice surface:** Discord already IS the voice. Discord supports voice channels
  (speech in/out) via `discord.py` voice + an STT (e.g. Whisper) and TTS.
- **Understanding + acting:** `intent_router_service.py` already does natural-language
  → classified intent → confirm → execute across most bot capabilities. A voice command
  can route through it. `hub_actions` lets voice trigger hub-side effects too.
- **Persona + chat:** `jade_chat.py` / `jade_voice.py` already define "Jade," the warm
  assistant persona, on Gemma/Gemini. Reuse the voice + persona; "Jarvis" may be a new
  persona or a rename.
- **Likely PRD scope when we start:** wake path (push-to-talk in a Discord voice channel
  or a hub mic button), STT → intent_router/jade → action + spoken TTS reply, and which
  commands are voice-enabled first. Fact-check STT/TTS options and Discord voice limits
  before committing. Financial + reversibility guardrails still apply.

Start any new session by reading this file, then the memory files, then confirm scope
with Damico before building. 🎩
